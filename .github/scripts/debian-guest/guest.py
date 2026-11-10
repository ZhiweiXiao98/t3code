"""Guest-only bootstrap. NEVER invoke locally; loaded by NoCloud after mounting payload."""
import base64, glob, hashlib, io, json, os, pathlib, pwd, shutil, subprocess, tarfile, threading, time, traceback
from common import validate_manifest, require, sha, run, unpack_tar, validate_results
BASE=pathlib.Path('/var/tmp/t3-validation')
RESULT=BASE/'results'
PAYLOAD=pathlib.Path('/mnt/t3-payload')

def serial_archive(root):
    buf=io.BytesIO()
    paths=[path for path in sorted(root.rglob('*')) if not path.is_symlink() and (path.is_file() or path.is_dir())]
    require(len(paths)<=1900 and sum(path.stat().st_size for path in paths if path.is_file())<=60*1024*1024,'Uncompressed report exceeds safe transport budget')
    with tarfile.open(fileobj=buf,mode='w:gz') as archive:
        # Do not follow symlinks or include unusual files in guest reports.
        for path in paths:
            if path.is_symlink() or not(path.is_file() or path.is_dir()):continue
            archive.add(path,arcname=str(path.relative_to(root)),recursive=False)
    packed=buf.getvalue()
    if len(packed)>16*1024*1024:
        raise ValueError('Result archive exceeds 16MiB')
    return (f'\nT3_RESULT_BEGIN {len(packed)} {hashlib.sha256(packed).hexdigest()}\n'.encode()+base64.encodebytes(packed)+b'\nT3_RESULT_END\n')

def write_all(writer,data,timeout=120):
    """Complete a bounded frame despite short/interrupted unbuffered writes."""
    view=memoryview(data);offset=0;deadline=time.monotonic()+timeout;interruptions=0
    if len(view)>24*1024*1024:raise ValueError('Transport frame exceeds bounded budget')
    while offset<len(view):
        if time.monotonic()>=deadline:raise TimeoutError('Result frame write deadline exceeded')
        chunk=view[offset:offset+32768]
        try:written=writer.write(chunk)
        except InterruptedError:
            interruptions+=1
            if interruptions>256:raise TimeoutError('Repeated interrupted result writes')
            continue
        if type(written) is not int or written<=0 or written>len(chunk):
            raise OSError('Result transport made no valid forward progress')
        offset+=written
    return offset

def emit(root):
    try:data=serial_archive(root)
    except Exception as error:
        small=BASE/'overflow';small.mkdir(exist_ok=True)
        (small/'status.json').write_text(json.dumps({'result':'failed','exitCode':1,'error':str(error)}))
        data=serial_archive(small)
    with open('/dev/virtio-ports/org.t3.result','wb',buffering=0) as serial:write_all(serial,data)

def capture(command):
    return subprocess.check_output(command,stderr=subprocess.STDOUT,text=True,timeout=30)

def observer(stop,exe,m):
    evidence={'observed':False,'artifactSha256':m['appimageSha256'],'method':'nonroot process exe + APPIMAGE environment + fuse mountinfo'}
    while not stop.wait(.2):
        for proc in pathlib.Path('/proc').glob('[0-9]*'):
            try:
                if proc.stat().st_uid!=65534:continue
                env=(proc/'environ').read_bytes().split(b'\0')
                if ('APPIMAGE='+str(exe)).encode() not in env:continue
                target=os.readlink(proc/'exe')
                if '/.mount_' not in target:continue
                lines=(proc/'mountinfo').read_text().splitlines()
                matches=[line for line in lines if ' - fuse' in line and '/.mount_' in line and target.startswith(line.split()[4]+'/')]
                if not matches:continue
                evidence.update(observed=True,pid=int(proc.name),uid=65534,exe=target,mountinfo=matches)
                (RESULT/'fuse.json').write_text(json.dumps(evidence,indent=2))
                return
            except (OSError,ValueError):continue
    if not evidence['observed']:(RESULT/'fuse.json').write_text(json.dumps(evidence))

def main():
    require(os.geteuid()==0 and pathlib.Path('/run/cloud-init').exists(),'Guest cloud-init context required')
    require(not BASE.exists(),'Fresh guest working directory required')
    BASE.mkdir();RESULT.mkdir()
    status={'result':'failed','exitCode':1,'phase':'initialization'}
    m=None;stop=threading.Event();watch=None
    try:
        m=validate_manifest(json.loads((PAYLOAD/'manifest.json').read_text()))
        status.update(sourceSha=m['sourceSha'],appimageSha256=m['appimageSha256'],cleanDriverSha256=m['cleanDriverSha256'],cjkDriverSha256=m['cjkDriverSha256'])
        require(sha(PAYLOAD/'app.AppImage')==m['appimageSha256'],'AppImage mismatch')
        require(sha(PAYLOAD/'clean.mjs')==m['cleanDriverSha256'],'Clean driver mismatch')
        require(sha(PAYLOAD/'cjk.mjs')==m['cjkDriverSha256'],'CJK driver mismatch')
        require((PAYLOAD/'playwright.tgz').stat().st_size==m['playwrightSize'] and sha(PAYLOAD/'playwright.tgz')==m['playwrightTreeSha256'],'Playwright archive size/hash mismatch')
        require(not glob.glob('/etc/ssh/ssh_host_*'),'Guest unexpectedly has SSH host keys')
        user=pwd.getpwnam('nobody');require(user.pw_uid==65534 and user.pw_gid>0,'Missing stock nobody account')
        require('ID=debian' in pathlib.Path('/etc/os-release').read_text(),'Not Debian')
        status['phase']='official-package-dependencies'
        packages=['nodejs','xvfb','xauth','dbus-x11','fontconfig','fonts-noto-cjk','libfuse2t64','fuse3','libgtk-3-0t64','libnss3','libgbm1','libasound2t64','libxss1','libx11-xcb1','libxshmfence1','libdrm2','libxkbcommon0','libcups2t64','libatk-bridge2.0-0t64','libsecret-1-0','libnotify4','libuuid1','libxtst6','xdg-utils']
        with open(RESULT/'apt.log','wb') as log:
            run(['apt-get','update'],300,stdout=log,stderr=subprocess.STDOUT)
            run(['apt-get','install','--no-install-recommends','-y',*packages],900,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'DEBIAN_FRONTEND':'noninteractive'})
        # No T3 DEB, T3 helper or prior profile is installed by this bootstrap.
        package_list=capture(['dpkg-query','-W','-f=${Package}\t${Version}\n'])
        require(not any(line.split('\t')[0].lower() in ('t3code','t3-code') for line in package_list.splitlines()),'Unexpected preinstalled T3 package')
        (RESULT/'packages.txt').write_text(package_list)
        require(not glob.glob('/etc/ssh/ssh_host_*'),'Package setup unexpectedly generated SSH keys')
        require(tuple(map(int,capture(['getconf','GNU_LIBC_VERSION']).strip().split()[-1].split('.'))) >= (2,39),'glibc below artifact requirement')
        status['phase']='nonroot-preflight'
        work=BASE/'work';work.mkdir();home=work/'home';home.mkdir()
        for path in [work,home,RESULT]:os.chown(path,user.pw_uid,user.pw_gid)
        env={'PATH':'/usr/bin:/bin','HOME':str(home),'LANG':'C.UTF-8','LC_ALL':'C.UTF-8','GITHUB_ACTIONS':'true','CI':'true','RUNNER_OS':'Linux','DEBUG':'pw:browser*','ELECTRON_ENABLE_LOGGING':'1'}
        prefix=['runuser','-u','nobody','--','env','-i',*[f'{k}={v}' for k,v in env.items()]]
        require(pathlib.Path('/dev/fuse').exists(),'FUSE unavailable in stock kernel')
        preflight=capture(prefix+['sh','-c','id; test "$(id -u)" -ne 0 && test -r /dev/fuse && test -w /dev/fuse && unshare -Ur true && getconf GNU_LIBC_VERSION'])
        (RESULT/'preflight.txt').write_text(preflight+'\n'+capture(['uname','-a'])+'\n'+pathlib.Path('/etc/os-release').read_text())
        values={}
        for key in ('kernel/unprivileged_userns_clone','kernel/apparmor_restrict_unprivileged_userns','user/max_user_namespaces'):
            f=pathlib.Path('/proc/sys')/key;values[key]=f.read_text().strip() if f.exists() else None
        values['apparmor_enabled']=pathlib.Path('/sys/module/apparmor/parameters/enabled').read_text().strip() if pathlib.Path('/sys/module/apparmor/parameters/enabled').exists() else None
        (RESULT/'security-defaults.json').write_text(json.dumps(values,indent=2))
        exe=work/'app.AppImage';shutil.copyfile(PAYLOAD/'app.AppImage',exe);exe.chmod(0o755)
        unpack_tar(PAYLOAD/'playwright.tgz',work/'pw')
        pw=work/'pw/package/index.mjs';require(pw.is_file(),'Expected npm playwright-core package layout')
        pkg=json.loads((work/'pw/package/package.json').read_text());require(pkg['name']=='playwright-core' and pkg['version']=='1.60.0','Wrong Playwright package')
        node_major=int(capture(['node','--version']).strip().lstrip('v').split('.')[0]);require(node_major>=20,'Playwright requires modern Node')
        cjk=RESULT/'cjk';clean=RESULT/'clean';cjk.mkdir();clean.mkdir()
        fonts={'distro':pathlib.Path('/etc/os-release').read_text(),'font_match':capture(['fc-match',':lang=zh-cn']),'noto_package':capture(['dpkg-query','-W','fonts-noto-cjk'])}
        (cjk/'font-evidence.json').write_text(json.dumps(fonts,indent=2))
        for path in RESULT.rglob('*'):os.chown(path,user.pw_uid,user.pw_gid)
        watch=threading.Thread(target=observer,args=(stop,exe,m),daemon=True);watch.start()
        status['phase']='clean-first-start'
        with open(RESULT/'clean-driver.log','wb') as log:
            run(prefix+['dbus-run-session','--','xvfb-run','-a','node',str(PAYLOAD/'clean.mjs'),'--platform','Linux','--executable',str(exe),'--playwright-module',str(pw),'--artifacts-dir',str(clean)],300,stdout=log,stderr=subprocess.STDOUT)
        status['phase']='chinese-persistence'
        with open(RESULT/'cjk-driver.log','wb') as log:
            run(prefix+['dbus-run-session','--','xvfb-run','-a','node',str(PAYLOAD/'cjk.mjs'),'--manifest',str(PAYLOAD/'manifest.json'),'--kind','appimage','--asset',str(exe),'--executable',str(exe),'--playwright-module',str(pw),'--artifacts-dir',str(cjk)],360,stdout=log,stderr=subprocess.STDOUT)
        stop.set();watch.join(5)
        require(sha(exe)==m['appimageSha256'],'AppImage changed during test')
        require(not glob.glob('/etc/ssh/ssh_host_*'),'Guest generated SSH keys')
        status.update(result='passed',exitCode=0,phase='acceptance',execution={'id':'debian','versionId':'13','glibc':capture(['getconf','GNU_LIBC_VERSION']).strip(),'uid':user.pw_uid,'executableSha256':sha(exe),'architecture':capture(['uname','-m']).strip(),'securityDefaultsMember':'results/security-defaults.json'})
        (RESULT/'status.json').write_text(json.dumps(status))
        validate_results(RESULT,m)
        status['phase']='complete'
    except Exception as error:
        status.update(result='failed',exitCode=1,error=str(error))
        (RESULT/'failure.txt').write_text(traceback.format_exc())
    finally:
        stop.set()
        if watch:watch.join(5)
        (RESULT/'status.json').write_text(json.dumps(status,indent=2))
        emit(RESULT)
    return status['exitCode']

if __name__=='__main__':
    raise SystemExit(main())

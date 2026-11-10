"""Disabled-by-default host proposal. No execution without --execute-authorized."""
import argparse, hashlib, importlib, json, os, pathlib, shutil, signal, subprocess, sys, time, urllib.request, urllib.error, zipfile
from common import *
from decode_serial import decode
HERE=pathlib.Path(__file__).resolve().parent

def api(path):
    headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'t3-read-only-release-validation'}
    if os.environ.get('GITHUB_TOKEN'):headers['Authorization']='Bearer '+os.environ['GITHUB_TOKEN']
    # GitHub JSON endpoints only, no signed-download redirects carrying authorization.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    request=urllib.request.Request('https://api.github.com'+path,headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(request,timeout=60) as response:
        return json.load(response)

def fetch_image(target):
    # No auth header or credentials are sent to Debian.
    with urllib.request.urlopen(IMAGE_URL,timeout=120) as response,open(target,'wb') as out:
        require(response.url.startswith('https://'),'Non-HTTPS image redirect')
        total=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            total+=len(chunk);require(total<=2*1024**3,'Image download exceeds 2GiB')
            out.write(chunk)
    require(sha(target,'sha512')==IMAGE_SHA,'Actual Debian image SHA512 mismatch')

def validate_source(checkout,m):
    def git(*args):return subprocess.check_output(['git','-C',str(checkout),*args],text=True,timeout=60).strip()
    require(git('rev-parse','HEAD')==m['sourceSha'],'Wrong source checkout')
    require(git('rev-parse','HEAD^{tree}')==m['sourceTree'],'Wrong source tree')
    require(not git('status','--porcelain','--untracked-files=no'),'Source checkout is modified')
    driver=pathlib.Path(checkout)/'.github/scripts/check-clean-desktop-first-start.mjs'
    require(sha(driver)==CLEAN_SHA,'Exact strengthened driver missing')
    return driver

def read_zip_text(archive,name):
    info=archive.getinfo(name);require(info.file_size<=1024*1024,'Oversized proof file')
    return archive.read(name).decode('utf-8')

def sums(text):
    result={}
    for line in text.splitlines():
        match=re.fullmatch(r'([0-9a-f]{64}) [ *](.+)',line)
        require(match is not None,'Malformed checksum evidence')
        name=safe_name(match[2]);require(name not in result,'Duplicate checksum evidence')
        result[name]=match[1]
    return result

def extract_artifact(zip_path,proof_zip_path,payload,m):
    require(sha(zip_path)==m['artifactZipSha256'],'Local installer ZIP mismatch')
    require(sha(proof_zip_path)==m['proofZipSha256'],'Local proof ZIP mismatch')
    with zipfile.ZipFile(proof_zip_path) as proof:
        names=proof.namelist();require(len(names)==len(set(names)),'Duplicate proof ZIP entries')
        require(read_zip_text(proof,'source-sha.txt').strip()==m['sourceSha'],'Proof source SHA mismatch')
        require(read_zip_text(proof,'source-tree.txt').strip()==m['sourceTree'],'Proof source tree mismatch')
        require(sums(read_zip_text(proof,'driver.sha256'))=={'.github/scripts/check-clean-desktop-first-start.mjs':CLEAN_SHA},'Proof strengthened driver mismatch')
        installers=sums(read_zip_text(proof,'installers.sha256'))
        require(installers.get(m['appimageProofPath'])==m['appimageSha256'],'Proof AppImage hash mismatch')
        require(pathlib.PurePosixPath(m['appimageProofPath']).name==pathlib.PurePosixPath(m['appimageZipPath']).name,'Proof/ZIP filename mismatch')
        (payload/'verified-build-proof.json').write_text(json.dumps({'sourceSha':m['sourceSha'],'sourceTree':m['sourceTree'],'driverSha256':CLEAN_SHA,'installers':installers},indent=2))
    with zipfile.ZipFile(zip_path) as archive:
        infos=archive.infolist();require(len(infos)<10000,'Too many artifact ZIP entries')
        names=[safe_name(i.filename.rstrip('/')) for i in infos]
        require(len(set(names))==len(names),'Duplicate ZIP names')
        selected=[i for i in infos if i.filename==m['appimageZipPath']]
        require(len(selected)==1 and selected[0].file_size<=2*1024**3,'Missing/oversized AppImage')
        with archive.open(selected[0]) as source,open(payload/'app.AppImage','wb') as target:
            shutil.copyfileobj(source,target,1024*1024)
    require(sha(payload/'app.AppImage')==m['appimageSha256'],'AppImage bytes mismatch')

def download_job_log(repo,job_id):
    headers={'Accept':'application/vnd.github+json','User-Agent':'t3-read-only-release-validation'}
    if os.environ.get('GITHUB_TOKEN'):headers['Authorization']='Bearer '+os.environ['GITHUB_TOKEN']
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    request=urllib.request.Request(f'https://api.github.com/repos/{repo}/actions/jobs/{job_id}/logs',headers=headers)
    try:
        response=urllib.request.build_opener(NoRedirect()).open(request,timeout=60)
    except urllib.error.HTTPError as error:
        require(error.code==302,'Job log API did not return signed redirect')
        url=error.headers['Location'];require(url.startswith('https://'),'Insecure job log redirect')
        response=urllib.request.urlopen(url,timeout=60) # intentionally NO authorization header
    with response:
        data=response.read(64*1024*1024+1)
    require(len(data)<=64*1024*1024,'Job log exceeds limit')
    return data.decode('utf-8')

def seed_config(payload_hashes):
    # Dedicated virtio serial is isolated from console output and UART baud limits.
    code='''import base64,hashlib,io,json,os,pathlib,subprocess,sys,tarfile,tempfile,traceback,time
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
p=pathlib.Path('/mnt/t3-payload')
rc=1
try:
 p.mkdir(exist_ok=True)
 subprocess.run(['mount','-o','ro','/dev/disk/by-label/T3PAYLOAD',str(p)],check=True,timeout=30)
 expected=PAYLOAD_HASHES
 for name,digest in expected.items():
  assert hashlib.sha256((p/name).read_bytes()).hexdigest()==digest,'Payload mismatch: '+name
 sys.path.insert(0,str(p))
 import guest
 rc=guest.main()
except BaseException as error:
 rc=1
 print('T3 seed entry failed: '+traceback.format_exc(limit=6)[-4096:],file=sys.stderr)
 try:
  b=json.dumps({'result':'failed','exitCode':1,'phase':'seed-entry','error':str(error)[:2048]}).encode()
  buf=io.BytesIO()
  with tarfile.open(fileobj=buf,mode='w:gz') as t:
   info=tarfile.TarInfo('status.json');info.size=len(b);t.addfile(info,io.BytesIO(b))
  packed=buf.getvalue()
  with open('/dev/virtio-ports/org.t3.result','wb',buffering=0) as s:
   write_all(s,('\\nT3_RESULT_BEGIN %d %s\\n'%(len(packed),hashlib.sha256(packed).hexdigest())).encode()+base64.encodebytes(packed)+b'\\nT3_RESULT_END\\n')
 except BaseException as transport_error:
  print('T3 failure frame unavailable: '+str(transport_error)[:2048],file=sys.stderr)
finally:
 # Cleanup must run even when the only permitted result transport is unavailable.
 # Poweroff is never proof of success; absent/partial frames still fail on the host.
 try:
  subprocess.run(['systemctl','poweroff'],check=True,timeout=15)
 except BaseException as cleanup_error:
  rc=1
  print('T3 guest poweroff failed: '+str(cleanup_error)[:2048],file=sys.stderr)
sys.exit(rc)
'''.replace('PAYLOAD_HASHES',repr(payload_hashes))
    return {'users':[],'ssh_deletekeys':False,'ssh_genkeytypes':[], 'allow_public_ssh_keys':False,'ssh_publish_hostkeys':{'enabled':False},'write_files':[{'path':'/run/t3-entry.py','permissions':'0644','content':code}],'runcmd':[['python3','/run/t3-entry.py']]}

def choose_accelerator():
    # Only already-available access, with no probe that boots a guest or modifies access.
    # An inaccessible/absent device selects TCG; denied ioctl at runtime is a blocker.
    if os.path.exists('/dev/kvm'):
        try:
            import fcntl
            fd=os.open('/dev/kvm',os.O_RDWR|os.O_CLOEXEC)
            try:
                if fcntl.ioctl(fd,0xAE00,0)==12:return ['-accel','kvm','-cpu','host']
            finally:os.close(fd)
        except (PermissionError,OSError):pass
    return ['-accel','tcg,thread=multi','-cpu','max']

def await_frame(process,serial,deadline_seconds,logs=()):
    end=time.monotonic()+deadline_seconds
    while time.monotonic()<end:
        for logfile,limit in logs:
            require(not logfile.exists() or logfile.stat().st_size<=limit,'Diagnostic log size limit exceeded')
        require(shutil.disk_usage(serial.parent).free>=1024**3,'Host free disk below 1GiB safety reserve')
        if serial.exists():
            require(serial.stat().st_size<=64*1024*1024,'Serial output too large')
            if b'\nT3_RESULT_END\n' in serial.read_bytes().replace(b'\r\n',b'\n'):return
        if process.poll() is not None:raise RuntimeError('QEMU exited before complete result frame')
        time.sleep(1)
    raise TimeoutError('Guest result deadline exceeded')

def main():
    parser=argparse.ArgumentParser()
    for option in ('manifest','source-checkout','artifact-zip','proof-zip','playwright-tar','workdir'):parser.add_argument('--'+option,required=True)
    parser.add_argument('--execute-authorized',action='store_true')
    args=parser.parse_args()
    m=validate_manifest(json.loads(pathlib.Path(args.manifest).read_text()))
    require(args.execute_authorized,'DISABLED: explicit activation required')
    require(os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_OS')=='Linux','Standard Actions Linux runner required')
    require(os.geteuid()!=0,'QEMU must not run as root')
    release=pathlib.Path('/etc/os-release').read_text()
    require('ID=ubuntu' in release and 'VERSION_ID="24.04"' in release,'Host must be Ubuntu24.04')
    require(os.environ.get('T3_STANDARD_RUNNER_LABEL')=='ubuntu-24.04','Explicit standard runner label required')
    work=pathlib.Path(args.workdir).resolve();require(not any(c in str(work) for c in ',\n\r'),'Unsafe QEMU work path');require(not work.exists(),'Workdir must be new');work.mkdir()
    require(shutil.disk_usage(work).free>=9*1024**3,'Need at least 9GiB actual free disk')
    for command in ('qemu-system-x86_64','qemu-img','genisoimage'):require(shutil.which(command),'Install official Ubuntu package providing '+command)
    driver=validate_source(args.source_checkout,m)
    require(pathlib.Path(args.playwright_tar).stat().st_size==m['playwrightSize'] and sha(args.playwright_tar)==m['playwrightTreeSha256'],'Playwright input tar size/hash mismatch')
    require('sha512-'+base64.b64encode(bytes.fromhex(sha(args.playwright_tar,'sha512'))).decode()==m['playwrightIntegrity'],'Playwright official SRI mismatch')
    require(sha(HERE/'check-debian-cjk-ui.mjs')==CJK_SHA,'CJK proposal changed')
    base='/repos/'+m['repository']
    evidence={'repo':api(base),'run':api(base+f"/actions/runs/{m['producerRunId']}/attempts/{m['producerRunAttempt']}"),'job':api(base+f"/actions/jobs/{m['producerJobId']}"),'artifact':api(base+f"/actions/artifacts/{m['artifactId']}"),'ubuntuJob':api(base+f"/actions/jobs/{m['ubuntu24JobId']}"),'proofArtifact':api(base+f"/actions/artifacts/{m['proofArtifactId']}")}
    validate_producer(m,evidence['repo'],evidence['run'],evidence['job'],evidence['artifact'],evidence['ubuntuJob'],evidence['proofArtifact'])
    job_log=download_job_log(m['repository'],m['producerJobId']);validate_upload_logs(m,evidence['job'],job_log,[evidence['artifact'],evidence['proofArtifact']])
    (work/'producer-job.log').write_text(job_log)
    (work/'github-evidence.json').write_text(json.dumps(evidence,indent=2))
    payload=work/'payload';payload.mkdir();extract_artifact(args.artifact_zip,args.proof_zip,payload,m)
    shutil.copyfile(driver,payload/'clean.mjs');shutil.copyfile(HERE/'check-debian-cjk-ui.mjs',payload/'cjk.mjs');shutil.copyfile(args.playwright_tar,payload/'playwright.tgz')
    for name in ('common.py','guest.py','png_validation.py'):shutil.copyfile(HERE/name,payload/name)
    (payload/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
    hashes={f.name:sha(f) for f in payload.iterdir()}
    seed=work/'seed';seed.mkdir();config=seed_config(hashes)
    (seed/'user-data').write_text('#cloud-config\n'+json.dumps(config,ensure_ascii=False,indent=2))
    (seed/'meta-data').write_text('instance-id: t3-'+m['sourceSha']+'\nlocal-hostname: t3-validation\n')
    for folder,label,dest in ((payload,'T3PAYLOAD',work/'payload.iso'),(seed,'cidata',work/'seed.iso')):
        run(['genisoimage','-quiet','-output',str(dest),'-volid',label,'-joliet','-rock',str(folder)],90)
    image=work/'base.qcow2';fetch_image(image)
    run(['qemu-img','create','-f','qcow2','-F','qcow2','-b',str(image),str(work/'guest.qcow2'),'10G'],30)
    accel=choose_accelerator()
    provenance={'manifestSha256':sha(payload/'manifest.json'),'imageSha512':sha(image,'sha512'),'payloadIsoSha256':sha(work/'payload.iso'),'seedIsoSha256':sha(work/'seed.iso'),'payloadFiles':hashes,'accelerator':accel}
    (work/'host-provenance.json').write_text(json.dumps(provenance,indent=2))
    command=['qemu-system-x86_64',*accel,'-m','4096','-smp','2','-display','none','-monitor','none','-serial','file:'+str(work/'console.log'),'-device','virtio-serial-pci','-chardev','file,id=t3result,path='+str(work/'serial.log'),'-device','virtserialport,chardev=t3result,name=org.t3.result','-nic','user,model=virtio-net-pci','-drive','file='+str(work/'guest.qcow2')+',format=qcow2,if=virtio','-drive','file='+str(work/'seed.iso')+',media=cdrom,readonly=on','-drive','file='+str(work/'payload.iso')+',media=cdrom,readonly=on','-no-reboot']
    process=None
    try:
        with open(work/'qemu.log','wb') as log:
            process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            await_frame(process,work/'serial.log',2400,[(work/'console.log',32*1024*1024),(work/'qemu.log',16*1024*1024)])
            decode(work/'serial.log',work/'results')
            validate_results(work/'results',m)
    finally:
        if process and process.poll() is None:
            os.killpg(process.pid,signal.SIGTERM)
            try:process.wait(timeout=15)
            except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
    print('Debian13 guest validation passed; this is NOT an Ubuntu AppImage result')

if __name__=='__main__':main()

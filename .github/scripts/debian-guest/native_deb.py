"""Disabled native Ubuntu24 DEB clean/CJK lane using exact current-run inputs."""
import argparse,json,os,pathlib,shutil,subprocess
from common import *
from host import validate_source,bounded_operation
from live_io import context,snapshot,validate_snapshot,validate_pair,emit_provenance
from guest import collect_diagnostics
HERE=pathlib.Path(__file__).resolve().parent

def main(a):
    require(a.execute_authorized,'Disabled proposal')
    require(os.geteuid()!=0 and os.environ.get('GITHUB_ACTIONS')=='true','Nonroot Actions required')
    inputs=pathlib.Path(a.inputs);m=json.loads((inputs/'manifest.json').read_text());require(m['kind']=='deb' and m['mode']=='same-full-run-native-deb-v1','Wrong native mode')
    work=pathlib.Path(a.work);require(not work.exists(),'Fresh native work directory required');work.mkdir();results=work/'results';results.mkdir()
    clean=results/'clean';cjk=results/'cjk';clean.mkdir();cjk.mkdir()
    ctx=context(m);before,log=snapshot(m);validate_snapshot(ctx,before,m,log)
    (work/'github-evidence.json').write_text(json.dumps(before,indent=2));(work/'producer-job.log').write_text(log)
    driver=validate_source(a.source,m);asset=inputs/'installer.deb';require(sha(asset)==m['installerSha256'],'DEB bytes mismatch')
    appenv={k:v for k,v in os.environ.items() if k not in ('GITHUB_TOKEN','GH_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')}
    appenv.update(DEBUG='pw:browser*',ELECTRON_ENABLE_LOGGING='1')
    status={'result':'failed','exitCode':1,'sourceSha':m['sourceSha'],'appimageSha256':m['appimageSha256'],'cleanDriverSha256':CLEAN_SHA,'cjkDriverSha256':CJK_SHA}
    try:
        distro=dict(line.split('=',1) for line in pathlib.Path('/etc/os-release').read_text().splitlines() if '=' in line)
        require(distro['ID']=='ubuntu' and distro['VERSION_ID'].strip('"')=='24.04','Wrong native OS')
        package=subprocess.check_output(['dpkg-deb','-f',str(asset),'Package'],text=True).strip();require(package in ('t3code','t3-code'),'Unexpected DEB package name')
        run(['sudo','apt-get','install','-y',str(asset)],300)
        exe=pathlib.Path(shutil.which('t3code')).resolve();owner=subprocess.check_output(['dpkg-query','-S',str(exe)],text=True).strip().split(': ')[0];require(owner==package,'Installed executable ownership mismatch')
        m.update(debPackage=package,installedExecutable=str(exe),executableSha256=sha(exe));validate_manifest(m)
        (work/'native-manifest.json').write_text(json.dumps(m,indent=2));(results/'installed-package.txt').write_text(subprocess.check_output(['dpkg-query','-W',package],text=True))
        require(sha(inputs/'playwright.tgz')==m['playwrightTreeSha256'],'Playwright mismatch');unpack_tar(inputs/'playwright.tgz',work/'pw');pw=work/'pw/package/index.mjs'
        fonts={'distro':pathlib.Path('/etc/os-release').read_text(),'font_match':subprocess.check_output(['fc-match',':lang=zh-cn'],text=True),'noto_package':subprocess.check_output(['dpkg-query','-W','fonts-noto-cjk'],text=True)}
        (cjk/'font-evidence.json').write_text(json.dumps(fonts,indent=2))
        with open(results/'clean-driver.log','wb') as f:run(['dbus-run-session','--','xvfb-run','-a','node',str(driver),'--executable',str(exe),'--platform','Linux','--playwright-module',str(pw),'--artifacts-dir',str(clean)],300,stdout=f,stderr=subprocess.STDOUT,env=appenv)
        with open(results/'cjk-driver.log','wb') as f:run(['dbus-run-session','--','xvfb-run','-a','node',str(HERE/'check-debian-cjk-ui.mjs'),'--manifest',str(work/'native-manifest.json'),'--kind','deb','--asset',str(asset),'--executable',str(exe),'--playwright-module',str(pw),'--artifacts-dir',str(cjk)],360,stdout=f,stderr=subprocess.STDOUT,env=appenv)
        require(sha(exe)==m['executableSha256'] and sha(asset)==m['installerSha256'],'Inputs changed during validation')
        security={}
        for key in ('kernel/unprivileged_userns_clone','kernel/apparmor_restrict_unprivileged_userns','user/max_user_namespaces'):
            f=pathlib.Path('/proc/sys')/key;security[key]=f.read_text().strip() if f.exists() else None
        f=pathlib.Path('/sys/module/apparmor/parameters/enabled');security['apparmor_enabled']=f.read_text().strip() if f.exists() else None
        (results/'security-defaults.json').write_text(json.dumps(security,indent=2))
        status.update(result='passed',exitCode=0,execution={'id':'ubuntu','versionId':'24.04','glibc':subprocess.check_output(['getconf','GNU_LIBC_VERSION'],text=True).strip(),'uid':os.geteuid(),'executableSha256':sha(exe),'architecture':subprocess.check_output(['uname','-m'],text=True).strip(),'securityDefaultsMember':'results/security-defaults.json'})
        (results/'status.json').write_text(json.dumps(status,indent=2));validate_results(results,m)
        validate_source(a.source,m);require(sha(HERE/'check-debian-cjk-ui.mjs')==CJK_SHA,'Typed driver changed during native run')
        after,after_log=snapshot(m);validate_pair(ctx,before,after,m,log,after_log);(work/'github-evidence-after.json').write_text(json.dumps(after,indent=2))
    except BaseException:
        status.update(result='failed',exitCode=1);raise
    finally:
        try:collect_diagnostics(results)
        except Exception as error:
            (results/'diagnostics.json').write_text(json.dumps({'status':'collection-failed','errorType':type(error).__name__}))
        (results/'status.json').write_text(json.dumps(status,indent=2))
    # Diagnostics and final status are evidence producers too.
    emit_provenance(work,m,before)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--inputs',required=True);p.add_argument('--source',required=True);p.add_argument('--work',required=True);p.add_argument('--execute-authorized',action='store_true');a=p.parse_args();bounded_operation(lambda:main(a))

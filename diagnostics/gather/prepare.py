"""One exact-package attempt using only Ubuntu's signed official repositories."""
import json, os, pathlib, subprocess, sys
from common import VERSION, PACKAGES, BoundError, environment, check_environment, require, run, install_handlers

def apt(options, arguments, cap):
    # The root-side watchdog bounds root descendants even if sudo forwarding fails.
    return run(['sudo','timeout','--signal=TERM','--kill-after=2s',str(cap-4)+'s','apt-get',*options,*arguments],cap,1024**2)

def main():
    work=pathlib.Path(sys.argv[1]); public=pathlib.Path(sys.argv[2]); work.mkdir(); public.mkdir()
    result={'schemaVersion':1,'exactQemuVersion':VERSION,'status':'exact_package_setup_unavailable_stop','applicationAcceptance':False}
    try:
        install_handlers()
        require(os.geteuid()!=0 and os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted','environment')
        check_environment(environment(),False)
        sources=work/'ubuntu.sources.list'; lists=work/'lists'; lists.mkdir()
        sources.write_text('deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://archive.ubuntu.com/ubuntu noble main universe\ndeb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://archive.ubuntu.com/ubuntu noble-updates main universe\ndeb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://security.ubuntu.com/ubuntu noble-security main universe\n')
        options=['-o','Dir::Etc::sourcelist='+str(sources),'-o','Dir::Etc::sourceparts=-','-o','Dir::State::lists='+str(lists),'-o','Acquire::Retries=0','-o','Acquire::https::Timeout=15','-o','Dpkg::Use-Pty=0']
        rc,_,_=apt(options,['update'],60); require(rc==0,'setup')
        exact=[p+'='+VERSION for p in PACKAGES]+['genisoimage']
        rc,out,err=apt(options,['--simulate','--no-install-recommends','install',*exact],30)
        require(rc==0 and b'Remv ' not in out and b'DOWNGRADED' not in out+err,'setup')
        rc,_,_=apt(options,['--yes','--no-remove','--no-install-recommends','install',*exact],150); require(rc==0,'setup')
        for package in PACKAGES:
            rc,out,err=run(['dpkg-query','-W','-f=${Version}',package],5)
            require(rc==0 and not err and out.decode()==VERSION,'package_version')
        result['status']='exact_packages_verified'
    except (BoundError,OSError,ValueError):
        pass
    (public/'preparation.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    return 0 if result['status']=='exact_packages_verified' else 1
if __name__=='__main__':
    raise SystemExit(main())

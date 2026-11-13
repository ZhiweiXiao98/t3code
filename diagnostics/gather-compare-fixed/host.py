"""Exactly one native gate and at most one original-configuration TCG guest."""
import argparse, base64, json, os, pathlib, re, shutil, signal, subprocess, time
from common import *

BRANCH='validation/v0.1.9-gather-fixed-20261113'
FILES=('probe.c','probe.S','build.sh','run_probe.py','test_probe.py','common.py','guest.py','host.py','prepare.py','test_wrapper.py','build_diag.py','test_diag.py')

def verify_sources():
    manifest=loads((HERE/'manifest.json').read_bytes())
    require(set(manifest)=={'schemaVersion','probeReviewManifestSha256','files'} and type(manifest['schemaVersion']) is int and manifest['schemaVersion']==1 and manifest['probeReviewManifestSha256']==PROBE_MANIFEST,'source_identity')
    require(set(manifest['files'])==set(FILES),'source_identity')
    for name in FILES:
        require(digest(manifest['files'][name]) and sha(HERE/name)==manifest['files'][name],'source_identity')
    return manifest['files']

def command(work, executable):
    return [executable,'-accel','tcg,thread=multi','-cpu','max','-m','4096','-smp','2','-display','none','-monitor','none','-serial','file:'+str(work/'console.log'),'-device','virtio-serial-pci','-chardev','file,id=t3result,path='+str(work/'serial.log'),'-device','virtserialport,chardev=t3result,name=org.t3.result','-nic','user,model=virtio-net-pci','-drive','file='+str(work/'guest.qcow2')+',format=qcow2,if=virtio','-drive','file='+str(work/'seed.iso')+',media=cdrom,readonly=on','-drive','file='+str(work/'payload.iso')+',media=cdrom,readonly=on','-no-reboot']

def normalized(argv, work, executable):
    require(argv==command(work,executable),'environment')
    return ['qemu-system-x86_64']+[value.replace(str(work),'<work>') for value in argv[1:]]

def read_frame(serial, binary_hash):
    if not serial.exists():
        return False,None
    require(serial.stat().st_size<=32768,'transport')
    data=serial.read_bytes(); ready=b'T3_GATHER_READY\n'
    if len(data)<len(ready):
        require(ready.startswith(data),'transport'); return False,None
    require(data.startswith(ready),'transport')
    rest=data[len(ready):]; prefix=b'T3_GATHER_RESULT '
    if not rest:
        return True,None
    if len(rest)<len(prefix):
        require(prefix.startswith(rest),'transport'); return True,None
    require(rest.startswith(prefix),'transport')
    if not rest.endswith(b'\n'):
        require(b'\n' not in rest,'transport'); return True,None
    require(rest.count(b'\n')==1,'transport')
    try:
        result=loads(base64.b64decode(rest[len(prefix):-1],validate=True))
        check_cell(result,True,binary_hash)
    except (ValueError,TypeError,KeyError):
        raise BoundError('transport') from None
    return True,result

def qemu_identity():
    packages={}
    for package in PACKAGES:
        rc,out,err=run(['dpkg-query','-W','-f=${Version}',package],5)
        require(rc==0 and not err and out.decode()==VERSION,'package_version'); packages[package]=out.decode()
    exe=shutil.which('qemu-system-x86_64'); require(exe,'package_version')
    rc,out,err=run([exe,'--version'],5)
    require(rc==0 and not err,'package_version')
    first=out.decode().splitlines()[0]
    require(first=='QEMU emulator version 8.2.2 (Debian 1:8.2.2+ds-0ubuntu1.18)','package_version')
    return exe,dict(packages=packages,executableSha256=sha(exe),version=first)

def boot_deadline(ready_time, now, launched):
    require(ready_time is not None or now-launched<300,'boot_timeout')

def run_guest(work, binary_hash, meta):
    start=time.monotonic(); process=None
    def expired(signum,frame):
        signal.setitimer(signal.ITIMER_REAL,0)
        raise BoundError('lifecycle_timeout')
    previous=signal.signal(signal.SIGALRM,expired); signal.setitimer(signal.ITIMER_REAL,746)
    try:
        executable,identity=qemu_identity(); meta.update(identity)
        payload=work/'payload'; payload.mkdir()
        for name in ('probe','common.py','run_probe.py','guest.py'):
            shutil.copyfile(HERE/name,payload/name)
        (payload/'probe').chmod(0o755)
        require(sha(payload/'probe')==binary_hash,'binary_identity')
        hashes={p.name:sha(p) for p in payload.iterdir()}
        seed=work/'seed'; seed.mkdir()
        config={'users':[],'ssh_deletekeys':False,'ssh_genkeytypes':[],'allow_public_ssh_keys':False,'ssh_publish_hostkeys':{'enabled':False},'write_files':[{'path':'/run/t3-payload-hashes.json','permissions':'0644','content':json.dumps(hashes)},{'path':'/run/t3-entry.py','permissions':'0644','content':(HERE/'guest.py').read_text()}],'runcmd':[['python3','/run/t3-entry.py']]}
        (seed/'user-data').write_text('#cloud-config\n'+json.dumps(config)); (seed/'meta-data').write_text('instance-id: t3-synthetic-gather\nlocal-hostname: t3-validation\n')
        for folder,label,target in ((payload,'T3PAYLOAD',work/'payload.iso'),(seed,'cidata',work/'seed.iso')):
            rc,_,_=run(['genisoimage','-quiet','-output',str(target),'-volid',label,'-joliet','-rock',str(folder)],20); require(rc==0,'setup')
        image=work/'base.qcow2'
        rc,_,_=run(['curl','--proto','=https','--proto-redir','=https','--fail','--silent','--show-error','--location','--connect-timeout','10','--max-time','120','--max-filesize',str(2*1024**3),IMAGE_URL,'-o',str(image)],125)
        require(rc==0 and image.stat().st_size<=2*1024**3 and sha(image,'sha512')==IMAGE_SHA,'image')
        meta['imageSha512']=sha(image,'sha512')
        rc,_,_=run(['qemu-img','create','-f','qcow2','-F','qcow2','-b',str(image),str(work/'guest.qcow2'),'10G'],15); require(rc==0,'setup')
        argv=command(work,executable)
        with open(work/'qemu.log','wb') as log:
            launched=time.monotonic(); process,blocked=spawn(argv,stdout=log,stderr=subprocess.STDOUT)
            signal.pthread_sigmask(signal.SIG_SETMASK,blocked)
            # Read the actual process invocation; labels alone are not evidence.
            actual=pathlib.Path('/proc',str(process.pid),'cmdline').read_bytes().rstrip(b'\0').decode().split('\0')
            meta['argv']=normalized(actual,work,executable)
            ready_time=None; result=None
            while result is None:
                now=time.monotonic()
                require(now-launched<596,'lifecycle_timeout')
                for name,limit in (('console.log',1024**2),('qemu.log',65536),('serial.log',32768)):
                    path=work/name; require(not path.exists() or path.stat().st_size<=limit,'transport')
                require(shutil.disk_usage(work).free>=1024**3,'setup')
                ready,result=read_frame(work/'serial.log',binary_hash)
                boot_deadline(ready_time,now,launched)
                if ready and ready_time is None:
                    ready_time=now
                    meta['bootElapsedMs']=round((now-launched)*1000)
                require(ready_time is None or now-ready_time<165,'lifecycle_timeout')
                if result is None:
                    require(process.poll() is None,'transport')
                    time.sleep(0.1)
            stop(process); process=None
            meta['lifecycleElapsedMs']=round((time.monotonic()-launched)*1000)
        require(sha(executable)==meta['executableSha256'] and sha(HERE/'probe')==binary_hash,'binary_identity')
        return result
    finally:
        signal.setitimer(signal.ITIMER_REAL,0)
        stop(process)
        signal.signal(signal.SIGALRM,previous)
        meta['outerElapsedMs']=round((time.monotonic()-start)*1000)

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--execute-reviewed-operation',action='store_true'); parser.add_argument('--work',type=pathlib.Path,required=True); parser.add_argument('--public',type=pathlib.Path,required=True); args=parser.parse_args()
    require(args.execute_reviewed_operation,'setup'); install_handlers()
    require(os.geteuid()!=0 and os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted' and os.environ.get('GITHUB_RUN_ATTEMPT')=='1' and os.environ.get('GITHUB_REPOSITORY')=='ZhiweiXiao98/t3code' and os.environ.get('GITHUB_REF')=='refs/heads/'+BRANCH,'environment')
    work=args.work.resolve(); require(not work.exists() and re.fullmatch(r'[A-Za-z0-9_./-]+',str(work)),'setup'); work.mkdir()
    require(shutil.disk_usage(work).free>=6*1024**3,'setup')
    sources=verify_sources(); binary_hash=sha(HERE/'probe'); require(digest(binary_hash),'binary_identity')
    native=cell(HERE/'probe',binary_hash,False); guest=None; meta={}; error=None
    if check_cell(native,False,binary_hash):
        try:
            guest=run_guest(work,binary_hash,meta)
        except (BoundError,OSError,ValueError,KeyError,TypeError) as failure:
            error=str(failure) if isinstance(failure,BoundError) and str(failure) in ERRORS else 'invalid_result'
    require(verify_sources()==sources,'source_identity')
    result={'schemaVersion':1,'sourceParent':PARENT,'probeReviewManifestSha256':PROBE_MANIFEST,'sourceFiles':sources,'binarySha256':binary_hash,'limitsSeconds':LIMITS,'qemu':meta,'native':native,'guest':guest,'error':error,'classification':classify(native,guest,binary_hash),'stop':True,'applicationAcceptance':False}
    encoded=json.dumps(result,separators=(',',':'))+'\n'; require(len(encoded)<=16384)
    (args.public/'comparison.json').write_text(encoded)
if __name__=='__main__':
    main()

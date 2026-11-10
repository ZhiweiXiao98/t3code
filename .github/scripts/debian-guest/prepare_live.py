"""Prepare current-run pins and original ZIPs; requires explicit execution flag."""
import argparse,base64,hashlib,json,os,pathlib,subprocess,zipfile,urllib.request
from common import *
from host import api,download_job_log,read_zip_text,sums
from live_io import context,snapshot,validate_snapshot
HERE=pathlib.Path(__file__).resolve().parent

def download_artifact(repo,aid,target,expected_size,limit):
    import time,urllib.error
    require(type(expected_size) is int and 0<expected_size<=limit,'Original ZIP metadata exceeds budget')
    headers={'Accept':'application/vnd.github+json','User-Agent':'t3-current-run-validation','Authorization':'Bearer '+os.environ['GITHUB_TOKEN']}
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    req=urllib.request.Request(f'https://api.github.com/repos/{repo}/actions/artifacts/{aid}/zip',headers=headers)
    try:response=urllib.request.build_opener(NoRedirect()).open(req,timeout=60)
    except urllib.error.HTTPError as error:
        require(error.code==302,'Artifact API did not return download redirect')
        url=error.headers['Location'];require(url.startswith('https://'),'Insecure redirect')
        response=urllib.request.urlopen(url,timeout=60) # No token forwarded.
    count=0;start=time.monotonic()
    with response,open(target,'wb') as f:
        while True:
            chunk=response.read(min(1024*1024,expected_size-count+1))
            if not chunk:break
            count+=len(chunk);require(count<=expected_size and time.monotonic()-start<180,'Original ZIP download exceeds size/time budget');f.write(chunk)
    require(count==expected_size,'Original ZIP download byte size mismatch')

def prepare(kind,source,work):
    require(os.environ.get('GITHUB_ACTIONS')=='true' and os.geteuid()!=0,'Nonroot Actions required')
    work=pathlib.Path(work);require(not work.exists(),'Fresh inputs directory required');work.mkdir()
    repo=os.environ['GITHUB_REPOSITORY'];rid=int(os.environ['GITHUB_RUN_ID']);attempt=int(os.environ['GITHUB_RUN_ATTEMPT']);head=os.environ['GITHUB_SHA']
    require(repo=='ZhiweiXiao98/t3code','Wrong repo')
    def git(*args):return subprocess.check_output(['git','-C',source,*args],text=True).strip()
    require(git('rev-parse','HEAD')==head and not git('status','--porcelain','--untracked-files=no'),'Dirty or wrong source')
    base=f'/repos/{repo}';jobs=api(base+f'/actions/runs/{rid}/attempts/{attempt}/jobs?per_page=100')
    require(jobs['total_count']<=100,'Unexpected job count')
    def job(name):
        matches=[j for j in jobs['jobs'] if j['name']==name];require(len(matches)==1,'Job identity not unique: '+name);return matches[0]
    producer=job('Linux x64 and embedded Windows WSL runtime')
    consumer=job('Clean desktop appimage Debian 13 guest (Ubuntu 24.04 host) first start' if kind=='appimage' else 'Clean desktop deb first start')
    require(producer['status']=='completed' and producer['conclusion']=='success','Producer not completed successfully')
    arts=api(base+f'/actions/runs/{rid}/artifacts?per_page=100');require(arts['total_count']<=100,'Unexpected artifact count')
    def art(name):
        matches=[a for a in arts['artifacts'] if a['name']==name];require(len(matches)==1,'Artifact identity not unique');return matches[0]
    a=art('client-linux-x64');proof=art('linux-build-proof')
    def step(name):
        matches=[s for s in producer['steps'] if s['name']==name];require(len(matches)==1,'Upload step identity not unique');return matches[0]['number']
    log=download_job_log(repo,producer['id'])
    m=dict(schemaVersion=1,repository=repo,mode='same-full-run-debian13-v1' if kind=='appimage' else 'same-full-run-native-deb-v1',kind=kind,sourceSha=head,sourceTree=git('rev-parse','HEAD^{tree}'),workflowSha=head,producerRunId=rid,producerRunAttempt=attempt,producerJobId=producer['id'],consumerJobId=consumer['id'],artifactId=a['id'],proofArtifactId=proof['id'],artifactZipSha256=a['digest'].removeprefix('sha256:'),proofZipSha256=proof['digest'].removeprefix('sha256:'),producerLogSha256=hashlib.sha256(log.encode()).hexdigest(),packageUploadStepNumber=step('Upload Linux installers (upload-artifact)'),proofUploadStepNumber=step('Upload Linux build proof (upload-artifact)'),cleanDriverSha256=CLEAN_SHA,cjkDriverSha256=CJK_SHA,privacyClauses=PRIVACY_CLAUSES,imageUrl=IMAGE_URL,imageSha512=IMAGE_SHA,playwrightVersion='1.60.0',playwrightSize=2814257,playwrightTreeSha256='8b1df81ba75e90a41eb5c996350ea7ecc1c915ea643ec55138f91c949c5a25bf',playwrightIntegrity='sha512-9bW6zvX/m0lEbgTKJ6YppOKx8H3VOPBMOCFh2irXFOT4BbHgrx5hPjwJYLT40Lu+4qtD36qKc/Hn56StUW57IA==')
    ctx=context(m);e,l=snapshot(m);validate_snapshot(ctx,e,m,l)
    for aid,name,digest in ((a['id'],'installers.zip',m['artifactZipSha256']),(proof['id'],'proof.zip',m['proofZipSha256'])):
        download_artifact(repo,aid,work/name,(a if name=='installers.zip' else proof)['size_in_bytes'],768*1024**2 if name=='installers.zip' else 1024**2);require(sha(work/name)==digest,'Original ZIP digest mismatch')
    with zipfile.ZipFile(work/'proof.zip') as z:
        import stat
        require(all(not i.is_dir() and not(i.flag_bits&1) and stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG) and i.file_size<=1024**2 for i in z.infolist()),'Unsafe proof member')
        require(set(z.namelist())=={'source-sha.txt','source-tree.txt','installers.sha256','driver.sha256'} and len(z.namelist())==4,'Unexpected proof entries')
        require(read_zip_text(z,'source-sha.txt').strip()==head and read_zip_text(z,'source-tree.txt').strip()==m['sourceTree'],'Proof source mismatch')
        require(sums(read_zip_text(z,'driver.sha256'))=={'.github/scripts/check-clean-desktop-first-start.mjs':CLEAN_SHA},'Proof clean driver mismatch')
        checks=sums(read_zip_text(z,'installers.sha256'))
    with zipfile.ZipFile(work/'installers.zip') as z:
        infos=z.infolist()
        import stat
        require(all(not i.is_dir() and not(i.flag_bits&1) and stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG) for i in infos),'Encrypted/special installer member')
        require(sum(i.file_size for i in infos)<=1024**3,'Installer expansion exceeds budget')
        require(len(infos)==2 and len({safe_name(i.filename) for i in infos})==2,'Expected original two installers only')
        for suffix,prefix in (('.AppImage','appimage'),('.deb','deb')):
            items=[i for i in infos if i.filename.endswith(suffix)];require(len(items)==1,'Missing exact installer kind');i=items[0]
            paths=[k for k in checks if pathlib.PurePosixPath(k).name==pathlib.PurePosixPath(i.filename).name];require(len(paths)==1,'Ambiguous proof filename')
            require(0<i.file_size<=512*1024**2,'Invalid installer size')
            m[prefix+'ZipPath']=i.filename;m[prefix+'ProofPath']=paths[0];m[prefix+'Sha256']=checks[paths[0]]
            if prefix==kind:
                target=work/('installer'+suffix)
                with z.open(i) as inp,open(target,'wb') as dest:
                    import shutil;shutil.copyfileobj(inp,dest,1024*1024)
                require(sha(target)==checks[paths[0]],'Installer member digest mismatch');m['installerBytes']=i.file_size;m['installerSha256']=checks[paths[0]]
    m['executableSha256']=m['installerSha256'] # DEB overwritten only after real installation and independent dpkg ownership check.
    tar=work/'playwright.tgz'
    with urllib.request.urlopen('https://registry.npmjs.org/playwright-core/-/playwright-core-1.60.0.tgz',timeout=60) as r:
        data=r.read(m['playwrightSize']+1)
    require(len(data)==m['playwrightSize'] and hashlib.sha256(data).hexdigest()==m['playwrightTreeSha256'],'Official Playwright size/hash mismatch');tar.write_bytes(data)
    require('sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()==m['playwrightIntegrity'],'Official Playwright SRI mismatch')
    (work/'manifest.json').write_text(json.dumps(m,indent=2));(work/'before.json').write_text(json.dumps(e,indent=2));(work/'producer-job.log').write_text(l)
    print('Current-run input hashes and producer evidence verified',flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--kind',choices=['deb','appimage'],required=True);p.add_argument('--source',required=True);p.add_argument('--work',required=True);p.add_argument('--execute-authorized',action='store_true');a=p.parse_args();require(a.execute_authorized,'Disabled proposal');prepare(a.kind,a.source,a.work)

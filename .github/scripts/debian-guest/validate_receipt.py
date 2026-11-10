"""Validate original bounded receipt, never normalize a header into success."""
import pathlib,re,json
from common import *
from live_contract import LiveRun,validate_pair

def validate(root):
    root=pathlib.Path(root)
    p=read_json(root/'provenance.json');m=validate_manifest(read_json(root/'manifest.json'))
    require(type(p.get('schemaVersion')) is int and p['schemaVersion']==1,'Wrong provenance schema')
    require(p.get('mode')==m['mode'],'Mode mismatch')
    for key,mkey in [('repository','repository'),('runId','producerRunId'),('runAttempt','producerRunAttempt'),('workflowHeadSha','workflowSha'),('sourceSha','sourceSha'),('sourceTree','sourceTree')]:require(type(p.get(key)) is type(m[mkey]) and p[key]==m[mkey],'Provenance '+key+' mismatch')
    entries=p.get('files');require(isinstance(entries,list) and 0<len(entries)<=2000,'Invalid evidence inventory')
    seen=set();total=0
    for item in entries:
        name=safe_name(item.get('path'));require(name not in seen and name not in ('provenance.json','collection.json'),'Duplicate/self-referential evidence inventory');seen.add(name)
        f=root/name;require(f.is_file() and not f.is_symlink() and not any(x.is_symlink() for x in f.parents if x!=root.parent),'Missing/link evidence')
        size=item.get('bytes');require(type(size) is int and 0<=size<=64*1024*1024 and f.stat().st_size==size,'Member size mismatch');total+=size;require(total<=128*1024*1024,'Receipt too large')
        require(sha(f)==item.get('sha256'),'Member digest mismatch')
    actual={str(f.relative_to(root)) for f in root.rglob('*') if f.is_file()}
    require(actual==seen|{'provenance.json','collection.json'},'Unexpected/uninventoried receipt member')
    required={'manifest.json','github-evidence.json','github-evidence-after.json','producer-job.log','results/status.json','results/security-defaults.json','results/clean/clean-first-start.json','results/clean/clean-first-render.png','results/clean/clean-first-start.png','results/cjk/linux-chinese-ui.json','results/cjk/font-evidence.json','results/cjk/01-fonts-installed-english.png','results/cjk/02-chinese-selected.png','results/cjk/03-chinese-after-restart.png','host-os-release.txt'}
    require(required<=seen,'Missing original raw evidence')
    status=validate_results(root/'results',m)
    ctx=LiveRun(m['repository'],m['producerRunId'],m['producerRunAttempt'],m['workflowSha'],m['sourceSha'],m['sourceTree'],m['producerJobId'],m['consumerJobId'],m['mode'])
    before=read_json(root/'github-evidence.json');after=read_json(root/'github-evidence-after.json');log=(root/'producer-job.log').read_text();validate_pair(ctx,before,after,m,log,log)
    runtime=p.get('runtime',{});require(runtime.get('kind')==m['kind'] and runtime.get('execution')==status.get('execution'),'Raw runtime mismatch')
    require(runtime.get('host')=={'id':'ubuntu','versionId':'24.04','runnerLabel':'ubuntu-24.04','observationsMember':'host-os-release.txt'},'Host binding mismatch')
    osrel=dict(line.split('=',1) for line in (root/'host-os-release.txt').read_text().splitlines() if '=' in line);require(osrel.get('ID')=='ubuntu' and osrel.get('VERSION_ID','').strip('"')=='24.04','Host raw observation mismatch')
    if m['kind']=='appimage':
        require(runtime.get('guestImageSha512')==IMAGE_SHA,'Wrong guest image')
        hp=read_json(root/'host-provenance.json');require(runtime.get('accelerator')==hp['accelerator'] and runtime['accelerator'] in (['-accel','kvm','-cpu','host'],['-accel','tcg,thread=multi','-cpu','max']),'Wrong accelerator binding')
    else:require('guestImageSha512' not in runtime and 'accelerator' not in runtime,'Native DEB relabeled as guest')
    a=before['installer'];proof=before['proof']
    expected_producer={'jobId':m['producerJobId'],'runId':m['producerRunId'],'runAttempt':m['producerRunAttempt'],'workflowHeadSha':m['workflowSha'],'installerArtifactId':a['id'],'installerArtifactName':a['name'],'installerZipSha256':m['artifactZipSha256'],'installerZipBytes':a['size_in_bytes'],'proofArtifactId':proof['id'],'proofArtifactName':proof['name'],'proofZipSha256':m['proofZipSha256'],'proofZipBytes':proof['size_in_bytes'],'installerUploadStep':m['packageUploadStepNumber'],'proofUploadStep':m['proofUploadStepNumber'],'logSha256':m['producerLogSha256']}
    require(strict_dict(p.get('producer'),expected_producer),'Producer provenance mismatch')
    require(p.get('consumer')=={'jobId':m['consumerJobId'],'exactJobName':before['consumer']['name'],'runAttempt':m['producerRunAttempt'],'kind':m['kind'],'runnerLabel':'ubuntu-24.04'},'Consumer mismatch')
    require(p.get('installer')=={'memberPath':m['appimageZipPath'] if m['kind']=='appimage' else m['debZipPath'],'bytes':m['installerBytes'],'sha256':m['installerSha256']},'Installer mismatch')
    require(p.get('drivers')=={'clean':{'sourcePath':'.github/scripts/check-clean-desktop-first-start.mjs','sha256':CLEAN_SHA},'cjk':{'sourcePath':'.github/scripts/debian-guest/check-debian-cjk-ui.mjs','sha256':CJK_SHA}},'Driver binding mismatch')
    require(p.get('reports')=={'cleanMember':'results/clean/clean-first-start.json','cjkMember':'results/cjk/linux-chinese-ui.json','fontMember':'results/cjk/font-evidence.json'},'Report paths mismatch')
    return p

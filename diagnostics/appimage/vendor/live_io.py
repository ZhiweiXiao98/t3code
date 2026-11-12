"""Same-run evidence I/O; no focused mode or historical failure gate."""
import json,os,pathlib,subprocess,hashlib
from common import require,sha,safe_name
from live_contract import LiveRun,validate_snapshot,validate_pair

def context(m):
    c=LiveRun(m['repository'],m['producerRunId'],m['producerRunAttempt'],m['workflowSha'],m['sourceSha'],m['sourceTree'],m['producerJobId'],m['consumerJobId'],m['mode'])
    require(os.environ.get('GITHUB_REPOSITORY')==c.repository and os.environ.get('GITHUB_SHA')==c.head_sha,'Not current repository/head')
    require(os.environ.get('GITHUB_RUN_ID')==str(c.run_id) and os.environ.get('GITHUB_RUN_ATTEMPT')==str(c.attempt),'Not current run/attempt')
    return c

def snapshot(m):
    from host import api,download_job_log
    base='/repos/'+m['repository']
    e={'repo':api(base),'run':api(base+f"/actions/runs/{m['producerRunId']}/attempts/{m['producerRunAttempt']}"),'producer':api(base+f"/actions/jobs/{m['producerJobId']}"),'consumer':api(base+f"/actions/jobs/{m['consumerJobId']}"),'installer':api(base+f"/actions/artifacts/{m['artifactId']}"),'proof':api(base+f"/actions/artifacts/{m['proofArtifactId']}")}
    return e,download_job_log(m['repository'],m['producerJobId'])

def emit_provenance(work,m,e):
    work=pathlib.Path(work)
    status=json.loads((work/'results/status.json').read_text())
    require(status['result']=='passed','No passing runtime')
    observed=dict(line.split('=',1) for line in pathlib.Path('/etc/os-release').read_text().splitlines() if '=' in line)
    require(observed['ID']=='ubuntu' and observed['VERSION_ID'].strip('"')=='24.04','Wrong host distro')
    runtime={'kind':m['kind'],'host':{'id':'ubuntu','versionId':'24.04','runnerLabel':'ubuntu-24.04','observationsMember':'host-os-release.txt'},'execution':status['execution']}
    if m['kind']=='appimage':
        hp=json.loads((work/'host-provenance.json').read_text());runtime.update(guestImageSha512=hp['imageSha512'],accelerator=hp['accelerator'])
    (work/'host-os-release.txt').write_text(pathlib.Path('/etc/os-release').read_text())
    (work/'manifest.json').write_text(json.dumps(m,indent=2))
    from collect_evidence import collect
    staging=work/'provenance-stage';collect(work,staging)
    # Collection excludes host-os-release until explicit addition below.
    (staging/'host-os-release.txt').write_text((work/'host-os-release.txt').read_text())
    files=[]
    for f in sorted(staging.rglob('*')):
        if f.is_file() and f.name!='collection.json':files.append({'path':str(f.relative_to(staging)),'bytes':f.stat().st_size,'sha256':sha(f)})
    a=e['installer'];proof=e['proof'];producer=e['producer'];consumer=e['consumer']
    p={'schemaVersion':1,'mode':m['mode'],'repository':m['repository'],'runId':m['producerRunId'],'runAttempt':m['producerRunAttempt'],'workflowHeadSha':m['workflowSha'],'sourceSha':m['sourceSha'],'sourceTree':m['sourceTree'],'consumer':{'jobId':m['consumerJobId'],'exactJobName':consumer['name'],'runAttempt':m['producerRunAttempt'],'kind':m['kind'],'runnerLabel':'ubuntu-24.04'},'producer':{'jobId':m['producerJobId'],'runId':m['producerRunId'],'runAttempt':m['producerRunAttempt'],'workflowHeadSha':m['workflowSha'],'installerArtifactId':a['id'],'installerArtifactName':a['name'],'installerZipSha256':m['artifactZipSha256'],'installerZipBytes':a['size_in_bytes'],'proofArtifactId':proof['id'],'proofArtifactName':proof['name'],'proofZipSha256':m['proofZipSha256'],'proofZipBytes':proof['size_in_bytes'],'installerUploadStep':m['packageUploadStepNumber'],'proofUploadStep':m['proofUploadStepNumber'],'logSha256':m['producerLogSha256']},'installer':{'memberPath':m['appimageZipPath'] if m['kind']=='appimage' else m['debZipPath'],'bytes':m['installerBytes'],'sha256':m['installerSha256']},'drivers':{'clean':{'sourcePath':'.github/scripts/check-clean-desktop-first-start.mjs','sha256':m['cleanDriverSha256']},'cjk':{'sourcePath':'.github/scripts/debian-guest/check-debian-cjk-ui.mjs','sha256':m['cjkDriverSha256']}},'runtime':runtime,'reports':{'cleanMember':'results/clean/clean-first-start.json','cjkMember':'results/cjk/linux-chinese-ui.json','fontMember':'results/cjk/font-evidence.json'},'files':files}
    (work/'provenance.json').write_text(json.dumps(p,indent=2))

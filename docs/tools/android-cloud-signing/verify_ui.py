"""Recheck immutable, reviewed 139-file UI evidence. No app execution or writes to GitHub."""
import hashlib,json,tempfile,zipfile
from datetime import datetime,timezone
from pathlib import Path,PurePosixPath
import verify_supplemental as transport
SOURCE='042eacb54f19c3bbc452e4ae271794f4c5fc524e'
TREE='7879a15522881c2c953a650ca2062848111a742d'
OPERATION='67d01cd6539fe192fb53b3e6927230e368df7c6f'
RUN=43169912982
ARTIFACT=13921583217
BRANCH='maintenance/v0.1.9-zh-cloud'
WORKFLOW='.github/workflows/validate-v019-zh-ui.yml'
CAPTURES=['menu-zh-open','menu-zh-copy','menu-zh-reopened','menu-en-open','menu-zh-roundtrip']
TEST_HASH='65569c6e47fdfe0209d6b698297fa0ae3a1f7f4ec53ec1bf2d4c8c9a95732001'
SCENARIO_HASH='4dffda96664fc2c493b4fb936284d678174478cda03169df6a2e151a6fe3250d'
require=transport.require
stamp=transport.stamp
sha=lambda b:hashlib.sha256(b).hexdigest()

class Api(transport.Api):
    def download(self,artifact_id,destination):
        require(artifact_id==ARTIFACT,'Unexpected UI artifact download')
        return self.redirect_bytes('/actions/artifacts/'+str(artifact_id)+'/zip',destination,2*1024*1024)

def check_pins(p):
    require(p['source_sha']==SOURCE and p['source_tree']==TREE and p['operation_sha']==OPERATION and p['run_id']==RUN and p['run_attempt']==1,'UI immutable identity mismatch')
    require(p['artifact']['id']==ARTIFACT and p['artifact']['name']=='v019-zh-ui-43169912982-1','UI artifact identity mismatch')
    require(p['test_files']==sorted(set(p['test_files'])) and len(p['test_files'])==139,'UI file inventory mismatch')
    require(sha(json.dumps(p['test_files'],separators=(',',':'),ensure_ascii=False).encode())==TEST_HASH,'UI inventory digest mismatch')
    require(p['artifact']['size']<=2*1024*1024 and len(p['members'])==23,'UI bounded artifact contract')
    require(p['operation_tree']=='343ec0d56c947a15b0b91f7d6a5c4045e6d0c284' and p['workflow_blob']=='ba5f428386a9f6745ff3f9c107ecb724badadf1e','UI reviewed operation contents changed')

def current(api,p):
    r=api.json('/actions/runs/'+str(RUN))
    expected={'id':RUN,'run_attempt':1,'head_sha':OPERATION,'head_branch':p['operation_branch'],'path':WORKFLOW,'status':'completed','conclusion':'success','event':'push'}
    require(all(r.get(k)==v for k,v in expected.items()),'UI run not exact successful original attempt')
    require(r['repository']['full_name']==r['head_repository']['full_name']=='ZhiweiXiao98/t3code' and r['repository']['private'] is False,'UI repository mismatch')
    jobs=api.json('/actions/runs/'+str(RUN)+'/attempts/1/jobs?per_page=100')
    require(jobs['total_count']==1 and len(jobs['jobs'])==1,'UI requires exactly one producer')
    j=jobs['jobs'][0];wanted=p['producer']
    require(all(j.get(k)==v for k,v in wanted.items()),'UI original producer changed')
    require(j['run_id']==RUN and j['run_attempt']==1 and j['head_sha']==OPERATION and j['status']=='completed' and j['conclusion']=='success','UI job provenance mismatch')
    latest=api.json('/actions/runs/'+str(RUN)+'/jobs?filter=latest&per_page=100')
    require(latest['total_count']==1 and latest['jobs']==jobs['jobs'],'UI latest attempt changed')
    a=api.json('/actions/artifacts/'+str(ARTIFACT));pin=p['artifact']
    require(a['id']==pin['id'] and a['name']==pin['name'] and a['size_in_bytes']==pin['size'] and a['digest']=='sha256:'+pin['sha256'],'UI artifact binding mismatch')
    require(a['expired'] is False and stamp(a['expires_at'])>datetime.now(timezone.utc),'UI artifact expired')
    require(a['workflow_run']['id']==RUN and a['workflow_run']['head_sha']==OPERATION and a['workflow_run']['head_branch']==p['operation_branch'],'UI artifact producer run mismatch')
    require(stamp(j['started_at'])<=stamp(a['created_at'])<=stamp(a['updated_at'])<=stamp(j['completed_at']),'UI artifact producer interval mismatch')
    uploads=[x for x in j['steps'] if x['name']==pin['upload_step_name']]
    require(len(uploads)==1 and uploads[0]['status']=='completed' and uploads[0]['conclusion']=='success' and stamp(uploads[0]['started_at'])<=stamp(a['created_at'])<=stamp(a['updated_at'])<=stamp(uploads[0]['completed_at']),'UI upload interval mismatch')
    require(api.json('/git/ref/heads/'+BRANCH)['object']['sha']==SOURCE and api.json('/git/commits/'+SOURCE)['tree']['sha']==TREE,'UI source moved')
    require(api.json('/git/ref/heads/'+p['operation_branch'])['object']['sha']==OPERATION,'UI operation ref moved')
    op=api.json('/git/commits/'+OPERATION)
    require([x['sha'] for x in op['parents']]==[SOURCE] and op['tree']['sha']==p['operation_tree'],'UI operation ancestry changed')
    diff=api.json('/compare/'+SOURCE+'...'+OPERATION)
    require(diff['status']=='ahead' and diff['merge_base_commit']['sha']==SOURCE and len(diff['files'])==1 and diff['files'][0]['filename']==WORKFLOW and diff['files'][0]['status']=='added','UI operation changed application')
    return {'run':expected,'job':wanted,'artifact':{k:a[k] for k in ['id','name','size_in_bytes','digest','expired','expires_at','created_at','updated_at','workflow_run']}}

def check_archive(path,p):
    raw=Path(path).read_bytes();require(len(raw)==p['artifact']['size'] and sha(raw)==p['artifact']['sha256'],'UI ZIP changed')
    with zipfile.ZipFile(path) as z:
        entries=z.infolist();require(len(entries)==len(p['members']) and {x.filename for x in entries}==set(p['members']),'UI ZIP member inventory changed')
        require(sum(x.file_size for x in entries)<=32*1024*1024,'UI ZIP uncompressed size limit')
        for x in entries:
            name=PurePosixPath(x.filename)
            require(not x.is_dir() and not name.is_absolute() and '..' not in name.parts and '\\' not in x.filename and (x.external_attr>>16)&0o170000 in (0,0o100000) and not(x.flag_bits&1),'Unsafe UI member')
            require(sha(z.read(x))==p['members'][x.filename],'UI member digest changed')
        require(z.testzip() is None,'UI archive CRC failure')
        data={n:transport.strict_json(z.read(n)) for n in p['members'] if n.endswith('.json')}
        for label in CAPTURES:require(z.read(label+'.png').startswith(b'\x89PNG\r\n\x1a\n'),'UI screenshot PNG missing')
    f=data['final-status.json'];require(f=={'sourceSha':SOURCE,'sourceTree':TREE,'operationSha':OPERATION,'priorJobStatus':'success','unitOutcome':'success','scenarioOutcome':'success','supplementalOnly':True,'separate22ReleaseGatesRequired':True,'installedAppAcceptance':False,'sourceUnchanged':True,'accepted':True},'UI final verdict mismatch')
    v=data['provenance.json'];require(v['sourceSha']==SOURCE and v['sourceTree']==TREE and v['operationSha']==OPERATION and v['operationTree']==p['operation_tree'] and v['workflowBlob']==p['workflow_blob'] and v['runId']==RUN and v['runAttempt']==1 and v['testFiles']==p['test_files'] and v['testFilesSha256']==TEST_HASH and v['scenarioSha256']==SCENARIO_HASH and v['reviewedCaptureLabels']==CAPTURES,'UI report provenance mismatch')
    u=data['unit-summary.json'];require(u['sourceSha']==SOURCE and u['files']==p['test_files'] and u['totalTests']==u['passedTests']==1791 and u['skippedTests']==u['todoTests']==u['unfinishedTests']==0 and u['incrementalCountsMatched'] is True and u['success'] is True,'UI full139 summary failed')
    progress=data['unit-progress.json'];require(progress['phase']=='ended' and progress['runEndReason']=='passed' and progress['countsComplete'] is True and progress['integrityError'] is None and progress['unhandledErrorCount']==0 and progress['missing']==progress['inFlight']==progress['failedModules']==[] and progress['observedCounts']=={'passed':1791,'failed':0,'skipped':0,'pending':0,'todo':0},'UI incomplete incremental result')
    for n in ['unit-verdict.json','scenario-verdict.json']:require(data[n]=={'success':True,'sourceSha':SOURCE,'independentlyVerified':True},'UI independent verdict mismatch')
    for n in ['unit-exit.json','scenario-exit.json']:require(data[n]['code']==0 and data[n]['signal'] is None and data[n]['timedOut'] is False and data[n]['sourceSha']==SOURCE,'UI process failed')
    r=data['scenario-report.json'];require(r['sourceSha']==SOURCE and r['runStatus']==r['resultStatus']==r['attemptStatus']=='passed' and r['exitCode']==0 and r['cleanup']=='complete' and r['noModelCalls'] is True and r['noRetries'] is True and len(r['steps'])==61 and all(x['status']=='passed' for x in r['steps']) and r['exportedCaptures']==CAPTURES,'UI real scenario failed')
    return {'source_sha':SOURCE,'source_tree':TREE,'operation_sha':OPERATION,'run_id':RUN,'run_attempt':1,'artifact_id':ARTIFACT,'artifact_sha256':p['artifact']['sha256'],'reviewed_files':139,'passed_tests':1791,'scenario_steps':61,'screenshots':CAPTURES,'installed_app_acceptance':False}

def verify(pins=None,api=None):
    p=pins or transport.strict_json(Path(__file__).with_name('ui-pin.json').read_bytes());check_pins(p);api=api or Api()
    before=current(api,p)
    with tempfile.TemporaryDirectory(prefix='reviewed-ui-') as folder:
        path=Path(folder)/'ui.zip';api.download(ARTIFACT,path);proof=check_archive(path,p)
        transport.verify_upload_log(api,p['artifact'],[p['producer']],folder)
    require(current(api,p)==before,'UI evidence changed while verifying')
    return proof

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--json',action='store_true');parser.parse_args();print(json.dumps(verify(),sort_keys=True))

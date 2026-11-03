"""Deterministic public mock metadata; never a real candidate binding."""
import base64
import copy
import hashlib
from datetime import datetime, timedelta, timezone
import retry_provenance as p


def fixture():
    workflow=b'PUBLIC MOCK WORKFLOW BYTES - NOT DEPLOYABLE\n'
    m={'enabled':True,'candidate_run_id':10000000000,'candidate_attempt':2,
       'candidate_source_sha':'1'*40,'candidate_artifact_id':1,'candidate_artifact_zip_sha256':'a'*64,
       'candidate_workflow_id':1234,'candidate_workflow_blob_sha':hashlib.sha1(b'blob '+str(len(workflow)).encode()+b'\0'+workflow).hexdigest(),
       'candidate_workflow_sha256':p.sha256(workflow)}
    def run(n):
        return dict(id=m['candidate_run_id'],run_attempt=n,head_sha=m['candidate_source_sha'],head_branch=p.BRANCH,path=p.WORKFLOW,workflow_id=1234,event='push',status='completed',conclusion='success' if n==2 else 'cancelled',repository={'full_name':p.REPO},head_repository={'full_name':p.REPO},run_started_at=timestamp(0 if n==1 else 1000),updated_at=timestamp(950 if n==1 else 1800))
    def timestamp(n):
        return (datetime(2026,11,2,0,0,tzinfo=timezone.utc)+timedelta(seconds=n)).isoformat().replace('+00:00','Z')
    first=[];second=[];names=list(p.dependencies())
    for i,name in enumerate(names):
        attempt=2 if name=='Desktop mac arm64 (integrity checked)' or name.startswith('Clean ') else 1
        start=10+i*20+(1000 if attempt==2 else 0)
        j=dict(id=100+i,run_id=m['candidate_run_id'],run_attempt=attempt,head_sha=m['candidate_source_sha'],head_branch=p.BRANCH,labels=['ubuntu-24.04'],name=name,status='completed',conclusion='success',started_at=timestamp(start),completed_at=timestamp(start+10),runner_id=42,
               steps=[dict(name='Set up job',number=1,status='completed',conclusion='success',started_at=timestamp(start),completed_at=timestamp(start+1))])
        if name==p.ANDROID_JOB:
            j['steps'].append(dict(name='Run '+p.UPLOAD_REF,number=13,status='completed',conclusion='success',started_at=timestamp(start+2),completed_at=timestamp(start+9)))
            m.update(candidate_producer_job_id=j['id'],candidate_producer_attempt=1)
            android=j
        if attempt==2:second.append(j)
        else:first.append(j)
    # Initial matrix placeholder has no execution and must never count as a gate.
    for i,name in enumerate(sorted(p.OLD_MATRIX_PLACEHOLDERS)):
        first.append(dict(id=300+i,run_id=m['candidate_run_id'],run_attempt=1,head_sha=m['candidate_source_sha'],head_branch=p.BRANCH,name=name,status='completed',conclusion='skipped',started_at=timestamp(900),completed_at=timestamp(900),runner_id=None,runner_name=None,labels=[],steps=[]))
    initial_arm=copy.deepcopy(next(j for j in second if j['name']=='Desktop mac arm64 (integrity checked)'))
    initial_arm.update(id=400,run_attempt=1,conclusion='cancelled',steps=[],runner_id=0,started_at=timestamp(800),completed_at=timestamp(900));first.append(initial_arm)
    def identity(job):
        job['node_id']='MOCK-NODE-'+str(job['id'])
        job['url']='https://api.github.com/repos/'+p.REPO+'/actions/jobs/'+str(job['id'])
        job['check_run_url']='https://api.github.com/repos/'+p.REPO+'/check-runs/'+str(job['id'])
        job['html_url']='https://github.com/'+p.REPO+'/actions/runs/'+str(job['run_id'])+'/job/'+str(job['id'])
        job.setdefault('created_at',job['started_at'])
        job.setdefault('runner_group_id',None if job['runner_id'] is None else 0)
        job.setdefault('runner_name',None if job['runner_id'] is None else '' if job['runner_id']==0 else 'GitHub Actions MOCK')
        job.setdefault('runner_group_name',None if job['runner_id'] is None else '' if job['runner_id']==0 else 'GitHub Actions')
        job['run_url']='https://api.github.com/repos/'+p.REPO+'/actions/runs/'+str(job['run_id'])
        job['workflow_name']='PUBLIC MOCK CLIENT WORKFLOW'
    for job in first+second:identity(job)
    for original in first:
        if original['conclusion']!='success':continue
        alias=copy.deepcopy(original);alias.update(id=original['id']+2000,run_attempt=2,created_at=timestamp(1002),runner_group_id=None)
        identity(alias);second.append(alias)
    annotations=[dict(path='.github',blob_href='https://github.com/'+p.REPO+'/blob/'+m['candidate_source_sha']+'/.github',start_line=1,end_line=1,start_column=None,end_column=None,annotation_level=level,title='',message=message,raw_details='') for level,message in [('failure',p.CAPACITY_MESSAGE),('notice',p.CAPACITY_NOTICE)]]
    m['candidate_retry_authorizations']=[dict(job_id=400,run_attempt=1,job_name=initial_arm['name'],job_snapshot_sha256=p.sha256(p.canonical(initial_arm)),capacity_annotations_sha256=p.sha256(p.canonical(annotations)))]
    artifact=dict(id=1,name=p.ARTIFACT_NAME,size_in_bytes=12345,digest='sha256:'+'a'*64,expired=False,created_at=timestamp(int((p.instant(android['steps'][-1]['started_at'])-datetime(2026,11,2,0,0,tzinfo=timezone.utc)).total_seconds())+3),updated_at=timestamp(int((p.instant(android['steps'][-1]['started_at'])-datetime(2026,11,2,0,0,tzinfo=timezone.utc)).total_seconds())+3),expires_at='2099-01-01T00:00:00Z',workflow_run={'id':m['candidate_run_id'],'head_sha':m['candidate_source_sha'],'head_branch':p.BRANCH})
    start=p.instant(android['steps'][-1]['started_at'])
    def line(sec,text):return (start+timedelta(seconds=sec)).strftime('%Y-%m-%dT%H:%M:%S')+'.1234567Z '+text+'\n'
    log=line(-2,"Download action repository '"+p.UPLOAD_REF+"' (SHA:"+p.UPLOAD_SHA+')')
    texts=['##[group]Run '+p.UPLOAD_REF,'with:','  name: '+p.ARTIFACT_NAME,'  overwrite: false','  if-no-files-found: error','  archive: true','##[endgroup]','Uploading artifact: '+p.ARTIFACT_NAME+'.zip','Finished uploading artifact content to blob storage!','SHA256 digest of uploaded artifact is '+'a'*64,'Finalizing artifact upload','Artifact '+p.ARTIFACT_NAME+' successfully finalized. Artifact ID 1','Artifact '+p.ARTIFACT_NAME+' has been successfully uploaded! Final size is 12345 bytes. Artifact ID is 1','Artifact download URL: https://github.com/'+p.REPO+'/actions/runs/'+str(m['candidate_run_id'])+'/artifacts/1']
    log+=''.join(line(1 if i<7 else 3,text) for i,text in enumerate(texts))
    prefix='/actions/runs/'+str(m['candidate_run_id'])
    routes={prefix:run(2),prefix+'/attempts/1':run(1),prefix+'/attempts/2':run(2),
            prefix+'/attempts/1/jobs?per_page=100':{'total_count':len(first),'jobs':first},
            prefix+'/attempts/2/jobs?per_page=100':{'total_count':len(second),'jobs':second},
            '/git/ref/heads/'+p.BRANCH:{'object':{'type':'commit','sha':m['candidate_source_sha']}},
            '/contents/'+p.WORKFLOW+'?ref='+m['candidate_source_sha']:{'type':'file','path':p.WORKFLOW,'encoding':'base64','sha':m['candidate_workflow_blob_sha'],'content':base64.b64encode(workflow).decode()},
            '/actions/artifacts/1':artifact,'/check-runs/400/annotations?per_page=100':annotations}
    return {'manifest':m,'routes':routes,'log':log}


class FakeApi:
    def __init__(self, data): self.data=data
    def json(self, path): return copy.deepcopy(self.data['routes'][path])
    def job_log(self, job_id):
        if job_id in self.data.get('log_overrides',{}):return self.data['log_overrides'][job_id]
        jobs=[j for path,value in self.data['routes'].items() if path.endswith('/jobs?per_page=100') for j in value['jobs']]
        job=next(j for j in jobs if j['id']==job_id)
        if job['name']==p.ANDROID_JOB:return self.data['log'].encode()
        return ('PUBLIC MOCK LOG '+job['name']+'\r\n').encode()


def signed_fixture(data=None):
    data=fixture() if data is None else data;m=data['manifest'];api=FakeApi(data)
    snapshot=p.collect_snapshot(api,m,set(p.dependencies()))
    logs=p.verify_alias_logs(api,snapshot)
    artifact=data['routes']['/actions/artifacts/1']
    receipt=p.producer_receipt(data['log'].encode(),snapshot,artifact,m)
    m.update(alias_log_proofs=logs,alias_log_proofs_sha256=p.sha256(p.canonical(logs)),source_sha=m['candidate_source_sha'],candidate_artifact_sha256=m['candidate_artifact_zip_sha256'],candidate_gates_snapshot=snapshot,candidate_gates_sha256=p.sha256(p.canonical(snapshot)),candidate_producer_log_sha256=receipt['log_sha256'],producer_job_receipt=receipt,producer_job_receipt_sha256=p.sha256(p.canonical(receipt)),candidate_artifact_metadata=p.artifact_view(artifact,m))
    return data


def fixture_three_attempts():
    """Faithful synthetic shape of two capacity cancellations, then attempt 3."""
    data=fixture();m=data['manifest'];routes=data['routes'];prefix='/actions/runs/'+str(m['candidate_run_id'])
    second=routes[prefix+'/attempts/2/jobs?per_page=100']['jobs'];original_second=copy.deepcopy(second)
    arm=next(j for j in second if j['name']=='Desktop mac arm64 (integrity checked)')
    arm.update(conclusion='cancelled',runner_id=0,runner_name='',runner_group_name='',steps=[],started_at='2026-11-02T00:20:00Z',completed_at='2026-11-02T00:28:00Z')
    annotations=copy.deepcopy(routes['/check-runs/400/annotations?per_page=100'])
    routes['/check-runs/'+str(arm['id'])+'/annotations?per_page=100']=annotations
    m['candidate_retry_authorizations'].append(dict(job_id=arm['id'],run_attempt=2,job_name=arm['name'],job_snapshot_sha256=p.sha256(p.canonical(arm)),capacity_annotations_sha256=p.sha256(p.canonical(annotations))))
    second[:]=[j for j in second if not j['name'].startswith('Clean ')]
    def identity(job,new_id,attempt):
        job.update(id=new_id,node_id='MOCK-NODE-'+str(new_id),run_attempt=attempt)
        job['url']='https://api.github.com/repos/'+p.REPO+'/actions/jobs/'+str(new_id)
        job['check_run_url']='https://api.github.com/repos/'+p.REPO+'/check-runs/'+str(new_id)
        job['html_url']='https://github.com/'+p.REPO+'/actions/runs/'+str(job['run_id'])+'/job/'+str(new_id)
    old_placeholders=[j for j in routes[prefix+'/attempts/1/jobs?per_page=100']['jobs'] if j['name'] in p.OLD_MATRIX_PLACEHOLDERS]
    for i,old in enumerate(old_placeholders):
        placeholder=copy.deepcopy(old);identity(placeholder,4000+i,2);placeholder.update(created_at='2026-11-02T00:28:01Z',started_at='2026-11-02T00:28:01Z',completed_at='2026-11-02T00:28:01Z');second.append(placeholder)
    routes[prefix+'/attempts/2/jobs?per_page=100']['total_count']=len(second)
    third=[]
    for index,old in enumerate(original_second):
        job=copy.deepcopy(old);identity(job,old['id']+5000,3)
        if old['run_attempt']==2 and old['runner_group_id'] is None:
            job.update(created_at='2026-11-02T00:33:22Z')
        else:
            start=datetime(2026,11,2,0,35,tzinfo=timezone.utc)+timedelta(seconds=index*20)
            if job['name'].startswith('Clean '):start+=timedelta(seconds=300)
            stamp=lambda t:t.isoformat().replace('+00:00','Z')
            job.update(created_at=stamp(start),started_at=stamp(start),completed_at=stamp(start+timedelta(seconds=10)))
            for step in job['steps']:step.update(started_at=stamp(start+timedelta(seconds=1)),completed_at=stamp(start+timedelta(seconds=2)))
        third.append(job)
    routes[prefix+'/attempts/2'].update(conclusion='cancelled',updated_at='2026-11-02T00:29:00Z')
    run=copy.deepcopy(routes[prefix+'/attempts/2']);run.update(run_attempt=3,conclusion='success',run_started_at='2026-11-02T00:33:20Z',updated_at='2026-11-02T00:50:00Z')
    routes[prefix]=run;routes[prefix+'/attempts/3']=copy.deepcopy(run);routes[prefix+'/attempts/3/jobs?per_page=100']={'total_count':len(third),'jobs':third}
    m['candidate_attempt']=3
    return data

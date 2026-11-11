"""LOCAL PROPOSAL: explicit live-run mode, never a focused-mode fallback."""
from dataclasses import dataclass
from datetime import datetime,timedelta,timezone
import re
MODE='same-full-run-debian13-v1'
def require(ok,message):
    if not ok: raise ValueError(message)
@dataclass(frozen=True)
class LiveRun:
    repository:str
    run_id:int
    attempt:int
    head_sha:str
    source_sha:str
    source_tree:str
    producer_job_id:int
    consumer_job_id:int
    mode:str=MODE
    def __post_init__(self):
        require(self.mode in (MODE,'same-full-run-native-deb-v1') and self.repository=='ZhiweiXiao98/t3code','Wrong explicit mode/repository')
        for v in (self.run_id,self.attempt,self.producer_job_id,self.consumer_job_id):require(type(v) is int and v>0,'Invalid ID/attempt')
        require(self.producer_job_id!=self.consumer_job_id,'Producer cannot be consumer')
        for v in (self.head_sha,self.source_sha,self.source_tree):require(isinstance(v,str) and re.fullmatch('[0-9a-f]{40}',v),'Invalid source pin')
        require(self.head_sha==self.source_sha,'Full-run source must equal workflow head')
def validate_snapshot(c,s,pins,log):
    from upload_binding import validate_upload_logs
    require(type(c) is LiveRun,'Typed live contract required')
    require(s['repo']['private'] is False and s['repo']['full_name']==c.repository,'Not public expected repo')
    r=s['run']; j=s['producer']; consumer=s['consumer']
    require((r['id'],r['run_attempt'],r['head_sha'])==(c.run_id,c.attempt,c.head_sha),'Wrong run/attempt/head')
    require(r.get('head_branch')=='maintenance/v0.1.8-zh-cloud' and r.get('path')=='.github/workflows/client-release.yml','Wrong source branch/workflow')
    require(r.get('repository',{}).get('full_name')==c.repository and r.get('head_repository',{}).get('full_name')==c.repository,'Wrong run repository')
    require(r['status']=='in_progress' and r.get('conclusion') is None or r['status']=='completed' and r.get('conclusion')=='success','Run failed/cancelled/not started')
    for job,ident in ((j,c.producer_job_id),(consumer,c.consumer_job_id)):
        require((job['id'],job['run_id'],job['run_attempt'],job['head_sha'])==(ident,c.run_id,c.attempt,c.head_sha),'Wrong job identity')
    require(j.get('head_branch')=='maintenance/v0.1.8-zh-cloud' and consumer.get('head_branch')=='maintenance/v0.1.8-zh-cloud','Wrong job source branch')
    require(j['name']=='Linux x64 and embedded Windows WSL runtime' and j['status']=='completed' and j['conclusion']=='success','Producer not successfully complete')
    require(consumer['name']==('Clean desktop appimage Debian 13 guest (Ubuntu 24.04 host) first start' if c.mode==MODE else 'Clean desktop deb first start'),'Wrong consumer lane')
    require('ubuntu-24.04' in consumer['labels'],'Not standard Ubuntu host')
    require(consumer['status']=='in_progress' or consumer['status']=='completed' and consumer.get('conclusion')=='success','Consumer failed')
    require(pins['sourceSha']==c.source_sha and pins['sourceTree']==c.source_tree and pins['workflowSha']==c.head_sha,'Proof source pins mismatch')
    require((pins['producerRunId'],pins['producerRunAttempt'],pins['producerJobId'])==(c.run_id,c.attempt,c.producer_job_id),'Proof producer mismatch')
    require(not any(k.startswith('ubuntu24') for k in pins),'Focused failure gate forbidden in live mode')
    def date(x):return datetime.fromisoformat(x.replace('Z','+00:00'))
    require(pins['artifactId']!=pins['proofArtifactId'] and pins['packageUploadStepNumber']!=pins['proofUploadStepNumber'],'Distinct uploads required')
    for a,name,idkey,hashkey,stepkey in ((s['installer'],'client-linux-x64','artifactId','artifactZipSha256','packageUploadStepNumber'),(s['proof'],'linux-build-proof','proofArtifactId','proofZipSha256','proofUploadStepNumber')):
        require(a['id']==pins[idkey] and a['name']==name and a['expired'] is False,'Wrong artifact')
        require(a['workflow_run']['id']==c.run_id and a['workflow_run']['head_sha']==c.head_sha and a['workflow_run'].get('head_branch')=='maintenance/v0.1.8-zh-cloud','Artifact outside current run')
        require(re.fullmatch('[0-9a-f]{64}',pins[hashkey]) and a['digest']=='sha256:'+pins[hashkey],'Artifact digest mismatch')
        require(date(a['expires_at'])>datetime.now(timezone.utc),'Expired artifact timestamp')
        require(type(a['size_in_bytes']) is int and a['size_in_bytes']>0,'Artifact size missing')
        steps=[x for x in j['steps'] if x['number']==pins[stepkey]]
        require(len(steps)==1 and steps[0]['status']=='completed' and steps[0]['conclusion']=='success','Upload not complete')
        step=steps[0]
        require(date(j['started_at'])<=date(step['started_at'])<=date(step['completed_at'])<=date(j['completed_at']),'Upload step outside producer job window')
        require(date(step['started_at'])-timedelta(seconds=1)<=date(a['created_at'])<=date(a['updated_at'])<=date(step['completed_at'])+timedelta(seconds=1),'Artifact outside upload window')
    validate_upload_logs(pins,j,log,[s['installer'],s['proof']])
    return {key:s[key] for key in ('producer','installer','proof')}
def validate_pair(c,before,after,pins,before_log,after_log):
    require(validate_snapshot(c,before,pins,before_log)==validate_snapshot(c,after,pins,after_log),'Immutable producer evidence changed during consumption')

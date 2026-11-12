"""Synthetic UI archives and API fixtures only. Never contacts GitHub or launches an app."""
import copy,hashlib,io,json,tempfile,unittest,zipfile
from pathlib import Path
import verify_ui as V
class UiEvidenceTests(unittest.TestCase):
 def pins(self):return json.loads(Path(__file__).with_name('ui-pin.json').read_text())
 def members(self,p):
  d={n:b'PUBLIC SYNTHETIC FIXTURE ONLY\n' for n in p['members']}
  j={
   'final-status.json':dict(sourceSha=V.SOURCE,sourceTree=V.TREE,operationSha=V.OPERATION,priorJobStatus='success',unitOutcome='success',scenarioOutcome='success',supplementalOnly=True,separate22ReleaseGatesRequired=True,installedAppAcceptance=False,sourceUnchanged=True,accepted=True),
   'provenance.json':dict(sourceSha=V.SOURCE,sourceTree=V.TREE,operationSha=V.OPERATION,operationTree=p['operation_tree'],workflowBlob=p['workflow_blob'],runId=V.RUN,runAttempt=1,testFiles=p['test_files'],testFilesSha256=V.TEST_HASH,scenarioSha256=V.SCENARIO_HASH,reviewedCaptureLabels=V.CAPTURES),
   'unit-summary.json':dict(sourceSha=V.SOURCE,files=p['test_files'],totalTests=1791,passedTests=1791,skippedTests=0,todoTests=0,unfinishedTests=0,incrementalCountsMatched=True,success=True),
   'unit-progress.json':dict(phase='ended',runEndReason='passed',countsComplete=True,integrityError=None,unhandledErrorCount=0,missing=[],inFlight=[],failedModules=[],observedCounts=dict(passed=1791,failed=0,skipped=0,pending=0,todo=0)),
   'scenario-report.json':dict(sourceSha=V.SOURCE,runStatus='passed',resultStatus='passed',attemptStatus='passed',exitCode=0,cleanup='complete',noModelCalls=True,noRetries=True,steps=[dict(status='passed') for _ in range(61)],exportedCaptures=V.CAPTURES),
  }
  for n in ['unit-verdict.json','scenario-verdict.json']:j[n]=dict(success=True,sourceSha=V.SOURCE,independentlyVerified=True)
  for n in ['unit-exit.json','scenario-exit.json']:j[n]=dict(code=0,signal=None,timedOut=False,sourceSha=V.SOURCE)
  for n in d:
   if n.endswith('.json'):d[n]=json.dumps(j.get(n,{'fixture':True})).encode()
   if n.endswith('.png'):d[n]=b'\x89PNG\r\n\x1a\nSYNTHETIC NOT IMAGE EVIDENCE'
  return d
 def archive(self,p,mutate=None):
  d=self.members(p)
  if mutate:mutate(d)
  p=copy.deepcopy(p);p['members']={n:V.sha(b) for n,b in d.items()};b=io.BytesIO()
  with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:
   for n,data in d.items():z.writestr(n,data)
  raw=b.getvalue();p['artifact'].update(size=len(raw),sha256=V.sha(raw));return p,raw
 def check(self,p,raw):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'fixture.zip';path.write_bytes(raw);return V.check_archive(path,p)
 def test_valid_complete_synthetic_archive(self):
  p,raw=self.archive(self.pins());V.check_pins(p);self.assertEqual(self.check(p,raw)['passed_tests'],1791)
 def test_reject_missing_extra_hash_and_zip_tampering(self):
  p,raw=self.archive(self.pins())
  for q in [dict(p,members={}),dict(p,artifact={**p['artifact'],'sha256':'0'*64})]:
   with self.assertRaises(ValueError):self.check(q,raw)
  with self.assertRaises(ValueError):self.check(p,raw+b'junk')
 def test_reject_all_partial_or_failed_ui_states_even_with_rehashed_fixture(self):
  changes=[('final-status.json','accepted',False),('final-status.json','sourceUnchanged',False),('unit-summary.json','passedTests',1790),('unit-summary.json','skippedTests',1),('unit-summary.json','files',[]),('unit-progress.json','missing',['missing']),('unit-progress.json','unhandledErrorCount',1),('unit-progress.json','countsComplete',False),('unit-exit.json','timedOut',True),('scenario-exit.json','code',1),('scenario-report.json','noRetries',False),('scenario-report.json','cleanup','failed'),('scenario-report.json','steps',[]),('scenario-report.json','exportedCaptures',[]),('scenario-verdict.json','success',False),('provenance.json','sourceTree','0'*40)]
  for name,key,value in changes:
   def mutate(d):
    obj=json.loads(d[name]);obj[key]=value;d[name]=json.dumps(obj).encode()
   p,raw=self.archive(self.pins(),mutate)
   with self.subTest(name=name,key=key),self.assertRaises(ValueError):self.check(p,raw)
 def test_reject_wrong_source_run_and_inventory_pins(self):
  p=self.pins()
  for k,v in [('source_sha','0'*40),('operation_sha','0'*40),('run_id',123),('run_attempt',2),('operation_tree','0'*40),('workflow_blob','0'*40),('test_files',[])]:
   q=copy.deepcopy(p);q[k]=v
   with self.subTest(k=k),self.assertRaises(ValueError):V.check_pins(q)
 def test_download_keeps_ui_specific_two_mib_bound(self):
  from unittest.mock import patch
  api=V.Api()
  with patch.object(api,'redirect_bytes',return_value=None) as read:
   api.download(V.ARTIFACT,Path('synthetic.zip'))
   read.assert_called_once_with('/actions/artifacts/'+str(V.ARTIFACT)+'/zip',Path('synthetic.zip'),2*1024*1024)
   with self.assertRaises(ValueError):api.download(1,Path('synthetic.zip'))
 def transport_fixture(self,mode='good'):
  p,raw=self.archive(self.pins());job=copy.deepcopy(p['producer']);upload=next(x for x in job['steps'] if x['name']==p['artifact']['upload_step_name']);at=upload['started_at'];pin=p['artifact']
  lines=['SHA256 digest of uploaded artifact is '+pin['sha256'],'Artifact '+pin['name']+' successfully finalized. Artifact ID '+str(pin['id']),'Artifact '+pin['name']+' has been successfully uploaded! Final size is '+str(pin['size'])+' bytes. Artifact ID is '+str(pin['id'])]
  log=('\n'.join(at+' '+line for line in lines)+'\n').encode();pin['producer_log_sha256']=V.sha(log)
  class Fake:
   calls=0
   def json(self,path):
    if path=='/actions/runs/'+str(V.RUN):
     self.calls+=1
     return dict(id=V.RUN,run_attempt=1,head_sha=V.OPERATION,head_branch=p['operation_branch'],path=V.WORKFLOW,status='completed',conclusion='success',event='push',repository={'full_name':'ZhiweiXiao98/t3code','private':False},head_repository={'full_name':'ZhiweiXiao98/t3code'})
    if '/jobs?' in path:
     j=copy.deepcopy(job)
     if mode=='wrong-producer':j['head_sha']='f'*40
     if mode=='latest-changed' and 'filter=latest' in path:j['id']+=1
     return dict(total_count=1,jobs=[j])
    if path=='/actions/artifacts/'+str(V.ARTIFACT):
     a=dict(id=pin['id'],name=pin['name'],size_in_bytes=pin['size'],digest='sha256:'+pin['sha256'],expired=False,expires_at='2099-01-01T00:00:00Z',created_at=at,updated_at=at,workflow_run={'id':V.RUN,'head_sha':V.OPERATION,'head_branch':p['operation_branch']})
     if mode=='expired':a['expired']=True
     if mode=='expired-timestamp':a['expires_at']='2000-01-01T00:00:00Z'
     if mode=='outside-upload':a['created_at']=a['updated_at']='2098-01-01T00:00:00Z'
     if mode=='state-changed' and self.calls>1:a['expires_at']='2098-01-01T00:00:00Z'
     return a
    if path=='/git/ref/heads/'+V.BRANCH:return {'object':{'sha':'f'*40 if mode=='source-moved' else V.SOURCE}}
    if path=='/git/commits/'+V.SOURCE:return {'tree':{'sha':V.TREE}}
    if path=='/git/ref/heads/'+p['operation_branch']:return {'object':{'sha':'f'*40 if mode=='operation-moved' else V.OPERATION}}
    if path=='/git/commits/'+V.OPERATION:return {'parents':[{'sha':'f'*40 if mode=='wrong-parent' else V.SOURCE}],'tree':{'sha':p['operation_tree']}}
    if path=='/compare/'+V.SOURCE+'...'+V.OPERATION:return {'status':'ahead','merge_base_commit':{'sha':V.SOURCE},'files':[{'filename':V.WORKFLOW,'status':'added'}]}
    raise AssertionError('Unexpected fixture API '+path)
   def download(self,artifact_id,destination):
    assert artifact_id==V.ARTIFACT;Path(destination).write_bytes(raw)
   def download_log(self,job_id,destination):
    assert job_id==job['id'];Path(destination).write_bytes(log+b'tamper' if mode=='log-digest' else log)
  return p,Fake()
 def test_full_mock_transport_and_upload_log(self):
  p,api=self.transport_fixture();proof=V.verify(p,api);self.assertEqual(proof['reviewed_files'],139);self.assertEqual(api.calls,2)
 def test_transport_races_producers_expiry_and_upload_fail_closed(self):
  for mode in ['wrong-producer','latest-changed','expired','expired-timestamp','outside-upload','state-changed','source-moved','operation-moved','wrong-parent','log-digest']:
   p,api=self.transport_fixture(mode)
   with self.subTest(mode=mode),self.assertRaises(ValueError):V.verify(p,api)

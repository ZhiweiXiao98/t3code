import pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import unittest,copy,hashlib
from live_contract import *
def fixture():
 c=LiveRun('ZhiweiXiao98/t3code',1,1,'a'*40,'a'*40,'b'*40,2,3)
 p=dict(sourceSha=c.source_sha,sourceTree=c.source_tree,workflowSha=c.head_sha,producerRunId=1,producerRunAttempt=1,producerJobId=2,artifactId=4,proofArtifactId=5,artifactZipSha256='c'*64,proofZipSha256='d'*64,packageUploadStepNumber=1,proofUploadStepNumber=2)
 t='2026-11-10T00:00:00Z';steps=[];arts=[];logs=[]
 for n,name,aid,digest in [(1,'client-linux-x64',4,'c'*64),(2,'linux-build-proof',5,'d'*64)]:
  steps.append(dict(number=n,name='Run actions/upload-artifact@v7',status='completed',conclusion='success',started_at=t,completed_at=t))
  arts.append(dict(id=aid,name=name,expired=False,workflow_run=dict(id=1,head_sha=c.head_sha,head_branch='maintenance/v0.1.8-zh-cloud'),digest='sha256:'+digest,size_in_bytes=100,created_at=t,updated_at=t,expires_at='2099-01-01T00:00:00Z'))
  logs.extend([f'{t} ##[group]Run actions/upload-artifact@v7',f'{t}   name: {name}',f'{t} Artifact ID: {aid}',f'{t} {digest}',f'{t} Artifact {name} has been successfully uploaded! Final size is 100 bytes. Artifact ID is {aid}'])
 log='\n'.join(logs);p['producerLogSha256']=hashlib.sha256(log.encode()).hexdigest()
 s=dict(repo=dict(private=False,full_name=c.repository),run=dict(id=1,run_attempt=1,head_sha=c.head_sha,status='in_progress',conclusion=None),producer=dict(id=2,run_id=1,run_attempt=1,head_sha=c.head_sha,name='Linux x64 and embedded Windows WSL runtime',status='completed',conclusion='success',steps=steps),consumer=dict(id=3,run_id=1,run_attempt=1,head_sha=c.head_sha,name='Clean desktop appimage Debian 13 guest (Ubuntu 24.04 host) first start',labels=['ubuntu-24.04'],status='in_progress'),installer=arts[0],proof=arts[1])
 s['run'].update(head_branch='maintenance/v0.1.8-zh-cloud',path='.github/workflows/client-release.yml',repository={'full_name':c.repository},head_repository={'full_name':c.repository})
 s['producer'].update(head_branch='maintenance/v0.1.8-zh-cloud',started_at=t,completed_at=t);s['consumer']['head_branch']='maintenance/v0.1.8-zh-cloud'
 return c,s,p,log
class Tests(unittest.TestCase):
 def test_live_run_no_deadlock(self):
  c,s,p,l=fixture();validate_pair(c,s,copy.deepcopy(s),p,l,l)
 def test_completed_green(self):
  c,s,p,l=fixture();s['run'].update(status='completed',conclusion='success');validate_snapshot(c,s,p,l)
 def test_negative_mutations(self):
  for section,key,value in [('run','id',9),('run','run_attempt',2),('run','head_sha','f'*40),('run','conclusion','failure'),('producer','status','in_progress'),('producer','conclusion','failure'),('producer','run_attempt',2),('consumer','id',7),('consumer','labels',['self-hosted']),('installer','id',6),('installer','size_in_bytes',101),('proof','name','focused-linux-build-proof'),('proof','expired',True),('installer','updated_at','2027-01-01T00:00:00Z')]:
   with self.subTest(section=section,key=key):
    c,s,p,l=fixture();s[section][key]=value
    with self.assertRaises(ValueError):validate_snapshot(c,s,p,l)
 def test_provenance_windows_and_expiry(self):
  for target,key,value in [('run','head_branch','maintenance/v0.1.7-zh-cloud'),('producer','head_branch','maintenance/v0.1.7-zh-cloud'),('run','head_branch','other'),('run','path','other.yml'),('run','repository',{'full_name':'other/repo'}),('producer','head_branch','other'),('producer','completed_at','2025-01-01T00:00:00Z'),('proof','expires_at','2000-01-01T00:00:00Z')]:
   with self.subTest(target=target,key=key):
    c,s,p,l=fixture();s[target][key]=value
    with self.assertRaises(ValueError):validate_snapshot(c,s,p,l)
 def test_native_live_mode(self):
  c,s,p,l=fixture();c=LiveRun(c.repository,c.run_id,c.attempt,c.head_sha,c.source_sha,c.source_tree,c.producer_job_id,c.consumer_job_id,'same-full-run-native-deb-v1');s['consumer']['name']='Clean desktop deb first start';validate_snapshot(c,s,p,l)
 def test_typed_mode(self):
  c,s,p,l=fixture()
  with self.assertRaises(ValueError):validate_snapshot(c.__dict__,s,p,l)
  with self.assertRaises(ValueError):LiveRun('ZhiweiXiao98/t3code',1,1,'a'*40,'a'*40,'b'*40,2,3,'focused')
 def test_old_failure_gate(self):
  c,s,p,l=fixture();p['ubuntu24Outcome']='failed'
  with self.assertRaises(ValueError):validate_snapshot(c,s,p,l)
 def test_log_tamper(self):
  c,s,p,l=fixture()
  with self.assertRaises(ValueError):validate_pair(c,s,s,p,l,l+'x')
 def test_upload_not_complete(self):
  c,s,p,l=fixture();s['producer']['steps'][0]['status']='in_progress'
  with self.assertRaises(ValueError):validate_snapshot(c,s,p,l)
if __name__=='__main__':unittest.main(verbosity=2)

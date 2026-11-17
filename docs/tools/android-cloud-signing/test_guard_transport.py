import unittest,json,copy,hashlib
from pathlib import Path
from unittest.mock import patch
import receipt_guard as V
P=Path(__file__).parent
class API:
 def __init__(self):self.data=json.loads((P/'test-fixtures/guard-live-metadata.json').read_text());self.calls=[]
 def json(self,k):self.calls.append(k);return copy.deepcopy(self.data[k])
class Tests(unittest.TestCase):
 def setUp(self):self.p=json.loads((P/'receipt-pins.BLOCKED.json').read_text());self.plan=json.loads((P/'receipt-collection-plan.json').read_text())
 def test_actual_metadata_and_transport_negatives(self):
  a=API();V.current(a,self.p,self.plan)
  for mode in ['source','collector-ref','collector-parent','collector-file','collector-blob','collector-rerun','collector-failed','collector-producer','artifact-expired','artifact-digest','artifact-time','old-source-ref','original-job','original-artifact','original-run']:
   a=API();d=a.data
   if mode=='source':d['/git/ref/heads/maintenance/v0.1.9-zh-cloud']['object']['sha']='0'*40
   elif mode=='collector-ref':d['/git/ref/heads/'+V.BRANCH]['object']['sha']='0'*40
   elif mode=='collector-parent':d['/git/commits/'+V.OP]['parents']=[]
   elif mode=='collector-file':d['/compare/'+V.SOURCE+'...'+V.OP]['files']=[]
   elif mode=='collector-blob':d['/compare/'+V.SOURCE+'...'+V.OP]['files'][0]['sha']='0'*40
   elif mode=='collector-rerun':d['/actions/runs/'+str(V.COLLECTOR)]['run_attempt']=2
   elif mode=='collector-failed':d['/actions/runs/'+str(V.COLLECTOR)]['conclusion']='failure'
   elif mode=='collector-producer':d['/actions/jobs/'+str(self.p['producer']['id'])]['conclusion']='skipped'
   elif mode.startswith('artifact-'):
    item=d['/actions/artifacts/'+str(self.p['artifact_id'])];item[{'artifact-expired':'expired','artifact-digest':'digest','artifact-time':'created_at'}[mode]]={'artifact-expired':True,'artifact-digest':'sha256:'+'0'*64,'artifact-time':'2000-01-01T00:00:00Z'}[mode]
   elif mode=='old-source-ref':d['/git/ref/heads/'+self.plan['runs'][1]['expected']['head_branch']]['object']['sha']='0'*40
   elif mode=='original-job':d['/actions/jobs/'+str(self.plan['jobs'][0]['id'])]['steps']=[]
   elif mode=='original-artifact':d['/actions/artifacts/'+str(self.plan['artifacts'][0]['id'])]['expired']=True
   else:d['/actions/runs/43901004126']['conclusion']='success'
   with self.subTest(mode=mode),self.assertRaises(ValueError):V.current(a,self.p,self.plan)
 def test_preflight_runs_before_download(self):
  # Mock only byte/materialization layer; exercise actual verify control-flow ordering.
  manifest=json.loads((P/'reviewed-signing-input.json').read_text())
  class Stop(Exception):pass
  calls=[]
  def current(*args):calls.append('current');return {'state':len(calls)}
  class FakeAPI:
   def download(self,*a):raise Stop()
  with patch.object(V,'current',side_effect=current),self.assertRaises(Stop):V.verify(FakeAPI(),manifest)
  self.assertEqual(calls,['current'])

 def test_complete_actual_packet_and_end_of_replay_race(self):
  import shutil
  class Full(API):
   def __init__(self,mode):super().__init__();self.mode=mode;self.refreads=0
   def download(self,id,dest,maximum):
    assert id==14293750072
    shutil.copyfile(P/'test-fixtures/collector-receipts.zip',dest)
    if self.mode=='corrupt':Path(dest).write_bytes(b'changed')
   def json(self,k):
    if k=='/git/ref/heads/maintenance/v0.1.9-zh-cloud':
     self.refreads+=1
     if self.mode=='race' and self.refreads>1:return {'object':{'sha':'0'*40}}
    return super().json(k)
  manifest=json.loads((P/'reviewed-signing-input.json').read_text())
  result=V.verify(Full('valid'),manifest);self.assertEqual(result['total_count'],26);self.assertEqual(result['ui_validation']['files'],330)
  for mode in ['race','corrupt']:
   with self.subTest(mode=mode),self.assertRaises(ValueError):V.verify(Full(mode),manifest)

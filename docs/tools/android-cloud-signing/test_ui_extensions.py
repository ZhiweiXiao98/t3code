"""Canonical orchestrator fixture, projected from partition1; mutants are not evidence."""
import unittest,json,copy
import verify_ui_extensions as v
from ui_test_fixture import extension_fixture
class Contracts(unittest.TestCase):
 def fixture(self):return extension_fixture()
 def test_positive_fixture(self):
  m,p=self.fixture();self.assertEqual(v.verify(m,p)['dual_compiled_toast_cases'],2)
 def test_negative_bindings(self):
  for field,value in [('sourceSha','e'*40),('runId','2'),('runAttempt',2),('platform','android'),('sourceFiles',{}),('command',[]),('code',True),('timedOut',True),('rawReportSha256','e'*64)]:
   m,p=self.fixture();x=json.loads(m['toast-ios-provenance.json']);x[field]=value;m['toast-ios-provenance.json']=json.dumps(x).encode()
   with self.subTest(field=field),self.assertRaises((ValueError,AssertionError)):v.verify(m,p)
 def test_consistency_failures(self):
  for mode in ['producer-time','toast-verdict','proof-bool','observer-bool']:
   m,p=self.fixture()
   if mode=='producer-time':p['producer_started_ms']+=1
   if mode=='toast-verdict':
    x=json.loads(m['toast-platform-verdict.json']);x['success']=False;m['toast-platform-verdict.json']=json.dumps(x).encode()
   if mode=='proof-bool':
    x=json.loads(m['toast-ios-provenance.json']);x['proof']['passed']=True;m['toast-ios-provenance.json']=json.dumps(x).encode()
   if mode=='observer-bool':
    x=json.loads(m['observer-verdict.json']);x['counts']['qualified']=True;m['observer-verdict.json']=json.dumps(x).encode()
   with self.subTest(mode=mode),self.assertRaises((ValueError,AssertionError)):v.verify(m,p)
 def test_negative_observer(self):
  for mode in ['duplicate','budget','zero','attempt','missing','stale','identity']:
   m,p=self.fixture()
   if mode=='duplicate':m['browser-lifecycle.jsonl']=m['browser-lifecycle.jsonl'].replace(b'{',b'{"category":"secret","category":"normal",',1)
   if mode=='budget':m['unit.log']=b'Web lifecycle observation stopped: byte budget reached.'
   if mode in ['zero','stale']:
    rows=[json.loads(x) for x in m['browser-lifecycle.jsonl'].splitlines()]
    for row in rows:
     if mode=='zero' and 'sent_data_count' in row:row['sent_data_count']=0
     if mode=='stale':row['utc_ms']=-1
    m['browser-lifecycle.jsonl']='\n'.join(map(json.dumps,rows)).encode()
   if mode=='attempt':
    x=json.loads(m['observer-verdict.json']);x['runAttempt']=2;m['observer-verdict.json']=json.dumps(x).encode()
   if mode=='missing':del m['toast-android-raw.json']
   if mode=='identity':m['module-identity.json']=b'{}'
   with self.subTest(mode=mode),self.assertRaises((ValueError,AssertionError,KeyError)):v.verify(m,p)
if __name__=='__main__':unittest.main()

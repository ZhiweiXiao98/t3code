"""Four-partition migration of legacy single-process UI gate tests; offline only."""
import copy,json,tempfile,unittest,zipfile,io
from pathlib import Path
import verify_ui_partitions as V
import verify_supplemental as transport
from ui_test_fixture import PIN,RAW,members,repack,mutate
class UiEvidenceTests(unittest.TestCase):
 def test_valid_complete_actual_four_process_archive(self):
  result=V.verify_bytes(RAW,PIN);self.assertEqual(result['passed_tests'],3045)
 def test_reject_missing_extra_hash_and_zip_tampering(self):
  for p in [dict(PIN,members={}),dict(PIN,artifact={**PIN['artifact'],'sha256':'0'*64})]:
   with self.assertRaises(ValueError):V.verify_bytes(RAW,p)
  with self.assertRaises(ValueError):V.verify_bytes(RAW+b'junk',PIN)
  m=members();m['extra-file']=b'unexpected';raw,p=repack(m);p['members'].pop('extra-file')
  with self.assertRaises(ValueError):V.verify_bytes(raw,p)
 def test_reject_all_partial_or_failed_ui_states_even_with_rehashed_fixture(self):
  changes=[('final-status.json','accepted',False),('final-status.json','sourceUnchanged',False),('partition-1-unit-summary.json','passedTests',1),('partition-1-unit-summary.json','skippedTests',1),('partition-1-unit-summary.json','files',[]),('partition-1-unit-progress.json','missing',['missing']),('partition-1-unit-progress.json','unhandledErrorCount',1),('partition-1-unit-progress.json','countsComplete',False),('partition-1-unit-exit.json','timedOut',True),('scenario-exit.json','code',1),('scenario-report.json','noRetries',False),('scenario-report.json','cleanup','failed'),('scenario-report.json','steps',[]),('scenario-report.json','exportedCaptures',[]),('scenario-verdict.json','success',False),('provenance.json','sourceTree','0'*40)]
  for name,key,value in changes:
   raw,p=mutate(name,key,value)
   with self.subTest(name=name,key=key),self.assertRaises((ValueError,AssertionError)):V.verify_bytes(raw,p)
 def test_reject_wrong_source_run_and_inventory_pins(self):
  for key,val in [('source_sha','0'*40),('source_tree','0'*40),('operation_sha','0'*40),('run_id',1),('run_attempt',2),('test_files',[]),('schema','single-process')]:
   p=copy.deepcopy(PIN);p[key]=val
   with self.subTest(key=key),self.assertRaises(ValueError):V.verify_bytes(RAW,p)
 def test_four_partition_no_missing_duplicate_or_fabricated_union(self):
  for mode in ['missing','duplicate','source','union']:
   m=members();name='unit-partitions.json';d=json.loads(m[name])
   if mode=='missing':d['receipts'].pop()
   elif mode=='duplicate':d['receipts'].append(d['receipts'][0])
   elif mode=='source':d['receipts'][0]['sourceSha']='0'*40
   else:
    name='unit-summary.json';d=json.loads(m[name]);d['execution']='single-process'
   m[name]=json.dumps(d).encode();raw,p=repack(m)
   with self.subTest(mode=mode),self.assertRaises((ValueError,AssertionError)):V.verify_bytes(raw,p)
 def test_screenshots_mandatory(self):
  m=members();m['menu-zh-open.png']=b'not PNG';raw,p=repack(m)
  with self.assertRaises(ValueError):V.verify_bytes(raw,p)
 def test_full_mock_transport_and_upload_log(self):
  # The old transport is now shared original verify_upload_log, not legacyUI.verify.
  import hashlib
  p={'producer_job_id':1,'upload_step_name':'upload','id':2,'name':'ui','size':3,'sha256':'a'*64}
  lines=['SHA256 digest of uploaded artifact is '+p['sha256'],'Artifact ui successfully finalized. Artifact ID 2','Artifact ui has been successfully uploaded! Final size is 3 bytes. Artifact ID is 2']
  raw=''.join('2026-11-17T00:00:01Z '+x+'\n' for x in lines).encode();p['producer_log_sha256']=hashlib.sha256(raw).hexdigest();j={'id':1,'steps':[{'name':'upload','started_at':'2026-11-17T00:00:00Z','completed_at':'2026-11-17T00:00:03Z'}]}
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'job-1.log';path.write_bytes(raw);transport.verify_upload_log(None,p,[j],tmp)
   path.write_bytes(raw+b'changed')
   with self.assertRaises(ValueError):transport.verify_upload_log(None,p,[j],tmp)
if __name__=='__main__':unittest.main()

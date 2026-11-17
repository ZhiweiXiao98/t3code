import unittest,json,copy,hashlib,zipfile,tempfile,ast
from pathlib import Path
import gate_receipts as g
import receipt_guard as v
D=Path(__file__).parent
class Tests(unittest.TestCase):
 def fixture(self):
  p=json.loads((D/'receipt-collection-plan.json').read_text());r={'source':g.SOURCE,'tree':g.TREE,'logical_gates':p['logical_gates'],'runs':[x['expected'] for x in p['runs']],'jobs':[{'id':x['id'],'api':x['api_snapshot']} for x in p['jobs']]};return p,copy.deepcopy(r)
 def test_actual_original_gate_snapshots_without_extra_artifact_or_logs(self):
  p,r=self.fixture();j=g.verify_plan(p,r);self.assertEqual(len(j),26);self.assertEqual(r['runs'][0]['conclusion'],'failure')
  # This API-equivalence layer deliberately requires neither raw logs nor full binaries.
  self.assertNotIn('artifacts',r)
 def test_negative_every_gate(self):
  for key in g.GATES:
   for mode in ['failed','cancelled','wrongsource','wrongattempt','wrongOS','missingstep']:
    p,r=self.fixture();id=p['logical_gates'][key]['job_id'];j=next(x['api'] for x in r['jobs'] if x['id']==id)
    if mode in ['failed','cancelled']:j['conclusion']=mode
    elif mode=='wrongsource':j['head_sha']='0'*40
    elif mode=='wrongattempt':j['run_attempt']+=1
    elif mode=='wrongOS':j['labels']=['macos-26']
    else:j['steps'].pop()
    with self.subTest(key=key,mode=mode),self.assertRaises(ValueError):g.verify_plan(p,r)
 def test_inventory_and_historical_outcome(self):
  for mode in ['missing','duplicate','green','source']:
   p,r=self.fixture()
   if mode=='missing':r['jobs'].pop()
   elif mode=='duplicate':r['jobs'].append(r['jobs'][0])
   elif mode=='green':r['runs'][0]['conclusion']='success'
   else:r['source']='0'*40
   with self.assertRaises(ValueError):g.verify_plan(p,r)
 def test_unknown_actual_pins_block(self):
  with self.assertRaises(ValueError):v.load_pins({'receipt_pins_sha256':None})
  raw=(D/'receipt-pins.BLOCKED.json').read_bytes()
  self.assertTrue(v.load_pins({'receipt_pins_sha256':hashlib.sha256(raw).hexdigest()})['ready'])
  with self.assertRaises(ValueError):v.load_pins({'receipt_pins_sha256':'0'*64})
 def test_synthetic_archive_safety(self):
  for name in ['receipt.json','../escape','folder/receipt','/absolute']:
   with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);z=root/'in.zip';out=root/'out';out.mkdir()
    with zipfile.ZipFile(z,'w') as f:f.writestr(name,b'{}')
    raw=z.read_bytes();p={'zip_size':len(raw),'zip_sha256':v.sha(raw),'members':{name:{'size':2,'sha256':v.sha(b'{}')}}}
    if name=='receipt.json':v.unpack(z,p,out)
    else:
     with self.assertRaises(ValueError):v.unpack(z,p,out)
 def test_identity_and_disabled_signing(self):
  s=(D/'sign_reviewed.py').read_text();tree=ast.parse(s);f=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='read_input');self.assertTrue(any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='validate_input' for n in ast.walk(f)))
  self.assertNotIn('verify_ui.verify()',s);self.assertNotIn('check_jobs(',s)
  constants={n.targets[0].id:ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ['CERT','KEY_HASH','RECOVERY_RUN','RECOVERY_ARTIFACT','RECOVERY_ZIP_SHA256']}
  baseline=(D/'test-fixtures/original-sign-reviewed.py').read_bytes()
  self.assertEqual(hashlib.sha1(b'blob '+str(len(baseline)).encode()+b'\0'+baseline).hexdigest(),'afbc2cea9ac491354c11f1147e33845698adb3c4')
  original=ast.parse(baseline.decode())
  other={n.targets[0].id:ast.literal_eval(n.value) for n in original.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in constants}
  self.assertEqual(constants,other)
if __name__=='__main__':unittest.main()

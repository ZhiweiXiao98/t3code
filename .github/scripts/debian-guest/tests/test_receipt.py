import unittest,tempfile,pathlib,json,sys,copy
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import test_runtime,test_native_contract,test_live_contract as tests,common,live_io,collect_evidence,validate_receipt
class Receipt(unittest.TestCase):
 def fixture(self,base,kind="appimage"):
  work=base/'work';work.mkdir();results=work/'results';results.mkdir();m,v=(test_runtime.Results().fixture(results) if kind=='appimage' else test_native_contract.Native().fixture(results))
  c,e,p,log=tests.fixture();m.update(p,consumerJobId=3,installerBytes=100)
  if kind=='deb':m.update(debZipPath='T3.deb',debProofPath='release/T3.deb');e['consumer']['name']='Clean desktop deb first start'
  v['cjk/linux-chinese-ui.json']['producer']={'run_id':1,'run_attempt':1,'artifact_id':4}
  for name,value in v.items():(results/name).write_text(json.dumps(value))
  (work/'github-evidence.json').write_text(json.dumps(e));(work/'github-evidence-after.json').write_text(json.dumps(e));(work/'producer-job.log').write_text(log)
  (work/'host-provenance.json').write_text(json.dumps({'imageSha512':common.IMAGE_SHA,'accelerator':['-accel','tcg,thread=multi','-cpu','max']}))
  original=pathlib.Path.read_text
  def fake(path,*args,**kw):return 'ID=ubuntu\nVERSION_ID="24.04"\n' if str(path)=='/etc/os-release' else original(path,*args,**kw)
  with patch.object(pathlib.Path,'read_text',fake):live_io.emit_provenance(work,m,e)
  dest=base/'receipt';collect_evidence.collect(work,dest);return dest
 def test_roundtrip(self):
  with tempfile.TemporaryDirectory() as d:validate_receipt.validate(self.fixture(pathlib.Path(d)))
 def test_native_roundtrip(self):
  with tempfile.TemporaryDirectory() as d:validate_receipt.validate(self.fixture(pathlib.Path(d),'deb'))
 def test_native_relabel_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   dest=self.fixture(pathlib.Path(d),'deb');p=json.loads((dest/'provenance.json').read_text());p['mode']='same-full-run-debian13-v1';(dest/'provenance.json').write_text(json.dumps(p))
   with self.assertRaises(ValueError):validate_receipt.validate(dest)
 def test_mutated_raw_and_metadata(self):
  for mode in ('producer','runtime','inventory','png'):
   with self.subTest(mode=mode),tempfile.TemporaryDirectory() as d:
    dest=self.fixture(pathlib.Path(d));p=json.loads((dest/'provenance.json').read_text())
    if mode=='producer':p['producer']['jobId']=999
    if mode=='runtime':p['runtime']['execution']['id']='ubuntu'
    if mode=='inventory':p['files'][0]['sha256']='0'*64
    if mode=='png':(dest/'results/clean/clean-first-render.png').write_bytes(b'junk')
    (dest/'provenance.json').write_text(json.dumps(p))
    with self.assertRaises(ValueError):validate_receipt.validate(dest)
if __name__=='__main__':unittest.main(verbosity=2)

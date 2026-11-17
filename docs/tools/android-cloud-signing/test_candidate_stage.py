import unittest,copy,hashlib,json,ast
from pathlib import Path
import candidate_stage as c
class Tests(unittest.TestCase):
 def fixture(self):
  b=b'synthetic signed candidate';p={'source_sha':c.SOURCE,'candidate_source_sha':c.SOURCE,'candidate_run_id':43901004126,'candidate_artifact_id':14246066879,'candidate_unsigned_apk_sha256':c.UNSIGNED,'candidate_artifact_sha256':c.ZIP,'certificate_sha256':c.CERT,'apk_signature_verified':True,'distribution_state':'signed-candidate-not-published','installed_app_acceptance':False,'publication_performed':False,'signed_apk_sha256':hashlib.sha256(b).hexdigest(),'signed_apk_size':len(b)};return b,p
 def call(self,b,p):return c.check_candidate(b,p,c.CERT,'com.zhiweixiao.t3code.zhcn','0.1.9-zh.2',1000417,['arm64-v8a'])
 def test_stage_and_reject_mutations(self):
  b,p=self.fixture();self.call(b,p)
  for k,v in [('source_sha','0'*40),('certificate_sha256','0'*64),('candidate_unsigned_apk_sha256','0'*64),('candidate_artifact_id',1),('publication_performed',True),('installed_app_acceptance',True),('signed_apk_sha256','0'*64),('signed_apk_size',0)]:
   q=copy.deepcopy(p);q[k]=v
   with self.subTest(field=k),self.assertRaises(ValueError):self.call(b,q)
  with self.assertRaises(ValueError):self.call(b+b'changed',p)
 def test_wrong_abi_or_certificate(self):
  b,p=self.fixture()
  for cert,abis in [(c.CERT,['x86_64']),('0'*64,['arm64-v8a'])]:
   with self.assertRaises(ValueError):c.check_candidate(b,p,cert,'com.zhiweixiao.t3code.zhcn','0.1.9-zh.2',1000417,abis)
 def test_blocked_input_and_signer(self):
  with self.assertRaises(ValueError):c.validate_install_input({'ready':False})
  import sign_reviewed as signer
  m=json.loads(Path(signer.__file__).with_name('reviewed-signing-input.json').read_text());m['enabled']=False
  with self.assertRaises(ValueError):signer.validate_input(m)
if __name__=='__main__':unittest.main()

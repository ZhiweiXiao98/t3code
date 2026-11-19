import base64, unittest
from unittest.mock import patch
import signer_adapter as a
import signing_orchestrator as o
class Diagnostics(unittest.TestCase):
 def test_fixed_codes(self):
  for module in (a,o):
   for code in module.STAGE_CODES:
    self.assertEqual(str(module.StageFailure(code)), 'T3_SIGN_STAGE_'+code)
   for bad in ('secret-string /path tool-output fingerprint', '', None, [], {}):
    self.assertEqual(str(module.StageFailure(bad)), 'T3_SIGN_STAGE_preflight')
   self.assertEqual(module.failure_code(ValueError('secret-string')), 'preflight')
 def test_authorization_error_sanitized(self):
  with self.assertRaises(a.StageFailure) as caught:
   a.sign_candidate('never-open','never-open',b'never-read','never-create',authorization=None)
  self.assertEqual(str(caught.exception),'T3_SIGN_STAGE_preflight')
 def test_outer_strip_only(self):
  encoded=base64.b64encode(b'SYNTHETIC ONLY').decode()
  self.assertEqual(base64.b64decode((' \r\n'+encoded+'\t ').strip(),validate=True),b'SYNTHETIC ONLY')
  with self.assertRaises(ValueError):base64.b64decode(encoded[:4]+'\n'+encoded[4:],validate=True)
  with self.assertRaises(ValueError):base64.b64decode((' '+encoded+' ! ').strip(),validate=True)
 def test_orchestrator_preflight_sanitized(self):
  with patch.object(o.argparse.ArgumentParser,'parse_args',side_effect=ValueError('SECRET TOOL /path 123 fingerprint')):
   with self.assertRaises(o.StageFailure) as caught:o.main()
  self.assertEqual(str(caught.exception),'T3_SIGN_STAGE_preflight')

import unittest,subprocess,sys,tempfile,pathlib,json
from diagnostic_errors import observe,failure_kind
from validate_export import check
from test_privacy_transport import CELL,TRUST,CANARY
sys.path.insert(0,str(pathlib.Path(__file__).parent/'vendor'))
from common import run
class Errors(unittest.TestCase):
 def record(self):return {'schemaVersion':1,'diagnosticOnly':True,'outcome':'capture-unavailable','phase':'stackwalk-execution','stacks':[],'source':CELL['source'],'appimageSha256':CELL['appimage']['sha256']}
 def test_real_process_exit_and_timeout_safely_recorded(self):
  with tempfile.TemporaryDirectory() as d,open(pathlib.Path(d)/'log','wb') as f:
   r=observe(run,[sys.executable,'-c',f"import sys;print('{CANARY}');sys.exit(17)"],2,stdout=f,stderr=subprocess.STDOUT)
   self.assertEqual(r,{'exitCode':17,'failureCode':'subprocess-failed'});self.assertNotIn(CANARY,json.dumps(r))
   r=observe(run,[sys.executable,'-c','import time;time.sleep(3)'],0.1,stdout=f,stderr=subprocess.STDOUT)
   self.assertEqual(r,{'failureCode':'timeout'})
 def test_schema_failure_enums_reject_text(self):
  r=self.record();r.update(failureCode='timeout',dumpCount=1,officialSymbolCount=1,cleanResult={'exitCode':-11,'failureCode':'subprocess-failed'})
  check(r,CELL,TRUST)
  for key,value in [('failureCode',CANARY),('phase',CANARY),('dumpCount',9),('failedCommandExitCode',True),('cleanResult',{'failureCode':CANARY}),('cjkResult',{'exception':CANARY})]:
   with self.subTest(key=key),self.assertRaises(ValueError):check({**r,key:value},CELL,TRUST)
 def test_exception_strings_never_in_classification(self):
  for e in [ValueError(CANARY),KeyError(CANARY),OSError(CANARY),RuntimeError(CANARY),subprocess.CalledProcessError(17,[CANARY])]:self.assertNotIn(CANARY,failure_kind(e))
 def test_direct_symbol_file_args_and_strict_match_retained(self):
  s=(pathlib.Path(__file__).parent/'diagnostic_guest.py').read_text()
  self.assertIn("str(dump),*symbol_files]",s)
  self.assertNotIn("str(dump),str(P/'symbols')]",s)
  self.assertIn("module.get('loaded_symbols') is True",s)
  self.assertIn("result['phase']='stackwalk-output-parse'",s)
  self.assertIn("result['phase']='symbol-match-validation'",s)
if __name__=='__main__':unittest.main()

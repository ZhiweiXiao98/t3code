import json,pathlib,tempfile,unittest,signal,os,threading,subprocess
from unittest.mock import patch
import build_diag as d
class Tests(unittest.TestCase):
 def test_private_text_not_exported(self):
  secret=b'password=EXAMPLE_PRIVATE /home/private/account.c:1 error: secret-value'
  self.assertEqual(d.diagnostic_codes(secret),['unclassified_diagnostic'])
 def test_fixed_warning(self):
  self.assertEqual(d.diagnostic_codes(b'error: ignoring return value [-Werror=unused-result]'),['ignored_result'])
 def test_source_failure_receipt(self):
  with tempfile.TemporaryDirectory() as t:
   out=pathlib.Path(t)/'result.json';self.assertEqual(d.main(t,out),1)
   data=json.loads(out.read_text());self.assertFalse(data['probeExecuted']);self.assertEqual(data['stages'][-1]['stage'],'controller')
 def test_compile_failure_receipt(self):
  with tempfile.TemporaryDirectory() as t:
   out=pathlib.Path(t)/'result.json'
   with patch.object(d,'SOURCE_HASHES',{}),patch.object(d,'run',return_value=('command_failed',1,b'',b'PRIVATE [-Werror=unused-result]')):
    self.assertEqual(d.main(t,out),1)
   text=out.read_text();self.assertNotIn('PRIVATE',text)
   self.assertEqual(json.loads(text)['stages'][0]['diagnosticCodes'],['ignored_result'])
 def test_running_stage_saved_before_command(self):
  with tempfile.TemporaryDirectory() as t:
   out=pathlib.Path(t)/'result.json'
   def command(*args):
    self.assertEqual(json.loads(out.read_text())['stages'][-1]['status'],'running')
    return 'command_failed',1,b'',b''
   with patch.object(d,'SOURCE_HASHES',{}),patch.object(d,'run',side_effect=command):self.assertEqual(d.main(t,out),1)
 def test_cancel_reaps_owned_child(self):
  seen=[];original=subprocess.Popen;old=signal.signal(signal.SIGTERM,d.cancelled)
  def create(*args,**kw):
   child=original(*args,**kw);seen.append(child);return child
  timer=threading.Timer(0.15,lambda:os.kill(os.getpid(),signal.SIGTERM))
  try:
   timer.start()
   with patch.object(d.subprocess,'Popen',side_effect=create),self.assertRaises(d.Cancelled):d.run(['/usr/bin/python3','-c','import time;time.sleep(2)'],'.')
   self.assertIsNotNone(seen[0].poll())
  finally:
   timer.cancel();timer.join();signal.signal(signal.SIGTERM,old)
   for child in seen:
    if child.poll() is None:child.kill();child.wait()
 def test_retained_binary_identity(self):
  with tempfile.TemporaryDirectory() as t:
   out=pathlib.Path(t)/'result.json';data=bytes.fromhex('c5c576ffc4413857c0c462459004a1')
   def command(argv,cwd):
    if argv[0]=='gcc':(pathlib.Path(cwd)/'probe').write_bytes(data)
    raw=b'c4 62 45 90 04 a1  vpgatherdd %ymm7,(%rcx,%ymm4,4),%ymm8' if argv[0]=='objdump' else b''
    return 'passed',0,raw,b''
   with patch.object(d,'SOURCE_HASHES',{}),patch.object(d,'run',side_effect=command):self.assertEqual(d.main(t,out,True),0)
   self.assertEqual((pathlib.Path(t)/'probe').read_bytes(),data)
   self.assertTrue((pathlib.Path(t)/'probe').stat().st_mode & 0o100)
   self.assertEqual(json.loads(out.read_text())['binarySha256'],d.hashlib.sha256(data).hexdigest())
if __name__=='__main__':unittest.main()

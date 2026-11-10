"""Synthetic write tests only; no device, guest, app, network or poweroff."""
import ast,base64,gzip,hashlib,io,json,os,pathlib,sys,tempfile,types,unittest,random
from unittest.mock import patch
ROOT=pathlib.Path(__file__).parent
HELPERS=ROOT.parent
sys.path.insert(0,str(HELPERS))
import guest,host
class Writer:
 def __init__(self,limit,interrupt=False,zero=False):self.limit=limit;self.interrupt=interrupt;self.zero=zero;self.data=bytearray();self.calls=0
 def write(self,data):
  self.calls+=1
  if self.interrupt:self.interrupt=False;raise InterruptedError('synthetic EINTR')
  if self.zero:return 0
  n=min(len(data),self.limit);self.data.extend(data[:n]);return n
 def __enter__(self):return self
 def __exit__(self,*args):pass
class Tests(unittest.TestCase):
 def functions(self):
  code=host.seed_config({})['write_files'][0]['content'];module=ast.parse(code);fn=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='write_all');scope={};exec('import time\n'+ast.unparse(fn),scope)
  return [guest.write_all,scope['write_all']]
 def test_exact_full_bytes_32k_and_small_chunks(self):
  data=random.Random(0).randbytes(482215)
  for f in self.functions():
   for limit in (32768,8191,7,1):
    w=Writer(limit);self.assertEqual(f(w,data),len(data));self.assertEqual(bytes(w.data),data)
 def test_interrupted_write_resumes_same_offset(self):
  for f in self.functions():
   w=Writer(17,interrupt=True);data=b'unchanged-frame'*100;f(w,data);self.assertEqual(bytes(w.data),data)
 def test_zero_progress_fails(self):
  for f in self.functions():
   with self.assertRaises(OSError):f(Writer(10,zero=True),b'frame')
 def test_invalid_return_and_deadline(self):
  for f in self.functions():
   for value in (None,-1,True,99):
    w=Writer(10);w.write=lambda data:value
    with self.assertRaises(OSError):f(w,b'frame')
   with patch('time.monotonic',side_effect=[0,121]):
    with self.assertRaises(TimeoutError):f(Writer(10),b'frame')
 def test_repeated_interruptions_fail(self):
  def fail(data):raise InterruptedError()
  for f in self.functions():
   w=Writer(10);w.write=fail
   with self.assertRaises(TimeoutError):f(w,b'frame')
 def test_actual_emit_preserves_complete_framing(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/'status.json').write_text('{"result":"failed","exitCode":1}');(root/'random.bin').write_bytes(random.Random(0).randbytes(482215));frame=guest.serial_archive(root)
   self.assertGreater(len(frame),32768)
   for limit in (32768,97):
    w=Writer(limit,interrupt=True)
    with patch.object(guest,'serial_archive',return_value=frame),patch('builtins.open',return_value=w):guest.emit(root)
    self.assertEqual(bytes(w.data),frame);self.assertTrue(w.data.endswith(b'T3_RESULT_END\n'))
 def run_seed(self,writer):
  code=host.seed_config({})['write_files'][0]['content'];fake=types.SimpleNamespace(main=lambda:(_ for _ in ()).throw(RuntimeError('synthetic startup failure')))
  with patch.dict(sys.modules,{'guest':fake}),patch('pathlib.Path.mkdir'),patch('subprocess.run') as run,patch('builtins.open',return_value=writer),patch.object(sys,'path',list(sys.path)),patch('sys.stderr',io.StringIO()):
   with self.assertRaises(SystemExit) as exit:exec(compile(code,'synthetic-seed','exec'),{'__name__':'__main__'})
   self.assertEqual(exit.exception.code,1);self.assertTrue(any(call.args[0]==['systemctl','poweroff'] for call in run.call_args_list))
 def test_actual_seed_failure_frame_short_write_and_cleanup(self):
  w=Writer(7,interrupt=True);self.run_seed(w);data=bytes(w.data);self.assertTrue(data.endswith(b'T3_RESULT_END\n'))
  lines=data.splitlines();header=next(x for x in lines if x.startswith(b'T3_RESULT_BEGIN'));size,digest=header.split()[1:];body=data.split(header+b'\n',1)[1].split(b'\nT3_RESULT_END')[0];packed=base64.decodebytes(body)
  self.assertEqual(len(packed),int(size));self.assertEqual(hashlib.sha256(packed).hexdigest().encode(),digest)
  self.assertNotIn(b'"passed"',gzip.decompress(packed))
 def test_seed_zero_progress_still_powers_off(self):
  w=Writer(7,zero=True);self.run_seed(w);self.assertEqual(bytes(w.data),b'')
if __name__=='__main__':unittest.main(verbosity=2)

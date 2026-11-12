import os,pathlib,signal,subprocess,sys,tempfile,time,unittest
HERE=pathlib.Path(__file__).parent
class Cancellation(unittest.TestCase):
 def test_sigterm_and_sigint_reap_owned_process_group(self):
  for sig in [signal.SIGTERM,signal.SIGINT]:
   with self.subTest(signal=sig),tempfile.TemporaryDirectory() as d:
    root=pathlib.Path(d);pidfile=root/'child';ready=root/'ready'
    script='''import pathlib,subprocess,sys,time
sys.path.insert(0,sys.argv[1])
from diagnostic_host import install_cancellation_handlers,stop_owned_process,OperationCancelled
install_cancellation_handlers()
p=None
try:
 p=subprocess.Popen([sys.executable,'-c',"import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);print('ready',flush=True);time.sleep(60)"],start_new_session=True,stdout=subprocess.PIPE,text=True)
 p.stdout.readline()
 pathlib.Path(sys.argv[2]).write_text(str(p.pid))
 pathlib.Path(sys.argv[3]).touch()
 while True:time.sleep(.01)
except OperationCancelled:pass
finally:
 stop_owned_process(p)
 if p and p.stdout:p.stdout.close()
'''
    process=subprocess.Popen([sys.executable,'-c',script,str(HERE),str(pidfile),str(ready)])
    try:
     deadline=time.monotonic()+5
     while not ready.exists() and time.monotonic()<deadline:time.sleep(.01)
     self.assertTrue(ready.exists());child=int(pidfile.read_text())
     process.send_signal(sig);self.assertEqual(process.wait(timeout=7),0)
     with self.assertRaises(ProcessLookupError):os.kill(child,0)
    finally:
     if process.poll() is None:process.kill();process.wait(timeout=2)

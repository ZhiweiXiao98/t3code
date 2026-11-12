import io,json,os,pathlib,subprocess,sys,tempfile,time,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from cjk_budget import CjkBudget,TOTAL_SECONDS,ROUNDTRIP,OVERVIEWS
from common import run
class CjkBudgetTests(unittest.TestCase):
 def budget(self,root):
  self.now=0;return CjkBudget(root,clock=lambda:self.now,emit=lambda *a,**k:None)
 def touch(self,root,names):
  (root/'cjk').mkdir(exist_ok=True)
  for name in names:(root/'cjk'/name).touch()
 def test_observed_8734_trace_does_not_exhaust_before_roundtrip(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);b=self.budget(root)
   for when,name in zip([144.4,187.7,318.8,345.6],ROUNDTRIP):
    self.now=when;self.touch(root,[name]);b.tick()
   self.now=360;b.tick() # Previous whole-command deadline killed here.
   self.now=410;self.touch(root,ROUNDTRIP[-2:]);b.tick()
   self.assertEqual(b.phase,'settings-overviews')
   self.now=550;self.touch(root,['settings-'+n+'-zh-CN.png' for n in OVERVIEWS]);b.tick()
   self.assertEqual(b.phase,'supplemental-audit');self.now=760;b.tick();b.finish(True)
   report=json.loads((root/'cjk-progress.json').read_text());self.assertEqual(report['events'][-1]['event'],'command-complete')
 def test_stuck_initial_phase_fails_at_480_not_900(self):
  with tempfile.TemporaryDirectory() as d:
   b=self.budget(pathlib.Path(d));self.now=480
   with self.assertRaises(TimeoutError):b.tick()
 def test_late_checkpoint_cannot_reset_deadline(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);b=self.budget(root);self.now=481;self.touch(root,ROUNDTRIP)
   with self.assertRaises(TimeoutError):b.tick()
   self.assertEqual(b.phase,'language-roundtrip')
 def test_overview_and_total_limits(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);b=self.budget(root);self.now=400;self.touch(root,ROUNDTRIP);b.tick();self.now=580
   with self.assertRaises(TimeoutError):b.tick()
  with tempfile.TemporaryDirectory() as d:
   b=self.budget(pathlib.Path(d));self.now=900
   with self.assertRaises(TimeoutError):b.tick()
 def test_unknown_filenames_and_symlinks_do_not_advance(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);b=self.budget(root);self.touch(root,['SYNTHETIC_PASSWORD_CANARY.png'])
   (root/'cjk'/ROUNDTRIP[-1]).symlink_to(root/'cjk/SYNTHETIC_PASSWORD_CANARY.png');self.now=30;b.tick()
   self.assertEqual(b.seen,set());self.assertNotIn('SYNTHETIC_PASSWORD',(root/'cjk-progress.json').read_text())
 def test_progress_exception_kills_real_owned_child(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);pidfile=root/'pid';command=[sys.executable,'-c',"import pathlib,os,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)",str(pidfile)]
   def progress():
    if pidfile.exists():raise TimeoutError('Synthetic stage deadline')
   with open(root/'log','wb') as log,self.assertRaises(TimeoutError):run(command,10,progress=progress,stdout=log,stderr=subprocess.STDOUT)
   with self.assertRaises(ProcessLookupError):os.kill(int(pidfile.read_text()),0)
 def test_closed_output_still_polls_stage_watchdog(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);pidfile=root/'pid';started=time.monotonic()
   command=[sys.executable,'-c',"import pathlib,os,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));os.close(1);os.close(2);time.sleep(30)",str(pidfile)]
   def progress():
    if time.monotonic()-started>=0.4:raise TimeoutError('Synthetic closed-output stage deadline')
   with open(root/'log','wb') as log,self.assertRaisesRegex(TimeoutError,'Synthetic closed-output stage deadline'):
    run(command,2,progress=progress,stdout=log,stderr=subprocess.STDOUT)
   self.assertLess(time.monotonic()-started,1.8)
   with self.assertRaises(ProcessLookupError):os.kill(int(pidfile.read_text()),0)
 def test_incomplete_checkpoints_fail_closed(self):
  with tempfile.TemporaryDirectory() as d:
   b=self.budget(pathlib.Path(d))
   with self.assertRaises(ValueError):b.finish(True)
 def test_real_crash_exit_is_not_retried_or_hidden(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);b=self.budget(root)
   with open(root/'log','wb') as log,self.assertRaises(subprocess.CalledProcessError) as caught:
    run([sys.executable,'-c','import os;os._exit(139)'],10,progress=b.tick,stdout=log,stderr=subprocess.STDOUT)
   b.finish(False)
   self.assertEqual(caught.exception.returncode,139)
   self.assertEqual(json.loads((root/'cjk-progress.json').read_text())['events'][-1]['event'],'command-failed')
 def test_guest_host_wiring_and_driver_unchanged(self):
  here=pathlib.Path(__file__).resolve().parents[1]
  guest=(here/'guest.py').read_text();host=(here/'host.py').read_text()
  self.assertIn('TOTAL_SECONDS,progress=cjk_budget.tick',guest);self.assertIn("'cjk_budget.py'",host)
  self.assertIn('def bounded_operation(function,seconds=1800)',host)
  self.assertNotIn('CjkBudget',(here/'native_deb.py').read_text())
if __name__=='__main__':unittest.main()

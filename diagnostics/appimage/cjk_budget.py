"""Bound AppImage CJK phases and record only fixed checkpoints/monotonic timings.

8734 reached checkpoint04 at ~345s of the old360s command limit; it had not
started the16-page overview or supplemental audit. The old6001 run reached
that checkpoint in ~165s after launch. Keep stage and whole-operation limits:
480s language roundtrip,180s overview,240s supplemental,900s absolute total.
This observes evidence progress, never treats screenshots as acceptance.
"""
import json,pathlib,time
TOTAL_SECONDS=900
PHASE_SECONDS={'language-roundtrip':480,'settings-overviews':180,'supplemental-audit':240}
OVERVIEWS=('general','appearance','chat','diffs','keybindings','voice','threads','browser','devices','source-control','worktrees','connections','maintenance','labs','about','archived')
ROUNDTRIP=('01-fonts-installed-english.png','02-chinese-selected.png','03-chinese-after-restart.png','04-chinese-thread-settings.png','05-english-thread-settings.png','06-chinese-thread-settings-restored.png')
CHECKPOINTS=ROUNDTRIP+tuple('settings-'+name+'-zh-CN.png' for name in OVERVIEWS)

class CjkBudget:
 def __init__(self,results,clock=time.monotonic,emit=print):
  self.root=pathlib.Path(results);self.clock=clock;self.emit=emit
  self.started=clock();self.phase_started=self.started;self.phase='language-roundtrip'
  self.seen=set();self.events=[];self.last_heartbeat=self.started;self.terminal=False
  self._record('start',self.started)
 def _record(self,event,now,checkpoint=None):
  row={'event':event,'phase':self.phase,'elapsedMs':round((now-self.started)*1000),'phaseElapsedMs':round((now-self.phase_started)*1000),'remainingMs':max(0,round((TOTAL_SECONDS-(now-self.started))*1000))}
  if checkpoint is not None:row['checkpoint']=checkpoint
  self.events.append(row)
  # Bound the report even if a timer/observer implementation accidentally spins.
  if len(self.events)>80:raise ValueError('CJK progress event budget exceeded')
  report={'schemaVersion':1,'scope':'bounded progress observation; not acceptance','totalBudgetSeconds':TOTAL_SECONDS,'phaseBudgetSeconds':PHASE_SECONDS,'events':self.events}
  self.root.mkdir(parents=True,exist_ok=True)
  (self.root/'cjk-progress.json').write_text(json.dumps(report,indent=2)+'\n')
  self.emit('T3_CJK_PROGRESS '+json.dumps(row,sort_keys=True),flush=True)
 def tick(self):
  now=self.clock()
  if now<self.started or now<self.phase_started:raise ValueError('Nonmonotonic CJK clock')
  # Check the old phase before observing completion: a late checkpoint cannot
  # reset an already expired phase deadline and turn it into success.
  if now-self.started>=TOTAL_SECONDS or now-self.phase_started>=PHASE_SECONDS[self.phase]:
   self._record('deadline-exceeded',now)
   raise TimeoutError('CJK phase deadline exceeded: '+self.phase)
  for name in CHECKPOINTS:
   file=self.root/'cjk'/name
   if name not in self.seen and file.is_file() and not file.is_symlink():
    self.seen.add(name);self._record('checkpoint',now,name)
  next_phase=self.phase
  if self.phase=='language-roundtrip' and all(n in self.seen for n in ROUNDTRIP):next_phase='settings-overviews'
  if self.phase=='settings-overviews' and all('settings-'+n+'-zh-CN.png' in self.seen for n in OVERVIEWS):next_phase='supplemental-audit'
  if next_phase!=self.phase:
   self.phase=next_phase;self.phase_started=now;self._record('phase-start',now)
  if now-self.last_heartbeat>=30:
   self.last_heartbeat=now;self._record('heartbeat',now)
 def finish(self,success):
  if self.terminal:return
  self.terminal=True
  if success and (self.phase!='supplemental-audit' or not all(n in self.seen for n in CHECKPOINTS)):
   self._record('incomplete-checkpoints',self.clock())
   raise ValueError('CJK command ended before all baseline checkpoints')
  self._record('command-complete' if success else 'command-failed',self.clock())

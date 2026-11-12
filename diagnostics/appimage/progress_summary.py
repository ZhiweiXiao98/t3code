"""Export only fixed checkpoint labels and bounded numeric timing/counts."""
import json,pathlib
from cjk_budget import CHECKPOINTS,PHASE_SECONDS
EXTRA=('providers','projects','scheduled-tasks','snap-shot')
SCROLL=('threads','source-control','worktrees','keybindings','voice','maintenance','appearance')
CJK_NAMES=set(CHECKPOINTS)|{f'supplemental-{n}-overview.png' for n in EXTRA}|{f'supplemental-{n}-scroll-{i}.png' for n in SCROLL for i in range(32)}|{'supplemental-general-thread-notifications-options.png','supplemental-browser-browser-link-target-options.png'}
CLEAN_NAMES={'clean-first-render.png','clean-first-start.png'}
def summarize(root):
 root=pathlib.Path(root);files=[p for p in (root/'cjk').iterdir() if p.name in CJK_NAMES and p.is_file() and not p.is_symlink()]
 clean=[p for p in (root/'clean').iterdir() if p.name in CLEAN_NAMES and p.is_file() and not p.is_symlink()]
 report=json.loads((root/'cjk-progress.json').read_text());last=report['events'][-1]
 return {'cjkScreens':len(files),'cleanScreens':len(clean),'lastScreenshot':max(files,key=lambda p:p.stat().st_mtime_ns).name if files else None,'lastPhase':last['phase'],'elapsedMs':last['elapsedMs'],'phaseElapsedMs':last['phaseElapsedMs'],'deadlineExceeded':any(e['event']=='deadline-exceeded' for e in report['events'])}
def validate(p):
 if not isinstance(p,dict) or set(p)!={'cjkScreens','cleanScreens','lastScreenshot','lastPhase','elapsedMs','phaseElapsedMs','deadlineExceeded'}:raise ValueError('Progress schema')
 for k,bound in [('cjkScreens',len(CJK_NAMES)),('cleanScreens',2),('elapsedMs',1800000),('phaseElapsedMs',1800000)]:
  if type(p[k]) is not int or not 0<=p[k]<=bound:raise ValueError('Progress number')
 if p['lastScreenshot'] is not None and p['lastScreenshot'] not in CJK_NAMES:raise ValueError('Progress label')
 if p['lastPhase'] not in PHASE_SECONDS or type(p['deadlineExceeded']) is not bool:raise ValueError('Progress phase')
 return p

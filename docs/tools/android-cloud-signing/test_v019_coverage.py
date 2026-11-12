"""The new bash regression is mandatory on Linux, with only its exact Windows skip."""
import copy,json,unittest
from pathlib import Path
from validate_coverage_manifest import validate_manifest
class V019CoverageTests(unittest.TestCase):
 def fixture(self):
  root=Path(__file__).parent;m=json.loads((root/'synthetic-coverage-NOT-EVIDENCE.json').read_text());p=json.loads((root/'supplemental-pin.json').read_text());p['source'].update(m['source']);p['workflow']=m['workflow'];return m,p
 def test_current_five_lanes(self):
  m,p=self.fixture();validate_manifest(m,p)
 def test_bash_skip_and_prerequisites_are_not_optional(self):
  for lane in ['linux-nushell','windows-shared']:
   m,p=self.fixture();found=next(x for x in m['lanes'] if x['lane']==lane);found['runtime']['has_posix_bash']=not found['runtime']['has_posix_bash']
   with self.assertRaises(ValueError):validate_manifest(m,p)
  for lane in ['linux-nushell','windows-shared']:
   m,p=self.fixture();found=next(x for x in m['lanes'] if x['lane']==lane);file=next(x for x in found['files'] if x['path']=='packages/shared/src/shell.test.ts');a=next(x for x in file['assertions'] if x['title']=='ignores probe markers a bash DEBUG trap echoes into the terminal title');a['status']='skipped' if lane=='linux-nushell' else 'passed';a['skip_reason']=None
   with self.assertRaises(ValueError):validate_manifest(m,p)
 def test_actual_browser_revision_required(self):
  m,p=self.fixture();next(x for x in m['lanes'] if x['lane']=='linux-node26')['runtime']['browser']['revision']='1223'
  with self.assertRaises(ValueError):validate_manifest(m,p)

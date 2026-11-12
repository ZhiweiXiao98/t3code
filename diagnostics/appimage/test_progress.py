import unittest,tempfile,pathlib,json
from progress_summary import summarize,validate
from validate_export import check
from test_privacy_transport import CELL,TRUST,CANARY
class Progress(unittest.TestCase):
 def test_private_names_not_exported(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'cjk').mkdir();(p/'clean').mkdir();(p/'cjk'/CANARY).touch();(p/'cjk/supplemental-scheduled-tasks-overview.png').touch()
   (p/'cjk-progress.json').write_text(json.dumps({'events':[{'event':'command-failed','phase':'supplemental-audit','elapsedMs':483764,'phaseElapsedMs':29200}]}))
   s=validate(summarize(p));self.assertEqual(s['cjkScreens'],1);self.assertNotIn(CANARY,json.dumps(s))
   s['lastScreenshot']=CANARY
   with self.assertRaises(ValueError):validate(s)
 def test_schema_rejects_arbitrary_data(self):
  good={'cjkScreens':25,'cleanScreens':2,'lastScreenshot':'supplemental-scheduled-tasks-overview.png','lastPhase':'supplemental-audit','elapsedMs':483764,'phaseElapsedMs':29200,'deadlineExceeded':False}
  self.assertEqual(validate(good),good)
  for k,v in [('elapsedMs',-1),('cleanScreens',3),('cjkScreens',999),('lastPhase',CANARY),('deadlineExceeded',1),('extra',CANARY)]:
   with self.subTest(k=k),self.assertRaises(ValueError):validate({**good,k:v})
if __name__=='__main__':unittest.main()

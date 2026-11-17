import unittest,copy,json
from pathlib import Path
import gate_receipts as G
class PartialReleaseTests(unittest.TestCase):
 def test_exact26_and_no_historical_green(self):
  p=json.loads(Path(__file__).with_name('receipt-collection-plan.json').read_text());r={'source':G.SOURCE,'tree':G.TREE,'logical_gates':p['logical_gates'],'runs':[x['expected'] for x in p['runs']],'jobs':[{'id':x['id'],'api':x['api_snapshot']} for x in p['jobs']]}
  self.assertEqual(len(G.verify_plan(p,r)),26)
  for mode in ['missing','duplicate','additional','failure','oldsource','attempt','historicalgreen']:
   q=copy.deepcopy(r)
   if mode=='missing':q['jobs'].pop()
   elif mode=='duplicate':q['jobs'].append(q['jobs'][0])
   elif mode=='additional':j=copy.deepcopy(q['jobs'][0]);j['id']=1;q['jobs'].append(j)
   elif mode=='historicalgreen':q['runs'][0]['conclusion']='success'
   elif mode=='oldsource':q['jobs'][0]['api']['head_sha']='0'*40
   elif mode=='attempt':q['jobs'][0]['api']['run_attempt']+=1
   else:q['jobs'][0]['api']['conclusion']='failure'
   with self.subTest(mode=mode),self.assertRaises(ValueError):G.verify_plan(p,q)

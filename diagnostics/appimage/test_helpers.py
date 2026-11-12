import unittest,json,pathlib,hashlib,copy,os
from patch_playwright import transform,EXPECTED
from sanitize_stack import sanitize
HERE=pathlib.Path(__file__).parent
BUNDLE=pathlib.Path(os.environ.get('TEST_PLAYWRIGHT_BUNDLE','/workspace/shared/t3-v018-integration/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/lib/coreBundle.js'))
class Helpers(unittest.TestCase):
 def test_patched_early_order(self):
  out=transform(BUNDLE.read_bytes(),(HERE/'early-hook.cjs').read_text()).decode()
  start=out.index('const diagnostic = await nodeConnection.rootSession.send')
  resume=out.index('await nodeConnection.rootSession.send("Debugger.resume")',start)
  chrome=out.index('const chromeMatch = await',start)
  self.assertLess(start,resume);self.assertLess(resume,chrome)
  self.assertIn('let electronArguments = ["--inspect-brk=0"',out)
  self.assertIn('refusing resume',out[start:resume])
 def test_modified_bundle_rejected(self):
  with self.assertRaises(ValueError):transform(BUNDLE.read_bytes()+b' ', 'unused')
 def fixture(self):
  return {'crash_info':{'type':'SIGSEGV / SEGV_MAPERR','address':'private'},'crashing_thread':{'frames':[{'module':'t3code','module_offset':'0xabc','function':'v8::Collect()','registers':{'x':'secret'},'file':'/home/private'}]},'modules':[{'filename':'t3code','debug_id':'AABB11223344','base_addr':'secret'}],'environment':'secret'}
 def test_only_allowlist(self):
  out=sanitize(self.fixture(),{'AABB11223344':'electron'});text=json.dumps(out)
  for private in ['secret','private','registers','base_addr','environment']:self.assertNotIn(private,text)
  self.assertNotIn('function',out['frames'][0]);self.assertEqual(out['frames'][0]['module'],'electron')
 def test_paths_not_exported(self):
  f=self.fixture();f['crashing_thread']['frames'][0]['function']='https://private/token'
  self.assertNotIn('function',sanitize(f,{'AABB11223344':'electron'})['frames'][0])
  f['modules'][0]['filename']='/home/private/t3code'
  self.assertEqual(sanitize(f,{'AABB11223344':'electron'})['frames'],[{'unresolved':True}])
 def test_frame_bound(self):
  f=self.fixture();f['crashing_thread']['frames']*=100
  self.assertEqual(len(sanitize(f,{'AABB11223344':'electron'})['frames']),32)
 def test_invalid_schema(self):
  for v in [{},[],{'crash_info':{'type':'private'}}]:
   with self.assertRaises((ValueError,KeyError)):sanitize(v,{'AABB11223344':'electron'})
if __name__=='__main__':unittest.main()

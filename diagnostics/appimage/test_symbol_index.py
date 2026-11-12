import unittest,pathlib,tempfile,hashlib,json,os,unittest.mock as mock
import symbol_index as si
from public_fixture import transform,OFFICIAL_ID,WRONG_ID
from benchmark_export import check
CANARY='PRIVATE_CANARY'
class Index(unittest.TestCase):
 def fixture(self,path):path.write_text(si.HEADER+'\nPUBLIC 1000 0 fixture\n');return path
 def build(self,source,root):
  with mock.patch.object(si,'SHA256',hashlib.sha256(source.read_bytes()).hexdigest()),mock.patch.object(si,'BYTES',source.stat().st_size):return si.build_index(source,root)
 def test_aliases_exact_same_inode_and_bytes(self):
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);source=self.fixture(p/'source.sym');root=self.build(source,p/'index');a=root/'electron'/si.ID/'electron.sym';b=root/'t3code'/si.ID/'t3code.sym';self.assertEqual(a.read_bytes(),source.read_bytes());self.assertEqual(a.stat().st_ino,b.stat().st_ino);self.assertEqual({str(x.relative_to(root)) for x in root.rglob('*.sym')},{f'electron/{si.ID}/electron.sym',f't3code/{si.ID}/t3code.sym'})
 def test_modified_header_hash_symlink_or_existing_root_rejected(self):
  with tempfile.TemporaryDirectory() as t:
   p=pathlib.Path(t);source=self.fixture(p/'source.sym');(p/'link.sym').symlink_to(source)
   with self.assertRaises(ValueError):self.build(p/'link.sym',p/'i')
   (p/'existing').mkdir()
   with self.assertRaises(ValueError):self.build(source,p/'existing')
   source.write_text(si.HEADER.replace(si.ID,'A'*33)+'\n')
   with self.assertRaises(ValueError):self.build(source,p/'j')
   source=self.fixture(source)
   with mock.patch.object(si,'BYTES',source.stat().st_size),self.assertRaises(ValueError):si.build_index(source,p/'k')
 def test_private_values_cannot_enter_export(self):
  r={'schemaVersion':1,'diagnosticOnly':True,'mode':'public-indexed-symbol-benchmark-v1','symbolId':si.ID,'symbolSha256':si.SHA256,'phase':'complete','cases':[{'label':'indexed-matching','budgetSeconds':600,'elapsedMs':1234,'exitCode':0,'loadedSymbols':True,'cumulativeChildMaxRssKiB':12345}]};check(r)
  for key,value in [('phase',CANARY),('failureCode',CANARY),('private',CANARY)]:
   with self.assertRaises(ValueError):check({**r,key:value})
  r['cases'][0]['label']=CANARY
  with self.assertRaises(ValueError):check(r)
 def test_no_application_in_benchmark(self):
  h=pathlib.Path(__file__).parent
  for file in ['benchmark_host.py','benchmark_guest.py']:
   code=(h/file).read_text()
   for banned in ['app.AppImage','diagnostic-driver.mjs','clean-driver.mjs','--no-sandbox']:self.assertNotIn(banned,code)
  code=(h/'benchmark_guest.py').read_text();self.assertIn("mods[0].get('corrupt_symbols') is False",code)
 def test_unknown_alias_guard_on_real_public_fixture(self):
  raw=pathlib.Path(os.environ['PUBLIC_FIXTURE']).read_bytes()
  with self.assertRaisesRegex(ValueError,'^Only fixed aliases permitted$'):transform(raw,CANARY)
 def test_unknown_alias_and_unpinned_fixture_rejected(self):
  with self.assertRaises(ValueError):transform(b'untrusted',CANARY)
if __name__=='__main__':unittest.main()

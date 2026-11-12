import unittest,tempfile,pathlib,json,copy
from sanitize_stack import sanitize
from validate_export import check
from transport import archive
from decode_diagnostic import decode
CANARY='SYNTHETIC_PASSWORD_TOKEN_CANARY'
CELL={'source':{'sha':'a'*40,'tree':'b'*40},'appimage':{'sha256':'c'*64}}
TRUST={'AABB11223344':'electron'}
class Privacy(unittest.TestCase):
 def record(self):
  raw={'crash_info':{'type':'SIGSEGV','assertion':CANARY},'crashing_thread':{'frames':[{'module':CANARY,'module_offset':'0xabc','function':CANARY,'registers':{'r':CANARY}}]},'modules':[{'filename':CANARY,'debug_id':'AABB11223344'}],'environment':CANARY}
  return {'schemaVersion':1,'diagnosticOnly':True,'outcome':'crash-captured','phase':'complete','stacks':[sanitize(raw,TRUST)],'source':CELL['source'],'appimageSha256':CELL['appimage']['sha256']}
 def test_canary_does_not_survive_serial(self):
  record=check(self.record(),CELL,TRUST)
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);root=p/'export';root.mkdir()
   (root/'diagnostic.json').write_text(json.dumps(record));(root/'manifest.json').write_text('{}')
   (p/'serial').write_bytes(archive(root));decode(p/'serial',p/'decoded')
   self.assertNotIn(CANARY,(p/'decoded/diagnostic.json').read_text())
   self.assertEqual(record['stacks'][0]['frames'][0]['module'],'electron')
 def test_every_string_field_rejects_canary(self):
  for key in ['outcome','phase','appimageSha256','packageListSha256']:
   record=self.record();record[key]=CANARY
   with self.subTest(key=key),self.assertRaises((ValueError,TypeError)):check(record,CELL,TRUST)
  for key in ['module','debugId','moduleOffset','function']:
   record=self.record();record['stacks'][0]['frames'][0][key]=CANARY
   with self.subTest(key=key),self.assertRaises((ValueError,TypeError)):check(record,CELL,TRUST)
 def test_unknown_top_level_rejected(self):
  r=self.record();r['private']=CANARY
  with self.assertRaises(ValueError):check(r,CELL,TRUST)
 def test_untrusted_debug_id_never_exported(self):
  raw={'crash_info':{'type':'SIGSEGV'},'crashing_thread':{'frames':[{'module':CANARY,'module_offset':'0xabc'}]},'modules':[{'filename':CANARY,'debug_id':'DEADBEEF1234'}]}
  self.assertEqual(sanitize(raw,TRUST)['frames'],[{'unresolved':True}])
if __name__=='__main__':unittest.main()

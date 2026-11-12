import unittest,tempfile,pathlib,json,hashlib,sys
from transport import archive
from prepare_driver import transform
HERE=pathlib.Path(__file__).parent
sys.path.insert(0,str(HERE/'vendor'))
from decode_diagnostic import decode
class Operation(unittest.TestCase):
 def test_full_driver_byte_identity(self):
  raw=(HERE/'control-driver.mjs').read_bytes();out=transform(raw)
  self.assertEqual(out,raw);self.assertEqual(out,(HERE/'diagnostic-driver.mjs').read_bytes())
  self.assertIn(b'report.settings_audit = await',out)
  self.assertIn(b'report.supplemental_settings_audit = await',out)
  op=json.loads((HERE/'operation.json').read_text())
  self.assertEqual(hashlib.sha256(raw).hexdigest(),op['sequence']['cjkDriverSha256'])
  self.assertEqual(hashlib.sha256((HERE/'clean-driver.mjs').read_bytes()).hexdigest(),op['sequence']['cleanDriverSha256'])
 def test_same_immutable_artifact_control(self):
  op=json.loads((HERE/'operation.json').read_text());a,b=op['cells']
  self.assertTrue(a['enableLocalCrashCapture']);self.assertFalse(b['enableLocalCrashCapture'])
  for key in ['source','producer','installer','proof','appimage','accelerator','guestImageSha512']:
   self.assertEqual(a[key],b[key])
  guest=(HERE/'diagnostic_guest.py').read_text()
  self.assertIn("if cell['enableLocalCrashCapture']:",guest)
  self.assertIn('TOTAL_SECONDS,progress=budget.tick',guest)
  self.assertIn('budget.tick();complete=True',guest)
 def test_transport_roundtrip(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);out=root/'out';out.mkdir()
   for name in ['diagnostic.json','manifest.json']:(out/name).write_text('{"diagnosticOnly":true}')
   frame=archive(out);(root/'serial').write_bytes(frame);decode(root/'serial',root/'decoded')
   self.assertEqual({p.name for p in (root/'decoded').iterdir()},{'diagnostic.json','manifest.json'})
 def test_raw_dump_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d)
   for name in ['diagnostic.json','manifest.json']:(root/name).write_text('{}')
   (root/'crash.dmp').write_bytes(b'private')
   with self.assertRaises(ValueError):archive(root)
 def test_symlink_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/'manifest.json').write_text('{}');(root/'diagnostic.json').symlink_to(root/'manifest.json')
   with self.assertRaises(ValueError):archive(root)
 def test_no_network_symbolizer(self):
  guest=(HERE/'diagnostic_guest.py').read_text()
  self.assertNotIn('--symbols-url',guest)
  self.assertIn("symbol_ids",guest)
 def test_host_is_diagnostic_only(self):
  host=(HERE/'diagnostic_host.py').read_text()
  self.assertNotIn('validate_snapshot(',host);self.assertNotIn('emit_provenance(',host)
  self.assertIn("'-m','4096','-smp','2'",host)
if __name__=='__main__':unittest.main()

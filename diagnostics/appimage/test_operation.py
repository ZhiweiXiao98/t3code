import unittest,tempfile,pathlib,json,hashlib,sys
from transport import archive
from prepare_driver import transform
HERE=pathlib.Path(__file__).parent
sys.path.insert(0,str(HERE/'vendor'))
from decode_diagnostic import decode
class Operation(unittest.TestCase):
 def test_short_driver(self):
  raw=(HERE/'control-driver.mjs').read_bytes();out=transform(raw).decode()
  self.assertIn('06-chinese-thread-settings-restored.png',out)
  self.assertNotIn('report.settings_audit = await',out)
  self.assertNotIn('same-full-run-debian13-v1',out)
  self.assertNotIn('report.passed = true',out)
  self.assertIn('diagnosticSequenceComplete = true',out)
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

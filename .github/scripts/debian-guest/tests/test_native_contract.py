import unittest,tempfile,pathlib,json,copy,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import test_runtime
import common
class Native(unittest.TestCase):
 def fixture(self,root):
  m,v=test_runtime.Results().fixture(root)
  old='/var/tmp/t3-validation/work/app.AppImage';exe='/opt/T3 Code/t3code'
  m.update(kind='deb',mode='same-full-run-native-deb-v1',installerSha256='e'*64,executableSha256='f'*64,installedExecutable=exe)
  v=json.loads(json.dumps(v).replace(old,exe))
  c=v['cjk/linux-chinese-ui.json'];c.update(kind='deb',evidence_type=m['mode'],executable={'path':exe,'sha256':'f'*64});c['asset']['sha256']='e'*64;c['environment'].update(distro={'ID':'ubuntu','VERSION_ID':'24.04'},uid=1001)
  v['status.json']['execution'].update(id='ubuntu',versionId='24.04',uid=1001,glibc='glibc 2.39',executableSha256='f'*64)
  v['cjk/font-evidence.json']['distro']='ID=ubuntu\nVERSION_ID=\"24.04\"\n';v['cjk/linux-chinese-ui.json']['font_environment']=v['cjk/font-evidence.json']
  (root/'fuse.json').unlink();v.pop('fuse.json')
  for name,value in v.items():(root/name).write_text(json.dumps(value))
  return m,v
 def test_native_distinct_installer_executable(self):
  with tempfile.TemporaryDirectory() as d:
   m,v=self.fixture(pathlib.Path(d));common.validate_results(d,m)
 def test_runtime_kind_os_uid_hash_mismatch(self):
  for key,value in [('kind','appimage'),('evidence_type','same-full-run-debian13-v1'),('environment',{'distro':{'ID':'debian','VERSION_ID':'13'},'uid':1001,'kernel':'x'}),('executable',{'path':'/opt/T3 Code/t3code','sha256':'e'*64})]:
   with self.subTest(key=key),tempfile.TemporaryDirectory() as d:
    root=pathlib.Path(d);m,v=self.fixture(root);v['cjk/linux-chinese-ui.json'][key]=value;(root/'cjk/linux-chinese-ui.json').write_text(json.dumps(v['cjk/linux-chinese-ui.json']))
    with self.assertRaises(ValueError):common.validate_results(root,m)
 def test_missing_guest_fuse_not_accepted(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);m,_=test_runtime.Results().fixture(root);(root/'fuse.json').unlink()
   with self.assertRaises(FileNotFoundError):common.validate_results(root,m)
if __name__=='__main__':unittest.main(verbosity=2)

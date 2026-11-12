"""Actual pinned stackwalker regression; uses ONLY public upstream fixture data."""
import argparse,hashlib,json,pathlib,subprocess,tempfile,urllib.request
URL='https://raw.githubusercontent.com/rust-minidump/rust-minidump/4adf5555b2ab844f23c52982fc202357ff882695/testdata/test.dmp'
SHA='24b0ea7794b2d2523c46c9aea72c03ccbb0ab88ad76d8258d3752c7b71d233ff'
ID='5A9832E5287241C1838ED98914E9B7FF1'
def verify(binary,fixture):
 data=pathlib.Path(fixture).read_bytes()
 assert len(data)==11317 and hashlib.sha256(data).hexdigest()==SHA
 with tempfile.TemporaryDirectory() as tmp:
  root=pathlib.Path(tmp);sym=root/'breakpad_symbols/test_app.pdb'/ID/'test_app.sym';sym.parent.mkdir(parents=True)
  sym.write_text(f'MODULE windows x86 {ID} test_app.pdb\nFUNC 1000 20000 0 synthetic_public_fixture\n')
  bad=root/'wrong-id.sym';bad.write_text(sym.read_text().replace(ID,'A'*33))
  observations={}
  for label,path,expected in [('nested-root',root,False),('direct-file',sym,True),('wrong-id',bad,False)]:
   out=root/(label+'.json')
   subprocess.run([str(binary),'--json','--no-interactive','--output-file',str(out),str(fixture),str(path)],check=True,timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   report=json.loads(out.read_text());mods=[m for m in report['modules'] if m['filename']=='test_app.exe']
   assert len(mods)==1 and mods[0]['debug_id'].replace('-','').upper()==ID
   actual=mods[0]['loaded_symbols'];assert actual is expected,(label,actual)
   observations[label]=actual
  print(json.dumps({'scope':'public fixture only, not actual application crash','observations':observations},sort_keys=True))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--binary',required=True);p.add_argument('--fixture',required=True);a=p.parse_args();verify(pathlib.Path(a.binary).resolve(),pathlib.Path(a.fixture).resolve())

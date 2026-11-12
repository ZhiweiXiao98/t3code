"""Real pinned supplier, tiny synthetic symbols plus public upstream dump only."""
import argparse,pathlib,tempfile,hashlib,json,subprocess
import symbol_index
from public_fixture import transform,OFFICIAL_ID,WRONG_ID

def verify(binary,fixture):
 original=pathlib.Path(fixture).read_bytes()
 # Check the alias guard using the real SHA-verified public fixture, rather
 # than accidentally testing the earlier invalid-fixture branch.
 try:transform(original,'unapproved-alias')
 except ValueError as error:assert str(error)=='Only fixed aliases permitted'
 else:raise AssertionError('Unknown alias accepted')
 with tempfile.TemporaryDirectory() as tmp:
  root=pathlib.Path(tmp);source=root/'public-fixture.sym'
  source.write_text(symbol_index.HEADER+'\nFUNC 1000 20000 0 synthetic_public_fixture\n')
  symbol_index.SHA256=hashlib.sha256(source.read_bytes()).hexdigest();symbol_index.BYTES=source.stat().st_size
  indexed=symbol_index.build_index(source,root/'index');results={}
  for alias,wrong in [('electron',False),('t3code',False),('t3code',True)]:
   label=alias+('-wrong-id' if wrong else '-matched');dump=root/(label+'.dmp');dump.write_bytes(transform(original,alias,wrong));out=root/(label+'.json')
   subprocess.run([str(binary),'--json','--no-interactive','--output-file',str(out),str(dump),str(indexed)],check=True,timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   parsed=json.loads(out.read_text());mods=[m for m in parsed['modules'] if m['filename']=='test_app.exe'];assert len(mods)==1
   assert mods[0]['debug_id'].replace('-','').upper()==(WRONG_ID if wrong else OFFICIAL_ID)
   assert mods[0]['loaded_symbols'] is (not wrong),(label,mods[0]['loaded_symbols']);assert mods[0].get('corrupt_symbols') is False;results[label]=mods[0]['loaded_symbols']
  print(json.dumps({'scope':'public fixture only; fixed indexed aliases and strict requested debug ID','results':results},sort_keys=True))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--binary',required=True);p.add_argument('--fixture',required=True);a=p.parse_args();verify(pathlib.Path(a.binary).resolve(),pathlib.Path(a.fixture).resolve())

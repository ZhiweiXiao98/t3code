"""Immutable saved actual proof as test input; mutated variants are NOT evidence."""
import json,io,zipfile,hashlib,copy
from pathlib import Path
P=Path(__file__).parent
PIN=json.loads((P/'ui-partition-pins.PROPOSED.json').read_text())
RAW=(P/'test-fixtures/ui-four-partitions.zip').read_bytes()
def members():
 with zipfile.ZipFile(io.BytesIO(RAW)) as z:return {n:z.read(n) for n in z.namelist()}
def repack(m):
 m=copy.deepcopy(m)
 # Rehash inner receipt transport too; deliberately preserve claimed semantic results.
 pm=json.loads(m['unit-partitions.json'])
 for r in pm['receipts']:
  prefix=f"partition-{r['index']+1}-"
  for a in r['artifacts']:
   if prefix+a['name'] in m:
    b=m[prefix+a['name']];a['sha256']=hashlib.sha256(b).hexdigest();a['bytes']=len(b)
 m['unit-partitions.json']=json.dumps(pm).encode()
 manifest=json.loads(m['artifact-manifest.json']);manifest['files']=[{'file':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in m.items() if n!='artifact-manifest.json'];m['artifact-manifest.json']=json.dumps(manifest).encode()
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  for n,b in m.items():z.writestr(n,b)
 p=copy.deepcopy(PIN);raw=out.getvalue();p['artifact'].update(size=len(raw),sha256=hashlib.sha256(raw).hexdigest());p['members']={n:hashlib.sha256(b).hexdigest() for n,b in m.items()};return raw,p
def mutate(name,key,value):
 m=members();d=json.loads(m[name]);d[key]=value;m[name]=json.dumps(d).encode();return repack(m)
def extension_fixture():
 all=members();m={n:b for n,b in all.items() if n.startswith('toast-')}
 for n,b in all.items():
  if n.startswith('partition-1-'):m[n[len('partition-1-'):]]=b
 return m,copy.deepcopy(PIN)

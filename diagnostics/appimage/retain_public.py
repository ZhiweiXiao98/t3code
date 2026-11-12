"""Retain only the verified two-file public result and remove this generated VM."""
import json,pathlib,shutil,sys,hashlib
work=pathlib.Path(sys.argv[1]).resolve();dest=pathlib.Path(sys.argv[2]);root=work/'public'
if work.name not in ('diagnostic-candidate','diagnostic-control') or work.is_symlink() or dest.exists():raise ValueError('Unexpected generated workspace')
if {p.name for p in root.iterdir()}!={'diagnostic.json','manifest.json'}:raise ValueError('Unexpected public files')
for p in root.iterdir():
 if p.is_symlink() or not p.is_file() or p.stat().st_size>65536:raise ValueError('Unsafe public file')
m=json.loads((root/'manifest.json').read_text());b=(root/'diagnostic.json').read_bytes()
if m['files']!=[{'name':'diagnostic.json','bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}]:raise ValueError('Hash mismatch')
shutil.copytree(root,dest)
shutil.rmtree(work)

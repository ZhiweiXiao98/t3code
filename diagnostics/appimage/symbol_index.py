"""Fixed, header/hash-bound official symbol aliases. Never trust dump path strings."""
import hashlib,pathlib,os,shutil
ID='97859DFC1AC4DEDCB85DB23812CCCFC80'
MODULE='electron'
HEADER=f'MODULE Linux x86_64 {ID} electron'
SHA256='0c0aca42b3512554cadc555e99eb2d29b4bc34a450237df77c4389423c783d48'
BYTES=811367421
ALIASES=('electron','t3code')
def validate_header(source,expected_id=ID,expected_header=HEADER):
 p=pathlib.Path(source)
 if p.is_symlink() or not p.is_file():raise ValueError('Unsafe official symbols')
 with p.open('rb') as f:header=f.readline(1024).decode().strip()
 if header!=expected_header or header.split()[3]!=expected_id:raise ValueError('Wrong official symbol identity')
 return p

def build_index(source,destination):
 p=validate_header(source);root=pathlib.Path(destination)
 if root.exists():raise ValueError('Symbol index must be fresh')
 if p.stat().st_size!=BYTES:raise ValueError('Wrong official symbol size')
 h=hashlib.sha256()
 with p.open('rb') as f:
  while data:=f.read(1024*1024):h.update(data)
 if h.hexdigest()!=SHA256:raise ValueError('Wrong official symbol hash')
 canonical=root/MODULE/ID/(MODULE+'.sym');canonical.parent.mkdir(parents=True)
 shutil.copyfile(p,canonical)
 with canonical.open('rb') as f:
  h=hashlib.sha256()
  while data:=f.read(1024*1024):h.update(data)
 if h.hexdigest()!=SHA256:raise ValueError('Copied symbol hash mismatch')
 canonical.chmod(0o444)
 for alias in ALIASES:
  target=root/alias/ID/(alias+'.sym')
  if target==canonical:continue
  target.parent.mkdir(parents=True);os.link(canonical,target)
  if target.stat().st_ino!=canonical.stat().st_ino:raise ValueError('Alias not exact inode')
 return root

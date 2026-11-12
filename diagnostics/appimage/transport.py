"""Strict two-file allowlist transport, with no fallback raw exception serialization."""
import base64,hashlib,io,json,pathlib,tarfile,time
NAMES={'diagnostic.json','manifest.json'}
def archive(root):
 root=pathlib.Path(root)
 if {p.name for p in root.iterdir()}!=NAMES:raise ValueError('Unexpected export entry')
 buf=io.BytesIO()
 with tarfile.open(fileobj=buf,mode='w:gz') as out:
  for name in sorted(NAMES):
   p=root/name
   if p.is_symlink() or not p.is_file() or p.stat().st_size>65536:raise ValueError('Invalid export')
   data=p.read_bytes();json.loads(data)
   info=tarfile.TarInfo(name);info.size=len(data);out.addfile(info,io.BytesIO(data))
 packed=buf.getvalue()
 if len(packed)>131072:raise ValueError('Export size')
 return f'\nT3_RESULT_BEGIN {len(packed)} {hashlib.sha256(packed).hexdigest()}\n'.encode()+base64.encodebytes(packed)+b'\nT3_RESULT_END\n'
def emit(root):
 data=archive(root);view=memoryview(data);offset=0;deadline=time.monotonic()+120
 with open('/dev/virtio-ports/org.t3.result','wb',buffering=0) as out:
  while offset<len(view):
   if time.monotonic()>deadline:raise TimeoutError('Transport timeout')
   n=out.write(view[offset:offset+32768])
   if not isinstance(n,int) or n<=0:raise OSError('Transport incomplete')
   offset+=n

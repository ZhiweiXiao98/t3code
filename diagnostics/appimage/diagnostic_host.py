"""One reviewed diagnostic cell using existing artifacts. Never build/publish an app."""
import argparse,hashlib,json,os,pathlib,shutil,signal,stat,subprocess,sys,tarfile,time,zipfile
HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'vendor'))
from common import require,sha,run,IMAGE_SHA
from host import fetch_image,await_frame,seed_config
from decode_diagnostic import decode

class OperationCancelled(BaseException):
 pass

def install_cancellation_handlers():
 def cancel(signum,frame):
  # Further cancellation must not interrupt reaping our exact owned child.
  signal.signal(signal.SIGTERM,signal.SIG_IGN)
  signal.signal(signal.SIGINT,signal.SIG_IGN)
  raise OperationCancelled()
 signal.signal(signal.SIGTERM,cancel)
 signal.signal(signal.SIGINT,cancel)

def stop_owned_process(process):
 if process is None or process.poll() is not None:return
 try:os.killpg(process.pid,signal.SIGTERM)
 except ProcessLookupError:pass
 try:process.wait(timeout=3)
 except subprocess.TimeoutExpired:
  try:os.killpg(process.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  process.wait(timeout=2)

def installer(archive,proof,payload,cell):
 require(sha(archive)==cell['installer']['digest'].split(':')[1],'Installer ZIP hash')
 require(pathlib.Path(archive).stat().st_size==cell['installer']['size_in_bytes'],'Installer ZIP size')
 require(sha(proof)==cell['proof']['digest'].split(':')[1],'Proof ZIP hash')
 require(pathlib.Path(proof).stat().st_size==cell['proof']['size_in_bytes'],'Proof ZIP size')
 with zipfile.ZipFile(proof) as z:
  require(len(z.namelist())==len(set(z.namelist())),'Duplicate proof')
  require(all(i.file_size<=1024**2 and not i.is_dir() for i in z.infolist()),'Proof budget')
  require(z.read('source-sha.txt').decode().strip()==cell['source']['sha'],'Proof source')
  require(z.read('source-tree.txt').decode().strip()==cell['source']['tree'],'Proof tree')
  checks=z.read('installers.sha256').decode().splitlines()
  require(any(line.split()[0]==cell['appimage']['sha256'] and line.split()[-1].endswith('.AppImage') for line in checks),'Proof asset')
 with zipfile.ZipFile(archive) as z:
  candidates=[i for i in z.infolist() if i.filename.endswith('.AppImage') and not i.is_dir()]
  require(len(candidates)==1,'Unique AppImage required');i=candidates[0]
  require(i.file_size==cell['appimage']['size'] and stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG),'Asset member mismatch')
  with z.open(i) as src,open(payload/'app.AppImage','wb') as dst:shutil.copyfileobj(src,dst,1024**2)
 require(sha(payload/'app.AppImage')==cell['appimage']['sha256'],'Asset bytes')

def main(a):
 require(a.execute_reviewed_operation,'Explicit reviewed operation flag required')
 install_cancellation_handlers()
 require(os.geteuid()!=0 and os.environ.get('GITHUB_ACTIONS')=='true','Nonroot free Actions only')
 operation=json.loads((HERE/'operation.json').read_text());cell=next(c for c in operation['cells'] if c['label']==a.cell)
 work=pathlib.Path(a.work).resolve();require(not work.exists() and not any(c in str(work) for c in ',\n\r'),'Fresh safe work path');work.mkdir()
 require(shutil.disk_usage(work).free>=12*1024**3,'Need 12GiB free space')
 for helper in operation['helpers']:require(sha(HERE/helper['name'])==helper['sha256'],'Helper changed')
 payload=work/'payload';payload.mkdir();installer(a.installer_zip,a.proof_zip,payload,cell)
 require(sha(a.playwright_tar)==cell['playwrightTarSha256'],'Playwright archive');shutil.copyfile(a.playwright_tar,payload/'playwright.tgz')
 require(sha(a.stackwalker)==a.stackwalker_sha256,'Reviewed compiled stackwalker hash')
 shutil.copyfile(a.stackwalker,payload/'minidump-stackwalk');(payload/'minidump-stackwalk').chmod(0o755)
 require(sha(a.symbols_zip)==operation['toolchain']['symbolsSha256'],'Official symbol ZIP mismatch')
 symbols=payload/'symbols';symbols.mkdir()
 with zipfile.ZipFile(a.symbols_zip) as z:
  require(len(z.infolist())<=100000 and sum(i.file_size for i in z.infolist())<=3*1024**3,'Symbol ZIP budget')
  for i in z.infolist():
   path=pathlib.PurePosixPath(i.filename)
   require(not path.is_absolute() and '..' not in path.parts and '\\' not in i.filename and stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG,stat.S_IFDIR),'Unsafe symbol member')
   out=symbols/path
   if i.is_dir():out.mkdir(parents=True,exist_ok=True);continue
   out.parent.mkdir(parents=True,exist_ok=True)
   with z.open(i) as src,open(out,'wb') as dst:shutil.copyfileobj(src,dst,1024**2)
 require(any(symbols.rglob('*.sym')),'Missing Breakpad symbols')
 for name in ['early-hook.cjs','patch_playwright.py','sanitize_stack.py','transport.py','validate_export.py','diagnostic-driver.mjs']:
  shutil.copyfile(HERE/name,payload/name)
 shutil.copyfile(HERE/'diagnostic_guest.py',payload/'guest.py')
 shutil.copyfile(HERE/'vendor/common.py',payload/'common.py');shutil.copyfile(HERE/'vendor/png_validation.py',payload/'png_validation.py')
 (payload/'cell.json').write_text(json.dumps(cell))
 hashes={str(f.relative_to(payload)):sha(f) for f in payload.rglob('*') if f.is_file()}
 seed=work/'seed';seed.mkdir();config=seed_config(hashes)
 # Remove the release helper's exception echo/raw fallback. This diagnostic seed emits
 # only a static failure marker on infrastructure errors; no data-bearing exception.
 script=config['write_files'][0]['content'];begin=script.index('except BaseException as error:');end=script.index('finally:',begin)
 script=script[:begin]+"except BaseException:\n rc=1\n print('Diagnostic seed failed',file=sys.stderr)\n"+script[end:]
 config['write_files'][0]['content']=script
 (seed/'user-data').write_text('#cloud-config\n'+json.dumps(config));(seed/'meta-data').write_text('instance-id: t3-diagnostic-'+cell['label']+'\nlocal-hostname: t3-validation\n')
 for folder,label,dest in [(payload,'T3PAYLOAD',work/'payload.iso'),(seed,'cidata',work/'seed.iso')]:run(['genisoimage','-quiet','-output',str(dest),'-volid',label,'-joliet','-rock',str(folder)],90)
 image=work/'base.qcow2';fetch_image(image);require(sha(image,'sha512')==cell['guestImageSha512']==IMAGE_SHA,'Guest image')
 run(['qemu-img','create','-f','qcow2','-F','qcow2','-b',str(image),str(work/'guest.qcow2'),'10G'],30)
 command=['qemu-system-x86_64',*cell['accelerator'],'-m','4096','-smp','2','-display','none','-monitor','none','-serial','file:'+str(work/'console.log'),'-device','virtio-serial-pci','-chardev','file,id=t3result,path='+str(work/'serial.log'),'-device','virtserialport,chardev=t3result,name=org.t3.result','-nic','user,model=virtio-net-pci','-drive','file='+str(work/'guest.qcow2')+',format=qcow2,if=virtio','-drive','file='+str(work/'seed.iso')+',media=cdrom,readonly=on','-drive','file='+str(work/'payload.iso')+',media=cdrom,readonly=on','-no-reboot']
 process=None
 try:
  with open(work/'qemu.log','wb') as log:
   blocked=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
   try:process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   finally:signal.pthread_sigmask(signal.SIG_SETMASK,blocked)
   await_frame(process,work/'serial.log',2400,[(work/'console.log',32*1024**2),(work/'qemu.log',16*1024**2)])
   decode(work/'serial.log',work/'public')
 finally:
  stop_owned_process(process)
 # Verify exactly two files; never give the uploader a VM/log/dump path.
 root=work/'public';require({f.name for f in root.iterdir()}=={'diagnostic.json','manifest.json'},'Unexpected public payload')
 m=json.loads((root/'manifest.json').read_text());d=root/'diagnostic.json';require(d.stat().st_size<=65536,'Public size')
 require(m['files']==[{'name':'diagnostic.json','bytes':d.stat().st_size,'sha256':sha(d)}] and m['diagnosticOnly'] is True,'Public hash binding')
 record=json.loads(d.read_text());require(record['diagnosticOnly'] is True and record['source']==cell['source'] and record['appimageSha256']==cell['appimage']['sha256'],'Public source binding')
 trusted={}
 for symbol in symbols.rglob('*.sym'):
  with open(symbol,errors='strict') as stream:header=stream.readline(1024).split()
  if len(header)==5 and header[:3]==['MODULE','Linux','x86_64']:trusted[header[3].replace('-','').upper()]=header[4]
 from validate_export import check
 check(record,cell,trusted)
 print('Diagnostic completed; not release acceptance')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--cell',choices=['candidate','control'],required=True)
 for name in ['work','installer-zip','proof-zip','playwright-tar','stackwalker','stackwalker-sha256','symbols-zip']:p.add_argument('--'+name,required=True)
 p.add_argument('--execute-reviewed-operation',action='store_true');main(p.parse_args())

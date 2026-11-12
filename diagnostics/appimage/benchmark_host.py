"""No application or private dump: bounded public symbols benchmark only."""
import argparse,pathlib,os,json,hashlib,shutil,signal,subprocess,zipfile
HERE=pathlib.Path(__file__).resolve().parent
import sys
sys.path.insert(0,str(HERE/'vendor'))
from common import require,run,sha,IMAGE_SHA
from host import seed_config,fetch_image,await_frame
from diagnostic_host import stop_owned_process,install_cancellation_handlers
from decode_diagnostic import decode
from symbol_index import SHA256,ID,HEADER
from public_fixture import transform
from benchmark_export import check
SYMBOL_ZIP_SHA='9c497198ec2e5b0c097a5a10434255d26d10e467c6670b3115e4c00df68e0d43'
def main(a):
 require(a.execute_reviewed_benchmark,'Explicit reviewed benchmark flag required');install_cancellation_handlers()
 require(os.geteuid()!=0 and os.environ.get('GITHUB_ACTIONS')=='true','Nonroot Actions only')
 contract=json.loads((HERE/'benchmark.json').read_text())
 for row in contract['helpers']:require(sha(HERE/row['name'])==row['sha256'],'Benchmark helper mismatch')
 work=pathlib.Path(a.work).resolve();require(not work.exists() and not any(c in str(work) for c in ',\n\r'),'Fresh safe work path');work.mkdir();require(shutil.disk_usage(work).free>=10*1024**3,'Disk budget')
 payload=work/'payload';payload.mkdir();require(sha(a.symbols_zip)==SYMBOL_ZIP_SHA,'Official symbol ZIP hash')
 member='breakpad_symbols/electron/'+ID+'/electron.sym'
 with zipfile.ZipFile(a.symbols_zip) as z:
  names=[i.filename for i in z.infolist() if i.filename.endswith('.sym')];require(names==[member],'Unexpected official symbols')
  require(z.getinfo(member).file_size==811367421,'Official symbol size')
  with z.open(member) as src,open(payload/'official.sym','wb') as out:shutil.copyfileobj(src,out,1024*1024)
 require(sha(payload/'official.sym')==SHA256,'Official symbol member hash')
 require(sha(a.stackwalker)==a.stackwalker_sha256,'Compiled pinned stackwalker hash');shutil.copyfile(a.stackwalker,payload/'minidump-stackwalk');(payload/'minidump-stackwalk').chmod(0o755)
 fixture=pathlib.Path(a.fixture).read_bytes()
 for label,wrong in [('indexed-matching',False),('indexed-wrong-id',True)]:(payload/(label+'.dmp')).write_bytes(transform(fixture,'t3code',wrong))
 for name in ['symbol_index.py','benchmark_export.py','diagnostic_errors.py','transport.py']:shutil.copyfile(HERE/name,payload/name)
 shutil.copyfile(HERE/'benchmark_guest.py',payload/'guest.py');shutil.copyfile(HERE/'vendor/common.py',payload/'common.py');shutil.copyfile(HERE/'vendor/png_validation.py',payload/'png_validation.py')
 hashes={f.name:sha(f) for f in payload.iterdir()};seed=work/'seed';seed.mkdir();config=seed_config(hashes)
 script=config['write_files'][0]['content'];begin=script.index('except BaseException as error:');end=script.index('finally:',begin);script=script[:begin]+"except BaseException:\n rc=1\n print('Benchmark seed failed',file=sys.stderr)\n"+script[end:];config['write_files'][0]['content']=script
 (seed/'user-data').write_text('#cloud-config\n'+json.dumps(config));(seed/'meta-data').write_text('instance-id: t3-public-symbol-benchmark\nlocal-hostname: t3-validation\n')
 for folder,label,dest in [(payload,'T3PAYLOAD',work/'payload.iso'),(seed,'cidata',work/'seed.iso')]:run(['genisoimage','-quiet','-output',str(dest),'-volid',label,'-joliet','-rock',str(folder)],90)
 image=work/'base.qcow2';fetch_image(image);require(sha(image,'sha512')==IMAGE_SHA==contract['guestImageSha512'],'Guest image')
 run(['qemu-img','create','-f','qcow2','-F','qcow2','-b',str(image),str(work/'guest.qcow2'),'10G'],30)
 command=['qemu-system-x86_64','-accel','tcg,thread=multi','-cpu','max','-m','4096','-smp','2','-display','none','-monitor','none','-serial','file:'+str(work/'console.log'),'-device','virtio-serial-pci','-chardev','file,id=t3result,path='+str(work/'serial.log'),'-device','virtserialport,chardev=t3result,name=org.t3.result','-nic','user,model=virtio-net-pci','-drive','file='+str(work/'guest.qcow2')+',format=qcow2,if=virtio','-drive','file='+str(work/'seed.iso')+',media=cdrom,readonly=on','-drive','file='+str(work/'payload.iso')+',media=cdrom,readonly=on','-no-reboot']
 process=None
 try:
  with open(work/'qemu.log','wb') as log:
   blocked=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
   try:process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   finally:signal.pthread_sigmask(signal.SIG_SETMASK,blocked)
   await_frame(process,work/'serial.log',1500,[(work/'console.log',32*1024**2),(work/'qemu.log',16*1024**2)]);decode(work/'serial.log',work/'public')
 finally:stop_owned_process(process)
 public=work/'public';require({p.name for p in public.iterdir()}=={'diagnostic.json','manifest.json'},'Exact public export required');m=json.loads((public/'manifest.json').read_text());data=(public/'diagnostic.json').read_bytes();require(len(data)<=65536 and m['files']==[{'name':'diagnostic.json','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}],'Public hash binding');check(json.loads(data));destination=pathlib.Path(a.out);require(not destination.exists(),'Fresh output');shutil.copytree(public,destination);shutil.rmtree(work)
 print('Public-only symbol benchmark completed; not an application run or release acceptance')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--execute-reviewed-benchmark',action='store_true')
 for name in ['work','out','symbols-zip','stackwalker','stackwalker-sha256','fixture']:p.add_argument('--'+name,required=True)
 main(p.parse_args())

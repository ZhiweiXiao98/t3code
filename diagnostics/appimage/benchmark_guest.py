"""Public-data-only benchmark in the unchanged4GiB/2vCPU Debian TCG guest."""
import pathlib,os,json,time,resource,subprocess,hashlib,signal
from common import require,run,sha
from symbol_index import build_index,ID,SHA256,HEADER
from diagnostic_errors import failure_kind
from benchmark_export import check
P=pathlib.Path('/mnt/t3-payload');BASE=pathlib.Path('/var/tmp/t3-symbol-benchmark')
def main():
 require(os.geteuid()==0 and pathlib.Path('/run/cloud-init').exists(),'Guest only')
 require(not BASE.exists(),'Fresh benchmark required');BASE.mkdir();private=BASE/'private';private.mkdir();export=BASE/'export';export.mkdir()
 r={'schemaVersion':1,'diagnosticOnly':True,'mode':'public-indexed-symbol-benchmark-v1','symbolId':ID,'symbolSha256':SHA256,'phase':'preflight','cases':[]}
 try:
  require('ID=debian' in pathlib.Path('/etc/os-release').read_text(),'Wrong guest')
  r['logicalCpus']=os.cpu_count();r['memoryTotalKiB']=int(next(line for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemTotal:')).split()[1]);require(r['logicalCpus']==2 and 3500000<r['memoryTotalKiB']<4300000,'Guest resource mismatch')
  r['phase']='index-build';started=time.monotonic()
  previous=signal.signal(signal.SIGALRM,lambda *args:(_ for _ in ()).throw(TimeoutError('Bounded index construction')))
  signal.alarm(300)
  try:index=build_index(P/'official.sym',private/'symbols')
  finally:signal.alarm(0);signal.signal(signal.SIGALRM,previous);r['indexElapsedMs']=round((time.monotonic()-started)*1000)
  for label,budget in [('indexed-matching',600),('indexed-wrong-id',30)]:
   r['phase']='benchmark-execution';out=private/(label+'.json');record={'label':label,'budgetSeconds':budget};started=time.monotonic()
   try:
    with open(private/(label+'.log'),'wb') as log:
     run([str(P/'minidump-stackwalk'),'--json','--no-interactive','--output-file',str(out),str(P/(label+'.dmp')),str(index)],budget,stdout=log,stderr=subprocess.STDOUT,preexec_fn=lambda:resource.setrlimit(resource.RLIMIT_FSIZE,(32*1024**2,32*1024**2)))
    record['exitCode']=0;require(out.stat().st_size<=32*1024**2,'Output bound');parsed=json.loads(out.read_text());expected=ID if label=='indexed-matching' else 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0';mods=[m for m in parsed['modules'] if str(m.get('debug_id','')).replace('-','').upper()==expected];require(len(mods)==1,'Fixture module mismatch');record['loadedSymbols']=mods[0]['loaded_symbols'];require(record['loadedSymbols'] is (label=='indexed-matching'),'Unexpected symbol resolution');require(mods[0].get('corrupt_symbols') is False,'Corrupt symbols must not pass')
   except Exception as error:
    record['failureCode']=failure_kind(error)
    if isinstance(error,subprocess.CalledProcessError) and type(error.returncode) is int and -255<=error.returncode<=255:record['exitCode']=error.returncode
    r['failed']=True
   finally:
    record['elapsedMs']=round((time.monotonic()-started)*1000);record['cumulativeChildMaxRssKiB']=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss;r['cases'].append(record)
  r['phase']='complete'
 except Exception as error:r['failed']=True;r['failureCode']=failure_kind(error)
 check(r);data=json.dumps(r,sort_keys=True).encode();require(len(data)<=65536,'Export budget');(export/'diagnostic.json').write_bytes(data);(export/'manifest.json').write_text(json.dumps({'schemaVersion':1,'diagnosticOnly':True,'files':[{'name':'diagnostic.json','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}]}))
 from transport import emit
 emit(export)
if __name__=='__main__':main()

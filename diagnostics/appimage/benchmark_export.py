"""Fixed schema for public-only symbol benchmark. Never emit command output."""
from symbol_index import ID,SHA256
LABELS={'indexed-matching','indexed-wrong-id'}
def check(r):
 def need(value):
  if not value:raise ValueError('Benchmark schema rejected')
 need(isinstance(r,dict) and set(r)<={'schemaVersion','diagnosticOnly','mode','symbolId','symbolSha256','indexElapsedMs','cases','failed','failureCode','phase','memoryTotalKiB','logicalCpus'})
 need(r.get('schemaVersion')==1 and r.get('diagnosticOnly') is True and r.get('mode')=='public-indexed-symbol-benchmark-v1')
 need(r.get('symbolId')==ID and r.get('symbolSha256')==SHA256)
 need(r.get('phase') in {'preflight','index-build','benchmark-execution','complete'})
 if 'failed' in r:need(r['failed'] is True)
 if 'failureCode' in r:need(r['failureCode'] in {'timeout','subprocess-failed','invalid-evidence','io-error','schema-error','unexpected-error'})
 for key,bound in [('indexElapsedMs',1500000),('memoryTotalKiB',8*1024*1024),('logicalCpus',64)]:
  if key in r:need(type(r[key]) is int and 0<=r[key]<=bound)
 need(isinstance(r.get('cases'),list) and len(r['cases'])<=2);seen=set()
 for c in r['cases']:
  need(isinstance(c,dict) and set(c)<={'label','elapsedMs','budgetSeconds','exitCode','failureCode','loadedSymbols','cumulativeChildMaxRssKiB'})
  need(c.get('label') in LABELS and c['label'] not in seen);seen.add(c['label'])
  need(type(c.get('elapsedMs')) is int and 0<=c['elapsedMs']<=650000)
  need(c.get('budgetSeconds')==(600 if c['label']=='indexed-matching' else 30))
  if 'exitCode' in c:need(type(c['exitCode']) is int and -255<=c['exitCode']<=255)
  if 'failureCode' in c:need(c['failureCode'] in {'timeout','subprocess-failed','invalid-evidence','io-error','schema-error','unexpected-error'})
  if 'loadedSymbols' in c:need(type(c['loadedSymbols']) is bool)
  if 'cumulativeChildMaxRssKiB' in c:need(type(c['cumulativeChildMaxRssKiB']) is int and 0<=c['cumulativeChildMaxRssKiB']<=8*1024*1024)
 return r

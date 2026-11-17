"""Pure, fail-closed verification of reviewed distributed release-gate receipts.
No network, keys, signing or publication. Pins are a separately reviewed exact-byte
manifest, NOT derived from observed receipts. Caller must refresh API snapshots and
supply raw ZIP/log bytes; connector-decoded logs are not original HTTP log bytes.
"""
import hashlib,json,re,zipfile,io
from pathlib import PurePosixPath
from datetime import datetime
SOURCE='74039745b1b44834c30dd9cb275f1c224072dd96'
TREE='2849e01639a6ec5242b4041b65762ef78ac08a51'
REPO='ZhiweiXiao98/t3code'
RUNS={'production':43901004126,'code':43906200557,'locale':43910485616,'arm15':43989055996,'supplemental':43989361423}
# Every original current-source client-release gate, not additional invented gates.
GATES={}
def add(key,group,name,runner):GATES[key]={'group':group,'name':name,'runner':runner}
for k,n,r in [('source','Validate exact source','ubuntu-24.04'),('bundle','Build validated desktop bundle','ubuntu-24.04'),('linux','Linux x64 and embedded Windows WSL runtime','ubuntu-24.04'),('desktop-win','Desktop win x64 (integrity checked)','windows-2022'),('desktop-intel','Desktop mac x64 (integrity checked)','macos-15-intel'),('linux-clean','Clean desktop deb first start','ubuntu-24.04'),('android','Android arm64 unsigned candidate (NOT installable)','ubuntu-24.04')]:add(k,'production',n,r)
for k,n,r in [('quality','Lint and typecheck','ubuntu-24.04'),('rust','Rust native formatting and tests','ubuntu-24.04'),('mobile','Mobile native static analysis','macos-15-intel')]:add(k,'code',n,r)
for s in ['clients','server-1','server-2','server-3']:add('tests-'+s,'code','Tests ('+s+')','ubuntu-24.04' if s=='clients' else 'ubuntu-22.04')
for n in range(1,5):add('web-'+str(n),'code','Web full coverage shard '+str(n)+'/4','ubuntu-24.04')
add('web-coverage','code','Require complete Web assertion coverage','ubuntu-24.04');add('web-boot','code','Build and boot validated Web client','ubuntu-24.04')
for k,n,r in [('windows-clean','Chinese UI and restart Clean desktop nsis first start','windows-2022'),('intel-dmg','Chinese UI and restart Clean macOS x64 dmg first start','macos-15-intel'),('intel-zip','Chinese UI and restart Clean macOS x64 zip first start','macos-15-intel')]:add(k,'locale',n,r)
for k,n in [('arm-build','Desktop mac arm64 (integrity checked)'),('arm-dmg','Clean macOS arm64 dmg first start'),('arm-zip','Clean macOS arm64 zip first start')]:add(k,'arm15',n,'macos-15')

def need(x,msg):
 if not x:raise ValueError('Distributed gate receipts: '+msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def integer(v):return type(v)is int and v>0
def hash64(v):return isinstance(v,str) and re.fullmatch('[0-9a-f]{64}',v) is not None
def utc(v):
 need(isinstance(v,str) and v.endswith('Z'),'UTC timestamp');return datetime.fromisoformat(v.replace('Z','+00:00'))
def unique(seq,key):
 need(isinstance(seq,list),'list required');out={}
 for x in seq:
  need(isinstance(x,dict) and key in x and x[key] not in out,'duplicate/missing '+key);out[x[key]]=x
 return out

def verify_plan(plan, receipt):
 need(plan.get('source')==SOURCE and plan.get('tree')==TREE,'plan source')
 need(receipt.get('source')==SOURCE and receipt.get('tree')==TREE,'receipt source')
 need(set(plan['logical_gates'])==set(GATES) and receipt['logical_gates']==plan['logical_gates'],'exact26 logical gates')
 jobs=unique(receipt['jobs'],'id');planned=unique(plan['jobs'],'id')
 need(set(jobs)==set(planned),'exact producer inventory')
 for jid,jp in planned.items():
  j=jobs[jid]['api'];need(j==jp['api_snapshot'],'producer API/steps changed')
  need(j['status']=='completed' and j['conclusion']=='success' and j['runner_id']>0,'producer not executed/successful')
 for key,spec in GATES.items():
  p=plan['logical_gates'][key];j=jobs[p['job_id']]['api']
  need(j['run_id']==RUNS[spec['group']] and j['name']==spec['name'] and spec['runner'] in j['labels'],'logical original job/run/OS')
  need(j['run_attempt']==p['producer_attempt'],'original producer attempt')
  rp=next(r for r in plan['runs'] if r['id']==j['run_id'])
  need(j['head_sha']==rp['expected']['head_sha'],'original source/operation')
  need(utc(j['started_at'])<utc(j['completed_at']),'actual job interval')
 expected=[r['expected'] for r in plan['runs']]
 need(receipt['runs']==expected,'run snapshots changed')
 for r in expected:need(r['status']=='completed' and r['conclusion']==('failure' if r['id']==43901004126 else 'success'),'never relabel original full failure')
 return [jobs[plan['logical_gates'][key]['job_id']]['api'] for key in sorted(GATES)]

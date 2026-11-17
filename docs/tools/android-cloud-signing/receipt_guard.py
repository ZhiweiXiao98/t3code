"""Frozen actual collector receipt consumer. No keys/publication. Fail closed until pins reviewed."""
import hashlib,json,re,tempfile,zipfile
from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
from gate_receipts import SOURCE,TREE,verify_plan
from replay_semantics import replay
REPO='ZhiweiXiao98/t3code';COLLECTOR=44002947263;OP='9bffbffebd3ec1ce90d50e09a0796f5119f966a4'
BRANCH='validation/v0.1.9-original-proof-receipts-74039745';WORKFLOW='.github/workflows/original-proof-receipts-740.yml'
def need(v,m):
 if not v:raise ValueError('Receipt guard: '+m)
def sha(b):return hashlib.sha256(b).hexdigest()
def stamp(s):return datetime.fromisoformat(s.replace('Z','+00:00'))
def load_pins(manifest):
 raw=Path(__file__).with_name('receipt-pins.BLOCKED.json').read_bytes()
 need(isinstance(manifest.get('receipt_pins_sha256'),str) and sha(raw)==manifest['receipt_pins_sha256'],'BLOCKED unreviewed receipt pins')
 p=json.loads(raw);need(p.get('ready')is True and p['collector_run_id']==COLLECTOR and p['collector_operation']==OP and p['source']==SOURCE,'BLOCKED collector pins')
 for k in ['zip_sha256','plan_sha256']:need(re.fullmatch('[a-f0-9]{64}',p.get(k) or ''),'unknown '+k)
 need(type(p.get('artifact_id'))is int and type(p.get('zip_size'))is int and 0<p['zip_size']<=160*1024*1024,'unknown/bounded receipt artifact')
 return p

def current(api,p,plan):
 need(api.json('/git/ref/heads/maintenance/v0.1.9-zh-cloud')['object']['sha']==SOURCE and api.json('/git/commits/'+SOURCE)['tree']['sha']==TREE,'frozen source moved')
 need(api.json('/git/ref/heads/'+BRANCH)['object']['sha']==OP,'collector branch moved')
 op=api.json('/git/commits/'+OP);diff=api.json('/compare/'+SOURCE+'...'+OP)
 need([x['sha'] for x in op['parents']]==[SOURCE] and diff['ahead_by']==1 and diff['behind_by']==0 and diff['merge_base_commit']['sha']==SOURCE,'collector ancestry')
 need(len(diff['files'])==1 and diff['files'][0]['filename']==WORKFLOW and diff['files'][0]['status']=='added' and diff['files'][0]['sha']=='ac3857586b3f3a72ac3be9b1461f513dfa055926','collector workflow-only operation')
 r=api.json('/actions/runs/'+str(COLLECTOR))
 expect={'id':COLLECTOR,'run_attempt':1,'head_sha':OP,'head_branch':BRANCH,'path':WORKFLOW,'status':'completed','conclusion':'success','event':'push'}
 need(all(r.get(k)==v for k,v in expect.items()) and r['repository']['full_name']==r['head_repository']['full_name']==REPO and r['repository']['private']is False,'collector original successful run')
 j=api.json('/actions/jobs/'+str(p['producer']['id']));need(j==p['producer'] and j['run_id']==COLLECTOR and j['run_attempt']==1 and j['head_sha']==OP and j['conclusion']=='success' and j['runner_id']>0,'collector producer')
 a=api.json('/actions/artifacts/'+str(p['artifact_id']));need(a==p['artifact_api'] and a['workflow_run']['id']==COLLECTOR and a['workflow_run']['head_sha']==OP,'collector artifact binding')
 need(a['expired']is False and stamp(a['expires_at'])>datetime.now(timezone.utc) and a['digest']=='sha256:'+p['zip_sha256'] and a['size_in_bytes']==p['zip_size'],'collector ZIP expiry/hash')
 need(stamp(j['started_at'])<=stamp(a['created_at'])<=stamp(a['updated_at'])<=stamp(j['completed_at']),'collector producer interval')
 for rp in plan['runs']:
  rr=api.json('/actions/runs/'+str(rp['id']));need(all(rr[k]==v for k,v in rp['expected'].items()),'original gate run drift')
  need(rr['repository']['full_name']==rr['head_repository']['full_name']==REPO,'original run repository')
  if rp['id']!=43901004126:
   need(api.json('/git/ref/heads/'+rr['head_branch'])['object']['sha']==rr['head_sha'],'original operation branch moved')
   oo=api.json('/git/commits/'+rr['head_sha']);dd=api.json('/compare/'+SOURCE+'...'+rr['head_sha'])
   need(oo==rp['operation'] and [x['sha'] for x in oo['parents']]==[SOURCE] and dd['ahead_by']==1 and dd['behind_by']==0 and dd['merge_base_commit']['sha']==SOURCE,'original source operation')
   need(len(dd['files'])==1 and dd['files'][0]['filename']==rr['path'] and dd['files'][0]['sha']==rp['workflow_blob'] and dd['files'][0]['status']=='added','original workflow-only diff')
 for jp in plan['jobs']:need(api.json('/actions/jobs/'+str(jp['id']))==jp['api_snapshot'],'original exact job/steps/attempt changed')
 for ap in plan['artifacts']:
  aa=api.json('/actions/artifacts/'+str(ap['id']));need(aa==ap['api_snapshot'] and aa['expired']is False and stamp(aa['expires_at'])>datetime.now(timezone.utc),'original proof artifact changed/expired')
 return {'collector_run':expect,'producer':j,'artifact':a}

def unpack(path,p,root):
 raw=Path(path).read_bytes();need(len(raw)==p['zip_size'] and sha(raw)==p['zip_sha256'],'receipt ZIP bytes')
 with zipfile.ZipFile(path) as z:
  infos=z.infolist();need(len(infos)==len(p['members']) and len({i.filename for i in infos})==len(infos),'receipt member inventory')
  need(sum(i.file_size for i in infos)<=180*1024*1024,'receipt expanded budget')
  for i in infos:
   n=PurePosixPath(i.filename);need(len(n.parts)==1 and not n.is_absolute() and n.name not in ['.','..'] and '\\' not in i.filename and not i.is_dir() and not i.flag_bits&1 and (i.external_attr>>16)&0o170000 in [0,0o100000],'unsafe receipt member')
   pin=p['members'].get(i.filename);need(pin is not None and i.file_size==pin['size'],'receipt member size')
  need(z.testzip()is None,'receipt CRC')
  for i in infos:
   b=z.read(i);need(sha(b)==p['members'][i.filename]['sha256'],'receipt member bytes');(root/i.filename).write_bytes(b)

def verify(api,manifest):
 p=load_pins(manifest);plan_raw=Path(__file__).with_name('receipt-collection-plan.json').read_bytes();need(sha(plan_raw)==p['plan_sha256'],'collection plan changed');plan=json.loads(plan_raw)
 before=current(api,p,plan)
 with tempfile.TemporaryDirectory(prefix='reviewed-original-receipts-') as tmp:
  root=Path(tmp);archive=root/'download.zip';api.download(p['artifact_id'],archive,p['zip_size']);data=root/'data';data.mkdir();unpack(archive,p,data)
  receipt=json.loads((data/'original-byte-receipts.json').read_text());jobs=verify_plan(plan,receipt)
  operation=json.loads((data/'collector-operation.json').read_text());need(operation['operation_sha']==OP and operation['run_id']==COLLECTOR and operation['source']==SOURCE and operation['workflow']==WORKFLOW and operation['branch']==BRANCH,'collector output operation')
  for record in receipt['jobs']:
   if record['id'] in plan['raw_log_jobs']:
    raw=(data/f"job-{record['id']}.log").read_bytes();need(record.get('kind')=='original-http-response-bytes' and len(raw)==record['size'] and sha(raw)==record['sha256'],'original raw log mismatch')
  aps={a['id']:a for a in plan['artifacts']};need(len(receipt['artifacts'])==len(aps) and {a['id'] for a in receipt['artifacts']}==set(aps),'proof ZIP inventory')
  for a in receipt['artifacts']:
   expected=aps[a['id']]['api_snapshot'];raw=(data/f"artifact-{a['id']}.zip").read_bytes();need(a['api']==expected and len(raw)==a['size']==expected['size_in_bytes'] and sha(raw)==a['sha256']==expected['digest'][7:],'original ZIP hash/source')
  semantics=replay(plan,receipt,data);need(semantics==receipt['semantics'],'semantic replay differs from observed receipt')
  need(current(api,p,plan)==before,'evidence changed while preparing')
 return {'total_count':26,'jobs':jobs,'supplemental_coverage':semantics['supplemental'],'ui_validation':semantics['ui'],'receipt_provenance':{'collector_run':COLLECTOR,'artifact_id':p['artifact_id'],'zip_sha256':p['zip_sha256']}}

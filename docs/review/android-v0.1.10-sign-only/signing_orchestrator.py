"""Inert reviewed original-identity orchestration. No publisher or key generation.
Real execution requires an independently reviewed enabled operation binding;
this PR ships disabled. Never run on candidate repository source.
"""
import argparse, datetime, hashlib, json, os, pathlib, re, tempfile, urllib.error, urllib.parse, urllib.request, zipfile
from candidate_verifier import validate_pins, verify_snapshot, verify_archive
from encrypted_handoff import recipient_key
from replay_guard import guard

REPO='ZhiweiXiao98/t3code'
REF='refs/heads/signing/android-bootstrap'
RECOVERY_RUN=40649758501
RECOVERY_ARTIFACT=12799615493
RECOVERY_SHA='8fc8b21abd2380926242fc49e7f488cb4b3aa0b8'
RECOVERY_DIGEST='b2c345e3b7566e2c6cd3efa8be8213b464f1c3a04497967c96228d3797769fdd'
CERT='82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88'
CONTAINER='7e4922f7de02c1c739e627eb3ef87fa1fb639329ed27613dff8b4f0fdad2d397'
BASE='https://api.github.com/repos/'+REPO

def need(ok,msg):
    if not ok:raise ValueError(msg)

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def operation(config,public,expected_sha,env):
    need(set(config)=={'enabled','recipientSpkiSha256','recipientPublicKeySha256'},'Operation schema')
    need(config['enabled'] is True,'Operation disabled; review required')
    need(re.fullmatch('[a-f0-9]{40}',expected_sha or '') is not None,'Exact approved operation SHA required')
    for key,value in {'GITHUB_REPOSITORY':REPO,'GITHUB_REF':REF,'GITHUB_SHA':expected_sha,
                      'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_RUN_ATTEMPT':'1',
                      'GITHUB_ACTOR':'ZhiweiXiao98','GITHUB_ACTOR_ID':'99611261','GITHUB_TRIGGERING_ACTOR':'ZhiweiXiao98',
                      'T3_SIGNING_ENVIRONMENT':'android-signing'}.items():need(env.get(key)==value,'Operation context mismatch')
    need(env.get('GITHUB_RUN_ID','').isdigit(),'Operation run ID missing')
    need(hashlib.sha256(public).hexdigest()==config['recipientPublicKeySha256'],'Recipient file mismatch')
    recipient_key(public,config['recipientSpkiSha256'])
    return {'operation_sha':expected_sha,'operation_run':env['GITHUB_RUN_ID'],
            'recipientSpkiSha256':config['recipientSpkiSha256']}

class RejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

class Api:
    def __init__(self,token):
        need(bool(token),'Read-only Actions token required');self.token=token
        self.opener=urllib.request.build_opener(RejectRedirect())
    def request(self,path):
        need(path.startswith('/') or path=='','Fixed API path required')
        return urllib.request.Request(BASE+path,headers={'Authorization':'Bearer '+self.token,
            'Accept':'application/vnd.github+json','User-Agent':'T3-reviewed-android-preflight'})
    def json(self,path):
        with self.opener.open(self.request(path),timeout=30) as r:raw=r.read(4*1024*1024+1)
        need(len(raw)<=4*1024*1024,'API response too large');return json.loads(raw)
    def download(self,artifact,destination,maximum):
        try:self.opener.open(self.request('/actions/artifacts/'+str(artifact)+'/zip'),timeout=30)
        except urllib.error.HTTPError as e:
            need(e.code==302,'Expected artifact redirect');location=e.headers.get('Location','')
        else:raise ValueError('Artifact redirect missing')
        u=urllib.parse.urlsplit(location)
        need(u.scheme=='https' and u.port in (None,443) and not u.username and not u.password and not u.fragment and u.hostname and
             any(u.hostname.endswith(s) for s in ('.blob.core.windows.net','.githubusercontent.com','.actions.githubusercontent.com')),
             'Unapproved storage URL')
        # The object request has NO GitHub Authorization; reject further redirects.
        total=0;created=False
        try:
            with self.opener.open(urllib.request.Request(location),timeout=120) as r,open(destination,'xb') as f:
                created=True
                while True:
                    b=r.read(min(1024*1024,maximum-total+1))
                    if not b:break
                    total+=len(b);need(total<=maximum,'Artifact too large');f.write(b)
        except Exception:
            if created:pathlib.Path(destination).unlink(missing_ok=True)
            raise

def snapshot(api,p):
    # Reuse the reviewed collector while supplying fixed authenticated GET transport.
    c=p['candidate'];rid=str(c['runId']);sha=c['sourceSha']
    paths={'repository':'','run':'/actions/runs/'+rid,'workflow':'/actions/workflows/'+str(c['workflowId']),
      'commit':'/commits/'+sha,'workflowFile':'/contents/'+c['workflowPath']+'?ref='+sha,
      'jobs':'/actions/runs/'+rid+'/attempts/1/jobs?per_page=100'}
    s={k:api.json(v) for k,v in paths.items()}
    s['artifact']=api.json('/actions/artifacts/'+str(p['artifact']['id']))
    verify_snapshot(p,s,now=datetime.datetime.now(datetime.timezone.utc));return s

def recovery_metadata(api):
    run=api.json('/actions/runs/'+str(RECOVERY_RUN));a=api.json('/actions/artifacts/'+str(RECOVERY_ARTIFACT))
    need(all(run.get(k)==v for k,v in {'id':RECOVERY_RUN,'run_attempt':1,'status':'completed','conclusion':'success',
        'head_sha':RECOVERY_SHA,'head_branch':'signing/android-bootstrap','path':'.github/workflows/android-signing-recovery.yml'}.items()),'Recovery run changed')
    need(run.get('repository',{}).get('full_name')==REPO,'Recovery repository')
    need(all(a.get(k)==v for k,v in {'id':RECOVERY_ARTIFACT,'expired':False,'name':'android-public-recovery-evidence-'+str(RECOVERY_RUN),
        'digest':'sha256:'+RECOVERY_DIGEST}.items()),'Recovery artifact changed')
    need(a.get('workflow_run',{}).get('id')==RECOVERY_RUN and a['workflow_run'].get('head_sha')==RECOVERY_SHA,'Recovery artifact source')
    need(datetime.datetime.fromisoformat(a['expires_at'].replace('Z','+00:00'))>datetime.datetime.now(datetime.timezone.utc),'Recovery expired')
    return {'run':run,'artifact':a}

def recovery_bytes(path):
    need(path.stat().st_size<=128*1024 and digest(path)==RECOVERY_DIGEST,'Recovery bytes mismatch')
    with zipfile.ZipFile(path) as z:
        items=z.infolist();need(len(items)==1,'Recovery member count')
        i=items[0];need(i.filename=='recovery-report.json' and i.file_size<=64*1024 and not i.flag_bits&1 and
             (i.external_attr>>16)&0o170000!=0o120000,'Recovery member invalid')
        report=json.loads(z.read(i))
    need(report.get('certificate_sha256')==CERT and report.get('encrypted_container_sha256')==CONTAINER and
         report.get('imported_backup_private_key_recovery_verified') is True,'Recovery identity mismatch')

def prepare(work,api,pins,binding):
    work=pathlib.Path(work);work.mkdir(mode=0o700,exist_ok=False)
    try:
        guard(api,operation_sha=binding['operation_sha'],env=os.environ)
        before=snapshot(api,pins);rbefore=recovery_metadata(api)
        api.download(RECOVERY_ARTIFACT,work/'recovery.zip',128*1024);recovery_bytes(work/'recovery.zip')
        api.download(pins['artifact']['id'],work/'candidate.zip',pins['artifact']['zipBytes'])
        verify_archive(pins,work/'candidate.zip')
        after=snapshot(api,pins);rafter=recovery_metadata(api)
        need(before==after and rbefore==rafter,'Metadata changed during preparation')
        observation=guard(api,operation_sha=binding['operation_sha'],env=os.environ)
        proof={'binding':binding,'candidate':after,'recovery':rafter,'replayObservation':observation,'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        (work/'prepared.json').write_text(json.dumps(proof))
    except Exception:
        import shutil;shutil.rmtree(work);raise

def load_prepared(work,pins,binding):
    work=pathlib.Path(work);proof=json.loads((work/'prepared.json').read_text())
    need(proof['binding']==binding,'Prepared operation binding mismatch')
    need(proof.get('replayObservation')=={'observed_single_dispatch':True,'operation_sha':binding['operation_sha'],
        'operation_run_id':int(binding['operation_run']),'atomic_consumption_guaranteed':False},'Replay observation mismatch')
    age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['preparedAt'])).total_seconds()
    need(0<=age<=120,'Prepared proof stale')
    verify_snapshot(pins,proof['candidate'],now=datetime.datetime.now(datetime.timezone.utc))
    verify_archive(pins,work/'candidate.zip');recovery_bytes(work/'recovery.zip')
    return proof

# Sign-stage CLI intentionally imports signer only after operation/proof validation.
def main():
    ap=argparse.ArgumentParser();ap.add_argument('stage',choices=['prepare','sign'])
    for name in ('operation','recipient','operation-sha','workspace'):ap.add_argument('--'+name,required=True)
    ap.add_argument('--output');ap.add_argument('--sdk-tools');args=ap.parse_args()
    root=pathlib.Path(__file__).parent
    pins=validate_pins(json.loads((root/'candidate-pins.json').read_text()))
    public=pathlib.Path(args.recipient).read_bytes();config=json.loads(pathlib.Path(args.operation).read_text())
    binding=operation(config,public,args.operation_sha,os.environ)
    if args.stage=='prepare':
        need(not any(os.environ.get(k) for k in ('ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD')),'Secrets forbidden in prepare')
        prepare(args.workspace,Api(os.environ.get('GITHUB_TOKEN','')),pins,binding)
    else:
        need(bool(args.output) and bool(args.sdk_tools),'Output and trusted SDK required')
        load_prepared(args.workspace,pins,binding)
        # Extract ONLY the already byte-verified fixed APK. All private outputs use a temp directory.
        with tempfile.TemporaryDirectory(prefix='t3-sign-input-') as td:
            apk=pathlib.Path(td)/'unsigned.apk'
            with zipfile.ZipFile(pathlib.Path(args.workspace)/'candidate.zip') as z:
                apk.write_bytes(z.read(pins['artifact']['members'][0]['name']))
            from signer_adapter import sign_candidate,ReviewedAuthorization,SDK_PINS
            auth=ReviewedAuthorization(repository=REPO,source_sha=pins['candidate']['sourceSha'],
                candidate_run_id=pins['candidate']['runId'],artifact_id=pins['artifact']['id'],candidate_attempt=1,
                operation_sha=binding['operation_sha'],operation_ref=REF,environment='android-signing',
                recipient_spki_sha256=config['recipientSpkiSha256'],sdk_tool_sha256=SDK_PINS,
                recovery_verified=True,activation_reviewed=True)
            sign_candidate(apk,pathlib.Path(args.sdk_tools),public,pathlib.Path(args.output),authorization=auth)

if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Reviewed operation failed closed; no secret/tool output exposed') from None

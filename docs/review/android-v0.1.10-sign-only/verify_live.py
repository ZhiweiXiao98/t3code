"""Public GET-only preflight. No token, signing, download redirect, or remote mutation."""
import argparse,datetime,json,pathlib,urllib.request
from candidate_verifier import validate_pins,verify_snapshot,verify_archive
BASE='https://api.github.com/repos/ZhiweiXiao98/t3code'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('API redirects forbidden')
OPENER=urllib.request.build_opener(NoRedirect)
def get(path):
    req=urllib.request.Request(BASE+path,headers={'User-Agent':'T3-Android-read-only-preflight','Accept':'application/vnd.github+json'})
    with OPENER.open(req,timeout=30) as r:
        raw=r.read(4*1024*1024+1)
    if len(raw)>4*1024*1024:raise ValueError('Response too large')
    return json.loads(raw)
def snapshot(p):
    c=p['candidate'];sha=c['sourceSha'];rid=str(c['runId'])
    paths={'repository':'','run':'/actions/runs/'+rid,'workflow':'/actions/workflows/'+str(c['workflowId']),'commit':'/commits/'+sha,'workflowFile':'/contents/'+c['workflowPath']+'?ref='+sha,'jobs':'/actions/runs/'+rid+'/attempts/1/jobs?per_page=100'}
    s={k:get(v) for k,v in paths.items()}
    artifacts=get('/actions/runs/'+rid+'/artifacts?per_page=100')
    if artifacts['total_count']!=len(artifacts['artifacts']) or len(artifacts['artifacts'])>=100:raise ValueError('Artifact pagination')
    matches=[a for a in artifacts['artifacts'] if a['id']==p['artifact']['id']]
    if len(matches)!=1:raise ValueError('Artifact missing/duplicate')
    s['artifact']=matches[0];return s
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--archive',required=True);a=ap.parse_args()
    pins=validate_pins(json.loads(pathlib.Path(__file__).with_name('candidate-pins.json').read_text()))
    before=snapshot(pins);verify_snapshot(pins,before,now=datetime.datetime.now(datetime.timezone.utc))
    proof=verify_archive(pins,a.archive)
    after=snapshot(pins);verify_snapshot(pins,after,now=datetime.datetime.now(datetime.timezone.utc))
    for key in ('run','jobs','artifact','commit','workflowFile','workflow'):
        if before[key]!=after[key]:raise ValueError('Candidate changed during inspection: '+key)
    print(json.dumps({'live_metadata_before_after':'PASS','bytes':proof,'original_key_execution_enabled':False},indent=2))

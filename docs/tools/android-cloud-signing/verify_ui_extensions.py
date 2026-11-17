"""Mandatory raw dual-platform/observer checks. No network, execution or signing."""
import hashlib,json,posixpath,sys
from pathlib import Path
from datetime import datetime
import observer_contract as observer
TOAST='apps/mobile/src/components/ui/Toast.test.tsx'
CASES={'ios':'applies provenance to normal and single-line toast text and VoiceOver without retranslating opaque content','android':'keeps the Android swipe-dismiss accessibility alert in the same provenance mode'}
FILES=[TOAST,'apps/mobile/src/components/ui/Toast.tsx','apps/mobile/vite.config.ts','apps/mobile/babel.config.js','pnpm-lock.yaml']
def need(ok):
    if not ok:raise ValueError('Raw UI extension evidence contract failed')
def strict(raw):return json.loads(raw,object_pairs_hook=observer.unique_object,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Invalid JSON number')))
def sha(raw):return hashlib.sha256(raw).hexdigest()
def binding(value,p):
    need(value['sourceSha']==p['source_sha'] and value['sourceTree']==p['source_tree'] and value['operationSha']==p['operation_sha'])
    need(value['runId']==str(p['run_id']) and type(value['runAttempt']) is int and value['runAttempt']==p['run_attempt'])
def exact(a,b):
    need(type(a) is type(b))
    if isinstance(a,dict):
        need(set(a)==set(b))
        for k in a:exact(a[k],b[k])
    elif isinstance(a,list):
        need(len(a)==len(b))
        for x,y in zip(a,b):exact(x,y)
    else:need(a==b)
def verify(members,p):
    need(sys.flags.optimize==0)
    # All expected identities/digests come from separately reviewed source/artifact pins.
    for field,iso in [('producer_started_ms','started_at'),('producer_finished_ms','completed_at')]:
        need(type(p[field]) is int and p[field]==int(datetime.fromisoformat(p['producer'][iso].replace('Z','+00:00')).timestamp()*1000))
    expected=p['extension_source_hashes'];need(set(expected)==set(FILES))
    need(all(isinstance(x,str) and len(x)==64 and all(c in '0123456789abcdef' for c in x) for x in expected.values()))
    titles=[];proofs=[]
    for platform,title in CASES.items():
        raw=members[f'toast-{platform}-raw.json'];need(0<len(raw)<=2*1024*1024)
        v=strict(members[f'toast-{platform}-provenance.json']);binding(v,p)
        need(v['platform']==platform and v['job']=='supplemental' and v['sourceFiles']==expected)
        need(v['command']==['node','verified-vitest5.0.5','run',TOAST,'--maxWorkers=1','--retry=0','--reporter=json'])
        need(type(v['code']) is int and v['code']==0 and v['signal'] is None and v['timedOut'] is False and not v.get('spawnError',False))
        start,end=v['startedAt'],v['finishedAt'];need(type(start) is int and type(end) is int and p['producer_started_ms']<=start<=end<=p['producer_finished_ms'] and end-start<=125000)
        need(v['rawReportBytes']==len(raw) and v['rawReportSha256']==sha(raw))
        r=strict(raw);need(r['success'] is True)
        for k,n in {'numTotalTests':1,'numPassedTests':1,'numFailedTests':0,'numPendingTests':0,'numTodoTests':0,'numFailedTestSuites':0}.items():need(type(r.get(k,0 if k=='numTodoTests' else None)) is int and r.get(k,0)==n)
        need(len(r['testResults'])==1);f=r['testResults'][0]
        need(f['name']==posixpath.join(p['checkout_root'],TOAST) and f['status']=='passed' and len(f['assertionResults'])==1)
        a=f['assertionResults'][0];need(a['title']==a['fullName']==title and a['status']=='passed' and a['failureMessages']==[])
        for t in [r['startTime'],f['startTime'],f['endTime']]:need(type(t) in (int,float) and start-1000<=t<=end)
        need(f['endTime']>=f['startTime'])
        proof={'platform':platform,'file':TOAST,'title':title,'passed':1,'failed':0,'skipped':0,'todo':0};exact(v['proof'],proof);titles.append(title);proofs.append(proof)
    need(set(titles)==set(CASES.values()) and len(titles)==2)
    tv=strict(members['toast-platform-verdict.json']);need(tv['sourceSha']==p['source_sha'] and tv['sourceTree']==p['source_tree'] and tv['operationSha']==p['operation_sha'] and tv['success'] is True);exact(tv['proofs'],proofs)
    verdict=strict(members['observer-verdict.json']);binding(verdict,p);need(verdict['success'] is True)
    log=members['unit.log'];need(0<len(log)<64*1024*1024 and b'Web lifecycle observation stopped: byte budget reached.' not in log)
    rows=[]
    for name,limit,server in [('browser-lifecycle.jsonl',2*1024*1024,False),('browser-server-lifecycle.jsonl',256*1024,True)]:
        raw=members[name];need(0<len(raw)<=limit);parsed=[strict(line) for line in raw.decode('utf-8').splitlines() if line.strip()];need(bool(parsed))
        for row in parsed:
            observer.safe_row(row,server=server)
            need(type(row.get('utc_ms')) is int and p['producer_started_ms']<=row['utc_ms']<=p['producer_finished_ms'])
        rows.append(parsed)
    identity_raw=members['module-identity.json'];need(0<len(identity_raw)<=4096)
    identity=strict(identity_raw);observer.validate_identity(identity)
    actual=observer.qualify_orchestrator(*rows,identity);exact(verdict['module_identity'],identity);exact(verdict['current_socket_attachments'],actual['current_socket_attachments']);exact(verdict['counts'],actual['counts']);exact(verdict['server_chains'],actual['server_chains'])
    return {'dual_compiled_toast_cases':2,'observer_positive_coverage':True,'native_device_acceptance':False}

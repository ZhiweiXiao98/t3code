import json,sys,os,shutil
from pathlib import Path
def qualify(rows):
    counts = {name: 0 for name in (
        "snapshots", "tester_101", "missing_state", "null_state", "malformed_state",
        "different_state", "missing_data", "malformed_data", "zero_data", "qualified",
    )}
    for row in rows:
        if not isinstance(row, dict) or row.get("event") != "socket-activity-snapshot":
            continue
        counts["snapshots"] += 1
        if row.get("socket_kind") != "tester" or type(row.get("handshake_status")) is not int or row["handshake_status"] != 101:
            continue
        counts["tester_101"] += 1
        fields = ("page_closed", "context_closed", "browser_connected")
        if any(key not in row for key in fields):
            counts["missing_state"] += 1
            continue
        if any(row[key] is None for key in fields):
            counts["null_state"] += 1
            continue
        if any(type(row[key]) is not bool for key in fields):
            counts["malformed_state"] += 1
            continue
        if not (row["page_closed"] is False and row["context_closed"] is False and row["browser_connected"] is True):
            counts["different_state"] += 1
            continue
        data = ("sent_data_count", "received_data_count")
        if any(key not in row for key in data):
            counts["missing_data"] += 1
            continue
        if any(type(row[key]) is not int or not 0 <= row[key] <= 65535 for key in data):
            counts["malformed_data"] += 1
            continue
        if any(row[key] == 0 for key in data):
            counts["zero_data"] += 1
            continue
        counts["qualified"] += 1
    return counts


LIFECYCLE_KEYS=set('utc_ms host_pid event provider browser page target socket socket_kind category code teardown main handshake_status page_closed context_closed browser_connected reason sample requested_ms result process_count network_count pid pending samples tracked_sockets sockets_with_data emitted_sockets omitted_sockets observed_pages snapshot_pages omitted_pages direction'.split())|{f'{d}_{k}_{f}' for d in ('sent','received') for k in ('data','ping','pong') for f in ('count','last_utc_ms')}
LIFECYCLE_KEYS |= {'sequence','browser_utc_ms','ready_state','wasClean','reasonEmpty'}
LIFECYCLE_EVENTS=set('process-sampling-stopped process-sample-requested process-sample-completed network-service-observed network-service-missing browser-disconnected process-observation-unavailable target-crashed target-destroyed page-observed page-closed page-crashed frame-navigated frame-detached page-target socket-activity-coverage socket-activity-snapshot socket-close-frame socket-error socket-closed page-observer-ready page-observation-unavailable browser-observation-unavailable observation-unavailable provider-close-requested socket-activity-pages socket-activity-snapshot-unavailable'.split())
LIFECYCLE_EVENTS |= {'orchestrator-socket-attached','orchestrator-socket-open','orchestrator-socket-error','orchestrator-socket-close','orchestrator-socket-observation-unavailable','orchestrator-socket-page-budget-reached'}
SERVER_EVENTS=set('server-observed server-close-requested http-server-closed http-server-unavailable server-observation-unavailable server-coverage-exhausted observation-budget-exhausted'.split())
ENUMS={'socket_kind':set('tester orchestrator vitest-other other unknown'.split()),'direction':{'sent','received'},'result':{'complete','invalid','unavailable'},'reason':set('initial periodic socket-error budget provider-close browser-disconnected normalteardown'.split()),'category':set('crashed killed oom abnormal normal other going-away application protocol-or-other unobserved unknown empty handshake-canceled handshake-timeout connection-closed-before-handshake connection-reset connection-closed connection-aborted request-aborted connection-refused network-changed network-disconnected insufficient-resources timeout protocol-error'.split())}
def safe_row(row,server=False):
    import math
    assert isinstance(row,dict)
    allowed={'utc_ms','host_pid','event','server','listening','events','bytes'} if server else LIFECYCLE_KEYS
    assert set(row)<=allowed and row.get('event') in (SERVER_EVENTS if server else LIFECYCLE_EVENTS)
    if row['event']!='observation-budget-exhausted':
        assert type(row.get('utc_ms')) in (int,float) and type(row.get('host_pid')) is int
    for k,v in row.items():
        if k=='event':continue
        if isinstance(v,str):assert not server and k in ENUMS and v in ENUMS[k]
        else:assert v is None or type(v) is bool or (type(v) is int and abs(v)<=9007199254740991)

def qualify_complete(browser_rows,server_rows):
    counts=qualify(browser_rows)
    qualified_pids={r['host_pid'] for r in browser_rows if qualify([r])['qualified']>0}
    assert not any(r['event'] in {'server-coverage-exhausted','observation-budget-exhausted'} for r in server_rows)
    chains=[]
    for pid in qualified_pids:
        for server in {r.get('server') for r in server_rows if r.get('host_pid')==pid and type(r.get('server')) is int}:
            rows=[r for r in server_rows if r.get('host_pid')==pid and r.get('server')==server]
            stage=0;last=-1
            for r in rows:
                expected=['server-observed','server-close-requested','http-server-closed']
                if stage<3 and r['event']==expected[stage] and r['utc_ms']>=last and (stage!=0 or r.get('listening') is True) and (stage!=2 or r.get('listening') is False):
                    last=r['utc_ms'];stage+=1
            if stage==3:chains.append({'host_pid':pid,'server':server})
    assert counts['qualified']>0 and chains
    return {'counts':counts,'server_chains':chains}

def unique_object(pairs):
    row={}
    for key,value in pairs:
        assert key not in row, 'Duplicate JSON object key'
        row[key]=value
    return row

def reject_browser_budget(log_path):
    assert log_path.is_file() and not log_path.is_symlink()
    assert 0 < log_path.stat().st_size < 64*1024*1024
    # Inspect private bytes only; never export arbitrary log fragments.
    assert b'Web lifecycle observation stopped: byte budget reached.' not in log_path.read_bytes()

def validate_identity(identity):
    keys={'schema','host_pid','observed','qualified','stock_observed','observer_observed','client_observed','stock_candidates','observer_candidates','client_candidates','stock_imports_client','observer_imports_client','same_client','client_source_sha256','observer_source_sha256'}
    assert isinstance(identity,dict) and set(identity)==keys
    assert type(identity['schema']) is int and identity['schema']==1
    assert type(identity['host_pid']) is int and identity['host_pid']>0
    for key in ('stock_candidates','observer_candidates','client_candidates'):
        assert type(identity[key]) is int and 0<=identity[key]<=9
    for key in keys-{'schema','host_pid','client_source_sha256','observer_source_sha256','stock_candidates','observer_candidates','client_candidates'}:
        assert type(identity[key]) is bool
    import re
    for key in ('client_source_sha256','observer_source_sha256'):
        assert isinstance(identity[key],str) and re.fullmatch('[0-9a-f]{64}',identity[key])

def validate_orchestrator_rows(browser_rows):
    seen={}
    assert not any(r['event']=='orchestrator-socket-page-budget-reached' for r in browser_rows)
    for r in browser_rows:
        if r['event'] not in {'orchestrator-socket-attached','orchestrator-socket-open','orchestrator-socket-error','orchestrator-socket-close'}:continue
        expected={'utc_ms','host_pid','event','provider','page','sequence','browser_utc_ms','ready_state','code','wasClean','reasonEmpty'}
        assert set(r)==expected
        key=(r['host_pid'],r['provider'],r['page']);seen.setdefault(key,[]).append(r)
        assert len(seen[key])<=16
        assert sum(x['event']==r['event'] for x in seen[key])==1
        assert len(seen[key])==1 or seen[key][-2]['sequence']<r['sequence']
        assert all(type(r[k]) is int for k in ('utc_ms','host_pid','provider','page','sequence','browser_utc_ms','ready_state'))
        assert r['utc_ms']>=0 and r['browser_utc_ms']>=0
        assert r['host_pid']>0 and r['provider']>0 and 1<=r['page']<=64
        assert 1<=r['sequence']<=16 and 0<=r['ready_state']<=3
        assert r['code'] is None or type(r['code']) is int and 1000<=r['code']<=4999
        if r['event']=='orchestrator-socket-close':assert type(r['wasClean']) is bool and type(r['reasonEmpty']) is bool
        else:assert r['code'] is None and r['wasClean'] is None and r['reasonEmpty'] is None

def qualify_orchestrator(browser_rows,server_rows,identity):
    validate_identity(identity)
    validate_orchestrator_rows(browser_rows)
    assert all(identity[k] is True for k in ('observed','qualified','stock_observed','observer_observed','client_observed','stock_imports_client','observer_imports_client','same_client'))
    assert all(identity[k]==1 for k in ('stock_candidates','observer_candidates','client_candidates'))
    assert identity['client_source_sha256']=='204c8c2e45a41245d319420d46917899b35df470e4d0047f6cca628d475deae0'
    assert identity['observer_source_sha256']=='de3e7b28f8aed2465fea70d775aaae98871fffb036e5f13197b5f42dafbd3c5c'
    observed=[]
    for r in browser_rows:
        if r['event']=='orchestrator-socket-attached' and r['ready_state']==1 and r['host_pid']==identity['host_pid']:
            matches=[s for s in browser_rows if s.get('host_pid')==r['host_pid'] and s.get('provider')==r['provider'] and s.get('page')==r['page'] and qualify([s])['qualified']>0 and s['utc_ms']>=r['utc_ms']]
            if matches:observed.append({'host_pid':r['host_pid'],'provider':r['provider'],'page':r['page']})
    assert observed
    coverage=qualify_complete(browser_rows,server_rows)
    assert any(c['host_pid']==identity['host_pid'] for c in coverage['server_chains'])
    return {**coverage,'current_socket_attachments':observed,'module_identity':identity}

def main():
    source=Path(os.environ['RUNNER_TEMP'])/'v019-private'/'unit-browser-lifecycle'
    output=Path(os.environ['RUNNER_TEMP'])/'v019-evidence'
    output.mkdir(mode=0o700)
    record={'sourceSha':os.environ['SOURCE_SHA'],'sourceTree':os.environ['SOURCE_TREE'],'operationSha':os.environ['GITHUB_SHA'],'runId':os.environ['GITHUB_RUN_ID'],'runAttempt':int(os.environ['GITHUB_RUN_ATTEMPT']),'success':False,'scope':'Observation coverage only, not transport health or test pass'}
    try:
        all_rows={};raw_files={}
        reject_browser_budget(source.parent/'unit.raw.log')
        for name,limit in [('browser-lifecycle.jsonl',2*1024*1024),('browser-server-lifecycle.jsonl',256*1024)]:
            p=source/name
            assert p.is_file() and not p.is_symlink() and 0<p.stat().st_size<=limit
            raw=p.read_bytes();rows=[json.loads(line,object_pairs_hook=unique_object) for line in raw.decode('utf-8').splitlines() if line.strip()]
            assert rows
            for row in rows:safe_row(row,server=name=='browser-server-lifecycle.jsonl')
            raw_files[name]=raw;all_rows[name]=rows
        identity_path=source.parent/'module-identity.json'
        assert identity_path.is_file() and not identity_path.is_symlink() and 0<identity_path.stat().st_size<=4096
        identity=json.loads(identity_path.read_text(),object_pairs_hook=unique_object)
        validate_identity(identity)
        validate_orchestrator_rows(all_rows['browser-lifecycle.jsonl'])
        assert not any(r['event'] in {'server-coverage-exhausted','observation-budget-exhausted'} for r in all_rows['browser-server-lifecycle.jsonl'])
        # Both files fully validated before any raw observer bytes enter upload directory.
        for name,raw in raw_files.items():(output/name).write_bytes(raw)
        (output/'module-identity.json').write_text(json.dumps(identity)+'\n')
        record['counts']=qualify(all_rows['browser-lifecycle.jsonl'])
        record['module_identity']=identity
        record.update(qualify_orchestrator(all_rows['browser-lifecycle.jsonl'],all_rows['browser-server-lifecycle.jsonl'],identity))
        record['success']=True
    except Exception:
        record['error']='Required bounded observer coverage missing, malformed or nonpositive; original test outcome is independent'
    (output/'observer-verdict.json').write_text(json.dumps(record,indent=2)+'\n')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as output_file:output_file.write('safe_artifacts=true\n')
    return 0 if record['success'] else 1
if __name__=='__main__':sys.exit(main())

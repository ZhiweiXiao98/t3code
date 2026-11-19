"""Read-only observed-run replay guard, NOT an atomic consumed-operation ledger.
Root must independently freeze/approve operation_sha. Caller-supplied equality is
not immutable authorization. Caller must hold the workflow concurrency group
through prepare/sign. API visibility delays and listing/dispatch races remain;
this guard alone cannot prove global at-most-once signing.
"""
import re
from urllib.parse import urlencode

REPO = 'ZhiweiXiao98/t3code'
OWNER = 'ZhiweiXiao98'
OWNER_ID = 99611261
WORKFLOW_ID = 399155956
WORKFLOW_PATH = '.github/workflows/android-sign-reviewed.yml'
BRANCH = 'signing/android-bootstrap'
REF = 'refs/heads/' + BRANCH

class ReplayError(ValueError):
    pass

def need(ok, message):
    if not ok:
        raise ReplayError(message)

def identity(value):
    return type(value) is dict and value.get('login') == OWNER and type(value.get('id')) is int and value['id'] == OWNER_ID

def check_current(run, run_id, sha):
    need(type(run) is dict, 'Run response missing')
    expected = {'id':run_id, 'workflow_id':WORKFLOW_ID, 'path':WORKFLOW_PATH,
                'head_sha':sha, 'head_branch':BRANCH, 'event':'workflow_dispatch', 'run_attempt':1}
    for name,value in expected.items():
        need(type(run.get(name)) is type(value) and run[name] == value, 'Current run identity mismatch: ' + name)
    for name in ('repository','head_repository'):
        repo=run.get(name)
        need(type(repo) is dict and repo.get('full_name') == REPO and identity(repo.get('owner')), 'Current repository identity mismatch')
    need(identity(run.get('actor')) and identity(run.get('triggering_actor')), 'Owner actor required')
    need(run.get('status') == 'in_progress' and run.get('conclusion') is None, 'Current run must be active')

def guard(api, *, operation_sha, env):
    """api.json receives fixed-repository relative GET paths; errors fail closed.
    No mutation, signing, secret access, or token handling occurs here.
    """
    need(type(operation_sha) is str and re.fullmatch('[0-9a-f]{40}',operation_sha), 'Reviewed exact SHA required')
    rid=env.get('GITHUB_RUN_ID')
    need(type(rid) is str and re.fullmatch('[1-9][0-9]*',rid), 'Exact positive run ID required')
    for key,value in {'GITHUB_REPOSITORY':REPO,'GITHUB_REF':REF,'GITHUB_SHA':operation_sha,
                      'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_RUN_ATTEMPT':'1'}.items():
        need(env.get(key)==value, 'Operation environment mismatch')
    run_id=int(rid)
    try:
        current=api.json('/actions/runs/'+rid)
        check_current(current,run_id,operation_sha)
        query=urlencode({'head_sha':operation_sha,'event':'workflow_dispatch','per_page':100})
        listing=api.json('/actions/workflows/'+str(WORKFLOW_ID)+'/runs?'+query)
        need(type(listing) is dict, 'Run listing missing')
        runs=listing.get('workflow_runs'); count=listing.get('total_count')
        need(type(runs) is list and type(count) is int and count==len(runs) and 0<count<100, 'Incomplete or ambiguous run listing')
        # Do NOT filter out bad/failed/cancelled/queued records locally.
        # Any other ID or inconsistent record returned by this exact query rejects.
        need(count==1, 'Operation SHA has another dispatch run')
        check_current(runs[0],run_id,operation_sha)
        final=api.json('/actions/runs/'+rid)
        check_current(final,run_id,operation_sha)
    except ReplayError:
        raise
    except Exception:
        raise ReplayError('Replay observation unavailable or invalid') from None
    return {'observed_single_dispatch':True,'operation_sha':operation_sha,'operation_run_id':run_id,
            'atomic_consumption_guaranteed':False}

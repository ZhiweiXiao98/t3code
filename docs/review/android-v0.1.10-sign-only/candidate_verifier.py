"""Offline verifier of reviewed pins and caller-supplied GitHub REST snapshots.
No network, signing, APK execution, extraction, or authorization to activate.
A supplied snapshot's origin/freshness must be established by a separate caller.
"""
import datetime as dt
import hashlib
import json
import pathlib
import re
import stat
import zipfile

PIN_DIGEST = '9fac2c279637200f6ce8511242ccda4d3513906192b6af8a955a2444ea90afb6'
MAX_ZIP = 128 * 1024 * 1024
MAX_MEMBER = 192 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024

class VerificationError(ValueError):
    pass

def need(ok, message):
    if not ok:
        raise VerificationError(message)

def canonical_digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def validate_pins(pins):
    need(canonical_digest(pins) == PIN_DIGEST, 'Unreviewed pins')
    need(pins['enabled'] is False, 'No activation allowed')
    return pins

def timestamp(value):
    need(isinstance(value, str) and value.endswith('Z'), 'Expected UTC timestamp')
    try:
        result = dt.datetime.fromisoformat(value[:-1] + '+00:00')
    except ValueError as exc:
        raise VerificationError('Malformed timestamp') from exc
    return result

def same(actual, expected, message):
    need(type(actual) is type(expected) and actual == expected, message)

def verify_snapshot(pins, snapshot, *, now):
    """Snapshot keys: repository, run, workflow, commit, workflowFile, jobs, artifact.
    Each value is the corresponding full REST response (jobs includes total_count).
    `now` must be a caller-observed timezone-aware UTC datetime; no cached clock.
    """
    validate_pins(pins)
    need(isinstance(now, dt.datetime) and now.utcoffset() == dt.timedelta(0), 'UTC now required')
    try:
        c, a = pins['candidate'], pins['artifact']
        repo, run = snapshot['repository'], snapshot['run']
        same(repo['full_name'], pins['repository'], 'Repository')
        same(repo['private'], False, 'Public repository only')
        for key in ('repository', 'head_repository'):
            same(run[key]['full_name'], pins['repository'], 'Run repository')
        for key, value in {'id':c['runId'], 'head_sha':c['sourceSha'], 'head_branch':c['branch'],
                           'workflow_id':c['workflowId'], 'run_attempt':c['attempt'],
                           'status':'completed', 'conclusion':'success', 'run_started_at':c['runStartedAt']}.items():
            same(run[key], value, 'Run '+key)
        need(run['event'] in ('push', 'workflow_dispatch'), 'Run event')
        need(run['path'] in (c['workflowPath'], c['workflowPath']+'@'+c['branch'],
                            c['workflowPath']+'@refs/heads/'+c['branch'],c['workflowPath']+'@'+c['sourceSha']), 'Run workflow path')
        same(snapshot['workflow']['id'], c['workflowId'], 'Workflow id')
        same(snapshot['workflow']['path'], c['workflowPath'], 'Workflow path')
        same(snapshot['commit']['sha'], c['sourceSha'], 'Commit SHA')
        same(snapshot['commit']['commit']['tree']['sha'], c['sourceTree'], 'Commit tree')
        same(snapshot['workflowFile']['path'], c['workflowPath'], 'Workflow file path')
        same(snapshot['workflowFile']['sha'], c['workflowBlobSha'], 'Workflow blob')
        same(snapshot['workflowFile']['type'], 'file', 'Workflow file type')
        jobs = snapshot['jobs']['jobs']
        same(snapshot['jobs']['total_count'], 25, 'Job count')
        need(len(jobs) == len(pins['requiredJobs']) == 25, 'Exact 25 jobs')
        need(len({j['id'] for j in jobs}) == 25, 'Duplicate job id')
        expected = {j['id']:j for j in pins['requiredJobs']}
        need(set(expected) == {j['id'] for j in jobs}, 'Job IDs')
        for j in jobs:
            p = expected[j['id']]
            for key, value in {'id':p['id'],'name':p['name'],'run_id':c['runId'],
                               'head_sha':c['sourceSha'],'run_attempt':c['attempt'],
                               'status':'completed','conclusion':'success'}.items():
                same(j[key], value, 'Job '+key)
            start, end = timestamp(j['started_at']), timestamp(j['completed_at'])
            need(timestamp(c['runStartedAt']) <= start <= end <= now, 'Job time range')
        producer = next(j for j in jobs if j['id'] == a['producerJobId'])
        same(producer['run_attempt'], a['producerAttempt'], 'Producer attempt')
        same(producer['started_at'], a['producerStartedAt'], 'Producer start')
        same(producer['completed_at'], a['producerCompletedAt'], 'Producer end')
        uploads = [step for step in producer['steps'] if step['name'] == 'Run actions/upload-artifact@v7']
        need(len(uploads) == 1, 'Exact unique artifact upload step')
        upload = uploads[0]
        for key, value in {'status':'completed', 'conclusion':'success',
                           'started_at':'2026-11-18T03:35:06Z',
                           'completed_at':'2026-11-18T03:35:09Z'}.items():
            same(upload[key], value, 'Upload '+key)
        upload_start, upload_end = timestamp(upload['started_at']), timestamp(upload['completed_at'])
        need(timestamp(a['producerStartedAt']) <= upload_start <= upload_end <= timestamp(a['producerCompletedAt']), 'Upload outside producer')
        artifact = snapshot['artifact']
        for key, value in {'id':a['id'],'name':a['name'],'digest':'sha256:'+a['zipSha256'],
                           'size_in_bytes':a['zipBytes'],'expired':False,'expires_at':a['expiresAt']}.items():
            same(artifact[key], value, 'Artifact '+key)
        for key, value in {'id':c['runId'],'head_sha':c['sourceSha'],'head_branch':c['branch']}.items():
            same(artifact['workflow_run'][key], value, 'Artifact run '+key)
        created = timestamp(artifact['created_at'])
        need(timestamp(a['producerStartedAt']) <= created <= timestamp(a['producerCompletedAt']), 'Artifact outside producer')
        updated = timestamp(artifact['updated_at'])
        need(upload_start <= created <= updated <= upload_end <= timestamp(a['producerCompletedAt']), 'Artifact outside exact upload interval')
        need(updated <= now < timestamp(a['expiresAt']), 'Artifact freshness')
        return {'result':'verified_metadata_only','snapshotSha256':canonical_digest(snapshot),
                'sourceSha':c['sourceSha'],'runId':c['runId'],'attempt':c['attempt']}
    except (KeyError, TypeError, StopIteration) as exc:
        raise VerificationError('Incomplete or malformed snapshot') from exc

def verify_archive(pins, archive_path):
    """Hash ZIP and exact members without extracting or executing their contents."""
    validate_pins(pins)
    a = pins['artifact']
    path = pathlib.Path(archive_path)
    need(not path.is_symlink() and path.is_file(), 'Archive must be regular file')
    with path.open('rb') as f:
        size = 0
        h = hashlib.sha256()
        while chunk := f.read(1024*1024):
            size += len(chunk)
            need(size <= min(a['zipBytes'], MAX_ZIP), 'ZIP size bound')
            h.update(chunk)
        need(size == a['zipBytes'] and h.hexdigest() == a['zipSha256'], 'ZIP digest/size')
        f.seek(0)
        try:
            with zipfile.ZipFile(f) as z:
                entries = z.infolist()
                expected = {m['name']:m for m in a['members']}
                need(len(entries) == len(expected) == 2, 'Exact two members')
                names = [e.filename for e in entries]
                need(len(set(names)) == len(names) and set(names) == set(expected), 'ZIP member allowlist/duplicates')
                total, records = 0, []
                for e in entries:
                    need('/' not in e.filename and '\\' not in e.filename and e.filename not in ('.','..'), 'Unsafe path')
                    need(not e.is_dir() and stat.S_IFMT(e.external_attr >> 16) in (0, stat.S_IFREG), 'Nonregular member')
                    need(not e.flag_bits & 1 and e.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'Unsupported/encrypted ZIP')
                    p = expected[e.filename]
                    need(0 < e.file_size == p['bytes'] <= MAX_MEMBER, 'Member size')
                    total += e.file_size
                    need(total <= MAX_TOTAL, 'Total expansion bound')
                    mh, count = hashlib.sha256(), 0
                    with z.open(e) as src:
                        while chunk := src.read(1024*1024):
                            count += len(chunk)
                            need(count <= p['bytes'], 'Member read bound')
                            mh.update(chunk)
                    need(count == p['bytes'] and mh.hexdigest() == p['sha256'], 'Member digest/size')
                    records.append({'name':e.filename,'bytes':count,'sha256':mh.hexdigest()})
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError) as exc:
            raise VerificationError('Invalid archive') from exc
    return {'result':'verified_bytes_only','zipSha256':h.hexdigest(),'members':records,
            'apkMetadataVerified':False,'signatureVerified':False,'signingAuthorized':False}

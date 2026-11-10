"""Verify reviewed public coverage evidence without executing application code."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

REPO = 'ZhiweiXiao98/t3code'
MAX_ARCHIVE = 256 * 1024
MAX_MANIFEST = 128 * 1024
MAX_LOG = 16 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs)


def stamp(value):
    require(isinstance(value, str) and value.endswith('Z'), 'Missing UTC provenance timestamp')
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Api:
    def request(self, suffix):
        token = os.environ.get('GITHUB_TOKEN')
        headers = {'Accept': 'application/vnd.github+json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        return urllib.request.Request('https://api.github.com/repos/' + REPO + suffix, headers=headers)

    def json(self, suffix):
        with urllib.request.build_opener(NoRedirect()).open(self.request(suffix), timeout=60) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
            require(len(raw) <= 4 * 1024 * 1024, 'Oversized API response')
            return strict_json(raw)

    def download(self, artifact_id, destination):
        return self.redirect_bytes('/actions/artifacts/' + str(artifact_id) + '/zip', destination, MAX_ARCHIVE)

    def download_log(self, job_id, destination):
        return self.redirect_bytes('/actions/jobs/' + str(job_id) + '/logs', destination, MAX_LOG)

    def redirect_bytes(self, suffix, destination, maximum):
        try:
            urllib.request.build_opener(NoRedirect()).open(self.request(suffix), timeout=60)
        except urllib.error.HTTPError as error:
            require(error.code == 302, 'Artifact redirect missing')
            location = error.headers.get('Location', '')
        else:
            raise ValueError('Unexpected artifact download response')
        url = urllib.parse.urlparse(location)
        require(url.scheme == 'https' and url.hostname and any(url.hostname.endswith(s) for s in
                ('.blob.core.windows.net', '.githubusercontent.com', '.actions.githubusercontent.com')),
                'Unexpected evidence storage host')
        with urllib.request.build_opener(NoRedirect()).open(location, timeout=60) as response:
            raw = response.read(maximum + 1)
        require(len(raw) <= maximum, 'Evidence download too large')
        with open(destination, 'xb') as stream:
            stream.write(raw)


def check_pins(pins):
    source, workflow, artifact = (pins.get(k, {}) for k in ('source', 'workflow', 'artifact'))
    for obj, fields in ((source, ('sha', 'tree')), (workflow, ('sha',))):
        for key in fields:
            require(isinstance(obj.get(key), str) and re.fullmatch('[a-f0-9]{40}', obj[key]), 'Unreviewed coverage source/workflow pin')
    require(source.get('branch') == 'maintenance/v0.1.7-zh-cloud' and workflow.get('branch') == 'validation/v0.1.7-coverage-' + source['sha'][:12], 'Coverage branch pin mismatch')
    require(workflow.get('path') == '.github/workflows/client-coverage.yml', 'Coverage workflow path mismatch')
    for obj, fields in ((source, ('baseline_run_id', 'baseline_run_attempt')), (workflow, ('run_id', 'run_attempt')), (artifact, ('id', 'size', 'producer_job_id'))):
        for key in fields:
            require(type(obj.get(key)) is int and obj[key] > 0, 'Unreviewed coverage numeric pin')
    require(artifact['size'] <= MAX_ARCHIVE and artifact.get('name') == 'supplemental-coverage-proof', 'Coverage artifact pin mismatch')
    for key in ('sha256', 'manifest_sha256', 'producer_log_sha256'):
        require(isinstance(artifact.get(key), str) and re.fullmatch('[a-f0-9]{64}', artifact[key]), 'Unreviewed coverage digest pin')
    reports = pins.get('raw_reports')
    require(type(reports) is dict and set(reports) == {'linux-node26', 'linux-node24', 'windows-uninstall', 'linux-nushell', 'windows-shared'}, 'Missing raw coverage report pins')
    for lane, report in reports.items():
        require(report.get('name') == 'supplemental-report-' + lane and report.get('member') == 'coverage-result.json' and report.get('upload_step_name') == 'Preserve raw test report', 'Raw report identity pin mismatch')
        for key in ('id', 'size', 'producer_job_id'):
            require(type(report.get(key)) is int and report[key] > 0, 'Unreviewed raw report numeric pin')
        require(report['size'] <= MAX_ARCHIVE, 'Raw report archive too large')
        for key in ('sha256', 'member_sha256', 'producer_log_sha256'):
            require(isinstance(report.get(key), str) and re.fullmatch('[a-f0-9]{64}', report[key]), 'Unreviewed raw report digest pin')
    require(artifact.get('upload_step_name') == 'Upload supplemental coverage proof', 'Final proof upload step pin mismatch')
    names = pins.get('required_jobs')
    require(isinstance(names, list) and len(names) == 6 and len(set(names)) == 6 and set(names) == {
        'Supplemental Linux Node 26', 'Supplemental Linux Node 24', 'Supplemental Windows uninstall', 'Supplemental Linux Nushell', 'Supplemental Windows shared', 'Collect supplemental coverage proof'}, 'Coverage gate names mismatch')


def current_state(api, pins):
    w, a = pins['workflow'], pins['artifact']
    run = api.json('/actions/runs/' + str(w['run_id']))
    require(all(run.get(k) == v for k, v in {'id': w['run_id'], 'run_attempt': w['run_attempt'], 'head_sha': w['sha'], 'head_branch': w['branch'], 'path': w['path'], 'status': 'completed', 'conclusion': 'success'}.items()), 'Coverage run provenance/status mismatch')
    require(run.get('event') == 'push' and run.get('repository', {}).get('full_name') == REPO and run.get('repository', {}).get('private') is False and run.get('head_repository', {}).get('full_name') == REPO, 'Coverage repository/event mismatch')
    jobs = []
    for page in range(1, 11):
        data = api.json('/actions/runs/' + str(w['run_id']) + '/attempts/' + str(w['run_attempt']) + '/jobs?per_page=100&page=' + str(page))
        jobs.extend(data.get('jobs', []))
        if len(jobs) >= data.get('total_count', -1):
            require(len(jobs) == data.get('total_count'), 'Coverage jobs pagination mismatch')
            break
    else:
        raise ValueError('Coverage jobs exceeded page limit')
    require(len(jobs) == len(pins['required_jobs']) and {j.get('name') for j in jobs} == set(pins['required_jobs']), 'Coverage gates missing/duplicated')
    require(all(j.get('status') == 'completed' and j.get('conclusion') == 'success' and j.get('run_id') == w['run_id'] and j.get('run_attempt') == w['run_attempt'] and j.get('head_sha') == w['sha'] and j.get('head_branch') == w['branch'] for j in jobs), 'Coverage gate provenance/status mismatch')
    latest = api.json('/actions/runs/' + str(w['run_id']) + '/jobs?filter=latest&per_page=100')
    require(latest.get('total_count') == len(jobs) and sorted(latest.get('jobs', []), key=lambda j: j['id']) == sorted(jobs, key=lambda j: j['id']), 'Coverage latest jobs changed')
    workflow = api.json('/actions/workflows/' + str(run.get('workflow_id')))
    require(workflow.get('id') == run.get('workflow_id') and workflow.get('path') == w['path'], 'Coverage workflow identity mismatch')
    source = pins['source']
    require(api.json('/git/ref/heads/' + source['branch']).get('object', {}).get('sha') == source['sha'], 'Coverage application branch moved')
    require(api.json('/git/commits/' + source['sha']).get('tree', {}).get('sha') == source['tree'], 'Coverage application tree mismatch')
    producers = [j for j in jobs if j.get('id') == a['producer_job_id'] and j.get('name') == 'Collect supplemental coverage proof']
    require(len(producers) == 1, 'Coverage producer mismatch')
    producer = producers[0]
    artifact = api.json('/actions/artifacts/' + str(a['id']))
    require(artifact.get('id') == a['id'] and artifact.get('name') == a['name'] and artifact.get('size_in_bytes') == a['size'] and artifact.get('digest') == 'sha256:' + a['sha256'] and artifact.get('expired') is False, 'Coverage artifact binding mismatch')
    require(all(artifact.get('workflow_run', {}).get(k) == v for k, v in {'id': w['run_id'], 'head_sha': w['sha'], 'head_branch': w['branch']}.items()), 'Coverage artifact source mismatch')
    require(stamp(artifact.get('expires_at')) > datetime.now(timezone.utc), 'Coverage artifact expired by timestamp')
    created, updated = stamp(artifact.get('created_at')), stamp(artifact.get('updated_at'))
    require(stamp(producer.get('started_at')) <= created <= updated <= stamp(producer.get('completed_at')), 'Coverage artifact outside producer interval')
    uploads = [s for s in producer.get('steps', []) if s.get('name') == a.get('upload_step_name')]
    require(len(uploads) == 1 and uploads[0].get('status') == 'completed' and uploads[0].get('conclusion') == 'success' and stamp(uploads[0].get('started_at')) <= created <= updated <= stamp(uploads[0].get('completed_at')), 'Coverage artifact outside successful upload')
    require(api.json('/git/ref/heads/' + w['branch']).get('object', {}).get('sha') == w['sha'], 'Coverage operation branch moved')
    comparison = api.json('/compare/' + source['sha'] + '...' + w['sha'])
    require(comparison.get('status') == 'ahead' and comparison.get('merge_base_commit', {}).get('sha') == source['sha'] and len(comparison.get('files', [])) == 1 and comparison['files'][0].get('filename') == w['path'] and comparison['files'][0].get('status') == 'added', 'Coverage operation changed application source or ancestry')
    raw_artifacts = {lane: report_metadata(api, pin, pins['workflow'], jobs) for lane, pin in pins['raw_reports'].items()}
    # Compare provenance, not unrelated mutable repository telemetry such as star counts.
    def select(obj, fields):
        return {key: obj.get(key) for key in fields.split()}
    return {'run': select(run, 'id run_attempt head_sha head_branch path workflow_id status conclusion event run_started_at created_at updated_at'),
            'jobs': [select(j, 'id name run_id run_attempt head_sha head_branch status conclusion started_at completed_at steps labels') for j in sorted(jobs, key=lambda j: j['id'])],
            'artifact': select(artifact, 'id name size_in_bytes digest expired expires_at created_at updated_at workflow_run'),
            'workflow': select(workflow, 'id path state'), 'raw_artifacts': raw_artifacts}


def report_metadata(api, pin, workflow, jobs):
    artifact = api.json('/actions/artifacts/' + str(pin['id']))
    require(artifact.get('id') == pin['id'] and artifact.get('name') == pin['name'] and artifact.get('size_in_bytes') == pin['size'] and artifact.get('digest') == 'sha256:' + pin['sha256'] and artifact.get('expired') is False and stamp(artifact.get('expires_at')) > datetime.now(timezone.utc), 'Raw report artifact binding mismatch')
    require(all(artifact.get('workflow_run', {}).get(k) == v for k,v in {'id':workflow['run_id'],'head_sha':workflow['sha'],'head_branch':workflow['branch']}.items()), 'Raw report workflow mismatch')
    producers = [j for j in jobs if j.get('id') == pin['producer_job_id']]
    require(len(producers) == 1 and producers[0].get('name') == pin['job_name'], 'Raw report producer mismatch')
    producer = producers[0]
    created, updated = stamp(artifact.get('created_at')), stamp(artifact.get('updated_at'))
    require(stamp(producer.get('started_at')) <= created <= updated <= stamp(producer.get('completed_at')), 'Raw report outside producer interval')
    uploads = [step for step in producer.get('steps',[]) if step.get('name') == pin['upload_step_name']]
    require(len(uploads) == 1 and uploads[0].get('status') == 'completed' and uploads[0].get('conclusion') == 'success' and stamp(uploads[0].get('started_at')) <= created <= updated <= stamp(uploads[0].get('completed_at')), 'Raw report outside successful upload')
    return artifact


def verify_upload_log(api, pin, jobs, folder):
    producer = next(j for j in jobs if j['id'] == pin['producer_job_id'])
    step = next(s for s in producer['steps'] if s['name'] == pin['upload_step_name'])
    path = Path(folder) / ('job-' + str(pin['producer_job_id']) + '.log')
    if not path.exists():
        api.download_log(pin['producer_job_id'], path)
    raw = path.read_bytes()
    require(len(raw) <= MAX_LOG and hashlib.sha256(raw).hexdigest() == pin['producer_log_sha256'], 'Producer log digest mismatch')
    log = raw.decode('utf-8')
    required = ['SHA256 digest of uploaded artifact is ' + pin['sha256'],
                'Artifact ' + pin['name'] + ' successfully finalized. Artifact ID ' + str(pin['id']),
                'Artifact ' + pin['name'] + ' has been successfully uploaded! Final size is ' + str(pin['size']) + ' bytes. Artifact ID is ' + str(pin['id'])]
    for text in required:
        lines = [line for line in log.splitlines() if line.endswith(text)]
        require(len(lines) == 1, 'Missing or duplicate upload-log binding')
        timestamp = lines[0].split(' ',1)[0]
        # GitHub step metadata has second precision; log lines retain fractional seconds.
        at = stamp(timestamp).replace(microsecond=0)
        require(stamp(step['started_at']) <= at <= stamp(step['completed_at']), 'Upload-log record outside successful upload interval')


def read_archive(api, pin, member, member_hash, folder):
    path = Path(folder) / ('artifact-' + str(pin['id']) + '.zip')
    api.download(pin['id'], path)
    require(path.stat().st_size == pin['size'] <= MAX_ARCHIVE and hashlib.sha256(path.read_bytes()).hexdigest() == pin['sha256'], 'Raw report archive size/digest mismatch')
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        require(len(entries) == 1 and entries[0].filename == member and not entries[0].is_dir() and (entries[0].external_attr >> 16) & 0o170000 in (0,0o100000) and not(entries[0].flag_bits & 1) and 0 < entries[0].file_size <= MAX_MANIFEST, 'Unsafe raw report archive')
        require(archive.testzip() is None, 'Raw report ZIP integrity failure')
        raw = archive.read(entries[0])
    require(hashlib.sha256(raw).hexdigest() == member_hash, 'Raw report member digest mismatch')
    return strict_json(raw.decode('utf-8'))


def check_raw_report(report, lane):
    require(report.get('success') is True and report.get('numFailedTestSuites') == 0, 'Raw report unsuccessful')
    files = report.get('testResults')
    require(type(files) is list and len(files) == len(lane['files']), 'Raw report file count mismatch')
    expected = {f['path']:f for f in lane['files']}
    total, passed, skipped = 0, 0, 0
    for file in files:
        name = file.get('name','').replace(chr(92),'/')
        paths = [path for path in expected if name.endswith('/' + path)]
        require(len(paths) == 1 and file.get('status') == 'passed' and not file.get('message'), 'Raw report source file/status mismatch')
        reviewed = expected.pop(paths[0])
        assertions = file.get('assertionResults')
        require(type(assertions) is list and len(assertions) == len(reviewed['assertions']), 'Raw assertion count mismatch')
        titles = {a['title']:a['status'] for a in reviewed['assertions']}
        for assertion in assertions:
            title = assertion.get('title')
            require(title in titles, 'Raw named assertion missing or duplicate')
            expected_status = titles.pop(title)
            status = assertion.get('status')
            if expected_status == 'skipped' and status == 'pending':
                status = 'skipped'
            require(status == expected_status and assertion.get('failureMessages') == [], 'Raw named assertion/status mismatch')
            total += 1
            passed += status == 'passed'
            skipped += status == 'skipped'
        require(not titles, 'Missing raw named assertion')
    require(not expected, 'Missing raw source file')
    for field,value in {'numTotalTests':total,'numPassedTests':passed,'numFailedTests':0,'numPendingTests':skipped,'numTodoTests':0}.items():
        require(type(report.get(field)) is int and report[field] == value, 'Raw report total mismatch')


def verify(pins, api=None, validator=None):
    check_pins(pins)
    if api is None:
        api = Api()
    if validator is None:
        from validate_coverage_manifest import validate_manifest
        validator = validate_manifest
    metadata = current_state(api, pins)
    with tempfile.TemporaryDirectory(prefix='reviewed-coverage-') as folder:
        path = Path(folder) / 'proof.zip'
        api.download(pins['artifact']['id'], path)
        require(path.stat().st_size == pins['artifact']['size'] <= MAX_ARCHIVE, 'Coverage archive size mismatch')
        raw = path.read_bytes()
        require(hashlib.sha256(raw).hexdigest() == pins['artifact']['sha256'], 'Coverage archive digest mismatch')
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            require(len(members) == 1 and members[0].filename == 'coverage-manifest.json' and not members[0].is_dir() and (members[0].external_attr >> 16) & 0o170000 in (0, 0o100000) and not (members[0].flag_bits & 1) and 0 < members[0].file_size <= MAX_MANIFEST, 'Unexpected coverage archive entries')
            require(archive.testzip() is None, 'Coverage ZIP integrity failure')
            report = archive.read(members[0])
        require(hashlib.sha256(report).hexdigest() == pins['artifact']['manifest_sha256'], 'Coverage manifest digest mismatch')
        manifest = strict_json(report.decode('utf-8'))
        validator(manifest, pins)
        verify_upload_log(api, pins['artifact'], metadata['jobs'], folder)
        for lane in manifest['lanes']:
            pin = pins['raw_reports'][lane['lane']]
            require(pin['job_name'] == lane['job_name'], 'Raw report lane binding mismatch')
            raw_report = read_archive(api, pin, pin['member'], pin['member_sha256'], folder)
            check_raw_report(raw_report, lane)
            verify_upload_log(api, pin, metadata['jobs'], folder)
    require(current_state(api, pins) == metadata, 'Coverage evidence changed during verification')
    return {'workflow': pins['workflow'], 'artifact': pins['artifact'], 'source': pins['source'], 'raw_reports': pins['raw_reports'], 'verified_state': metadata}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pins', required=True)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    proof = verify(strict_json(Path(args.pins).read_text()))
    print(json.dumps(proof, sort_keys=True) if args.json else 'Verified exact supplemental named assertions and immutable provenance')


if __name__ == '__main__':
    main()

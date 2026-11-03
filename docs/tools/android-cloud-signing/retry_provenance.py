"""Fail-closed, same-run retry provenance. No signing or GitHub mutations.

Trust boundary: only authenticated GitHub job-log bytes, fetched by job ID by the
caller, may be passed to producer_receipt. A caller-supplied receipt is not proof.
The reviewed workflow blob, immutable source commit and resolved upload-action
SHA bind the log to reviewed code; timestamps ONLY delimit its known upload step.
"""
import base64
import hashlib
import json
import re
from datetime import datetime, timezone

REPO = 'ZhiweiXiao98/t3code'
BRANCH = 'maintenance/v0.1.6-zh-cloud'
WORKFLOW = '.github/workflows/client-release.yml'
UPLOAD_REF = 'actions/upload-artifact@v7'
UPLOAD_SHA = 'cf430e030ddbb5b0abf93d22962f4752f3646cd9'
ANDROID_JOB = 'Android arm64 unsigned candidate (NOT installable)'
ARTIFACT_NAME = 'android-UNSIGNED-NOT-INSTALLABLE'
# Only observed old unexpanded matrix placeholders may be listed here. Unknown
# names fail closed; never derive a whitelist from untrusted jobs in an input.
OLD_MATRIX_PLACEHOLDERS = frozenset({'Clean macOS ${{ matrix.arch }} ${{ matrix.format }} first start', 'Clean desktop ${{ matrix.kind }} first start'})
RUN_FIELDS = ('id', 'run_attempt', 'head_sha', 'head_branch', 'path', 'workflow_id',
              'event', 'status', 'conclusion', 'run_started_at', 'updated_at')
JOB_FIELDS = ('id', 'run_id', 'run_attempt', 'head_sha', 'head_branch', 'labels', 'name', 'status', 'conclusion',
              'started_at', 'completed_at', 'runner_id')
STEP_FIELDS = ('name', 'number', 'status', 'conclusion', 'started_at', 'completed_at')
ARTIFACT_FIELDS = ('id', 'name', 'size_in_bytes', 'digest', 'expired', 'created_at', 'updated_at', 'expires_at')


def require(ok, message):
    if not ok:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def project(value, fields):
    return {field: value.get(field) for field in fields}


def job_view(job):
    return {**project(job, JOB_FIELDS), 'api_metadata_sha256': sha256(canonical(job)), 'steps': [project(s, STEP_FIELDS) for s in job.get('steps', [])]}


def check_identity(run, m, attempt, current=False):
    require(type(run.get('id')) is int and type(run.get('run_attempt')) is int and type(run.get('workflow_id')) is int, 'Invalid run identity types')
    require(run.get('id') == m['candidate_run_id'] and run.get('run_attempt') == attempt, 'Run/attempt mismatch')
    require(run.get('head_sha') == m['candidate_source_sha'] and run.get('head_branch') == BRANCH, 'Source/ref mismatch')
    require(run.get('path') == WORKFLOW and run.get('workflow_id') == m['candidate_workflow_id'], 'Workflow identity mismatch')
    require(run.get('event') == 'push', 'Workflow/event mismatch')
    require(run.get('repository', {}).get('full_name') == REPO and run.get('head_repository', {}).get('full_name') == REPO, 'Candidate repository mismatch')
    require(run.get('status') == 'completed', 'Candidate attempt not completed')
    if current:
        require(run.get('conclusion') == 'success', 'Candidate current run not successful')


def workflow_view(data, m):
    require(data.get('type') == 'file' and data.get('path') == WORKFLOW and data.get('encoding') == 'base64', 'Workflow content response mismatch')
    raw = base64.b64decode(data['content'].replace('\n', ''), validate=True)
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    require(blob == data.get('sha') == m['candidate_workflow_blob_sha'] and sha256(raw) == m['candidate_workflow_sha256'], 'Reviewed workflow blob changed')
    return {'path': WORKFLOW, 'blob_sha': blob, 'sha256': sha256(raw)}


def collect_snapshot(api, m, expected_jobs):
    prefix = '/actions/runs/' + str(m['candidate_run_id'])
    initial = api.json(prefix)
    check_identity(initial, m, m['candidate_attempt'], current=True)
    branch = api.json('/git/ref/heads/' + BRANCH)
    require(branch.get('object', {}).get('type') == 'commit' and branch['object'].get('sha') == m['candidate_source_sha'], 'Candidate HEAD drift')
    wf = workflow_view(api.json('/contents/' + WORKFLOW + '?ref=' + m['candidate_source_sha']), m)
    attempts, latest, all_ids, raw_jobs = [], {}, set(), []
    latest_api, executions, aliases, node_ids = {}, {}, [], set()
    for attempt in range(1, m['candidate_attempt'] + 1):
        run = api.json(prefix + '/attempts/' + str(attempt))
        check_identity(run, m, attempt, current=attempt == m['candidate_attempt'])
        require(run['event'] == initial['event'], 'Retry event changed')
        page = api.json(prefix + '/attempts/' + str(attempt) + '/jobs?per_page=100')
        jobs = page.get('jobs')
        require(isinstance(jobs, list) and 0 < len(jobs) <= 100 and page.get('total_count') == len(jobs), 'Attempt jobs missing/truncated')
        names, views = set(), []
        for job in jobs:
            require(type(job.get('id')) is int and job['id'] > 0 and job['id'] not in all_ids, 'Duplicate/invalid execution ID')
            all_ids.add(job['id'])
            raw_jobs.append(job)
            validate_job_record(job)
            require(job['node_id'] not in node_ids, 'Duplicate job node ID')
            node_ids.add(job['node_id'])
            require(job.get('run_id') == m['candidate_run_id'] and job.get('run_attempt') == attempt and job.get('head_sha') == m['candidate_source_sha'] and job.get('head_branch') == BRANCH, 'Job run/SHA/attempt mismatch')
            name = job.get('name')
            require(name not in names, 'Duplicate job in attempt')
            names.add(name)
            require(isinstance(job.get('steps'), list), 'Missing job steps')
            if name not in expected_jobs:
                require(name in OLD_MATRIX_PLACEHOLDERS and attempt < m['candidate_attempt'] and job.get('status') == 'completed' and job.get('conclusion') == 'skipped' and job.get('steps') == [] and job.get('runner_id') is None and job.get('runner_name') is None and job.get('labels') == [] and job.get('started_at') == job.get('completed_at'), 'Unknown job (not an observed old skipped matrix placeholder)')
            else:
                previous = latest_api.get(name)
                execution, alias = resolve_execution(job, previous, executions, run)
                if alias is not None:
                    aliases.append(alias)
                executions[job['id']] = execution
                latest_api[name] = job
                latest[name] = job_view(execution)
            views.append(job_view(job))
        if attempt == m['candidate_attempt']:
            require(names == set(expected_jobs) and len(jobs) == 22, 'Current attempt must contain all 22 API gate records')
        attempts.append({'run': project(run, RUN_FIELDS), 'jobs': sorted(views, key=lambda j: j['id'])})
    require(set(latest) == set(expected_jobs) and len(latest) == 22, 'Expected exactly all 22 release gates')
    require(all(j['status'] == 'completed' and j['conclusion'] == 'success' for j in latest.values()), 'Latest execution of a release gate did not succeed')
    aliases.sort(key=lambda a: (a['alias_run_attempt'], a['alias_job_id']))
    check_needs(latest)
    retry_evidence = check_retry_authorizations(api, m, raw_jobs, latest)
    # Detect rerun/branch races across pagination and the multiple requests above.
    final = api.json(prefix)
    require(project(final, RUN_FIELDS) == project(initial, RUN_FIELDS), 'Candidate snapshot race')
    require(api.json('/git/ref/heads/' + BRANCH) == branch, 'Candidate HEAD snapshot race')
    return {'schema': 'same-run-latest-gates/v2', 'run': project(initial, RUN_FIELDS),
            'workflow': wf, 'attempts': attempts, 'retry_evidence': retry_evidence, 'job_aliases': aliases, 'latest_api_jobs': [job_view(latest_api[n]) for n in sorted(latest_api)], 'latest_jobs': [latest[n] for n in sorted(latest)]}


def dependencies():
    source = 'Validate exact source'
    quality = ['Lint and typecheck', 'Rust native formatting and tests', 'Mobile native static analysis'] + ['Tests (' + x + ')' for x in ('clients', 'web', 'server-1', 'server-2', 'server-3')]
    bundle = 'Build validated desktop bundle'
    linux = 'Linux x64 and embedded Windows WSL runtime'
    desktop = ['Desktop ' + x + ' (integrity checked)' for x in ('win x64', 'mac arm64', 'mac x64')]
    result = {source: [], **{x: [source] for x in quality}, bundle: [source] + quality,
              linux: [source, bundle], ANDROID_JOB: [source] + quality + [bundle],
              **{x: [source, bundle, linux] for x in desktop}}
    result.update({'Clean macOS ' + arch + ' ' + fmt + ' first start': [source] + desktop
                   for arch in ('arm64', 'x64') for fmt in ('dmg', 'zip')})
    result.update({'Clean desktop ' + kind + ' first start': [source, linux] + desktop
                   for kind in ('deb', 'appimage', 'nsis')})
    return result


def check_needs(latest):
    dag = dependencies()
    require(set(dag) == set(latest), 'Unexpected workflow DAG')
    for name, job in latest.items():
        start, end = instant(job['started_at']), instant(job['completed_at'])
        require(start <= end and type(job['runner_id']) is int and job['runner_id'] > 0 and job['steps'], 'Gate has no real execution')
        require(len({s['number'] for s in job['steps']}) == len(job['steps']), 'Duplicate step number')
        for dep in dag[name]:
            require(latest[dep]['run_attempt'] <= job['run_attempt'] and start >= instant(latest[dep]['completed_at']), 'Stale downstream gate after newer dependency execution')


def artifact_view(artifact, m):
    require(artifact.get('id') == m['candidate_artifact_id'] and artifact.get('expired') is False and artifact.get('name') == ARTIFACT_NAME, 'Candidate artifact identity/expiry mismatch')
    require(artifact.get('digest') == 'sha256:' + m['candidate_artifact_zip_sha256'], 'Candidate artifact digest mismatch')
    wr = artifact.get('workflow_run', {})
    require(wr.get('id') == m['candidate_run_id'] and wr.get('head_sha') == m['candidate_source_sha'] and wr.get('head_branch') == BRANCH, 'Candidate artifact run/source mismatch')
    require(type(artifact.get('size_in_bytes')) is int and artifact['size_in_bytes'] > 0, 'Candidate artifact size missing')
    require(instant(artifact.get('expires_at')) > datetime.now(timezone.utc), 'Candidate artifact expired by timestamp')
    return {**project(artifact, ARTIFACT_FIELDS), 'workflow_run': project(wr, ('id', 'head_sha', 'head_branch'))}


def instant(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z', value), 'Invalid evidence timestamp')
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def producer_receipt(log_bytes, snapshot, artifact, m):
    latest = {j['name']: j for j in snapshot['latest_jobs']}
    job = latest[ANDROID_JOB]
    require(job['id'] == m['candidate_producer_job_id'] and job['run_attempt'] == m['candidate_producer_attempt'], 'Artifact producer is not latest Android execution')
    steps = [s for s in job['steps'] if s['name'] == 'Run ' + UPLOAD_REF]
    require(len(steps) == 1, 'Android must have one known upload step')
    step = steps[0]
    require(step['status'] == 'completed' and step['conclusion'] == 'success', 'Upload step not successful')
    start, end = instant(step['started_at']), instant(step['completed_at'])
    require(start <= end, 'Upload step invalid interval')
    # The GitHub API omits subsecond resolution. Use [start, end + 1s), and
    # require the runner's exact action-group and complete upload receipt too.
    from datetime import timedelta
    lines = []
    for line in log_bytes.decode('utf-8-sig', errors='strict').splitlines():
        match = re.fullmatch(r'(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z) (.*)', line)
        if match:
            lines.append((instant(match[1]), match[2]))
    require(lines and all(lines[i][0] <= lines[i + 1][0] for i in range(len(lines) - 1)), 'Incomplete/unordered job log')
    setup = "Download action repository '" + UPLOAD_REF + "' (SHA:" + UPLOAD_SHA + ')'
    setup_steps = [s for s in job['steps'] if s['name'] == 'Set up job' and s['status'] == 'completed' and s['conclusion'] == 'success']
    require(len(setup_steps) == 1, 'Unique successful setup step missing')
    setup_start, setup_end = instant(setup_steps[0]['started_at']), instant(setup_steps[0]['completed_at']) + timedelta(seconds=1)
    require(sum(text == setup for at, text in lines) == 1 and any(text == setup and setup_start <= at < setup_end for at, text in lines), 'Resolved upload action is not from setup step')
    marker = '##[group]Run ' + UPLOAD_REF
    starts = [i for i, (at, text) in enumerate(lines) if start <= at < end + timedelta(seconds=1) and text == marker]
    require(len(starts) == 1, 'Upload step action boundary missing/ambiguous')
    begin = starts[0]
    following = next((i for i in range(begin + 1, len(lines)) if lines[i][1].startswith('##[group]')), len(lines))
    segment = lines[begin:following]
    body = [text for at, text in segment]
    require(body.count('  name: ' + ARTIFACT_NAME) == 1, 'Upload artifact name missing/ambiguous')
    group_end = body.index('##[endgroup]') if '##[endgroup]' in body else -1
    require(group_end > 0 and body.count('##[endgroup]') == 1, 'Upload action input group unclosed/ambiguous')
    for required in ('  name: ' + ARTIFACT_NAME, '  overwrite: false', '  if-no-files-found: error', '  archive: true'):
        require(required in body[:group_end], 'Upload action safety input mismatch')
    require(start <= instant(artifact.get('created_at')) <= instant(artifact.get('updated_at')) < end + timedelta(seconds=1), 'Artifact metadata outside official upload step')
    artifact_id = str(artifact['id'])
    expected = [
        'Uploading artifact: ' + ARTIFACT_NAME + '.zip',
        'Finished uploading artifact content to blob storage!',
        'SHA256 digest of uploaded artifact is ' + m['candidate_artifact_zip_sha256'],
        'Finalizing artifact upload',
        'Artifact ' + ARTIFACT_NAME + ' successfully finalized. Artifact ID ' + artifact_id,
        'Artifact ' + ARTIFACT_NAME + ' has been successfully uploaded! Final size is ' + str(artifact['size_in_bytes']) + ' bytes. Artifact ID is ' + artifact_id,
        'Artifact download URL: https://github.com/' + REPO + '/actions/runs/' + str(m['candidate_run_id']) + '/artifacts/' + artifact_id,
    ]
    pos = group_end
    for text in expected:
        require(body.count(text) == 1 and body.index(text) > pos, 'Missing/ambiguous/out-of-order upload receipt')
        pos = body.index(text)
        require(start <= segment[pos][0] < end + timedelta(seconds=1), 'Receipt outside official upload step')
    # Reject injected/mixed receipts and nested fake action groups within output.
    output = body[group_end + 1:]
    require(not any(t.startswith('##[group]') or t == '##[endgroup]' for t in output), 'Forged upload action boundary')
    require(sum(t.startswith('SHA256 digest of uploaded artifact') for t in output) == 1 and sum(t.startswith('Artifact download URL:') for t in output) == 1 and sum('Artifact ID' in t for t in output) == 2 and sum(t.startswith('Artifact ') and 'successfully finalized.' in t for t in output) == 1 and sum(t.startswith('Artifact ') and 'has been successfully uploaded!' in t for t in output) == 1, 'Mixed artifact upload receipt')
    return {'schema': 'github-upload-artifact-job-log/v1', 'run_id': m['candidate_run_id'],
            'run_attempt': job['run_attempt'], 'job_id': job['id'], 'job_name': job['name'],
            'step_number': step['number'], 'step_name': step['name'],
            'step_started_at': step['started_at'], 'step_completed_at': step['completed_at'],
            'log_sha256': sha256(log_bytes), 'artifact_id': artifact['id'],
            'artifact_name': artifact['name'], 'artifact_digest': artifact['digest'],
            'artifact_size_in_bytes': artifact['size_in_bytes'],
            'upload_action_ref': UPLOAD_REF, 'upload_action_sha': UPLOAD_SHA}


def check_prepared(proof, m, expected_jobs):
    """Check the prepared public handoff before signing Secrets are consumed."""
    snapshot, receipt = proof['candidate_gates_snapshot'], proof['producer_job_receipt']
    check_alias_log_proofs(proof)
    require(sha256(canonical(snapshot)) == proof['candidate_gates_sha256'] and sha256(canonical(receipt)) == proof['producer_job_receipt_sha256'], 'Reviewed provenance receipt changed')
    require(snapshot.get('schema') == 'same-run-latest-gates/v2', 'Prepared snapshot schema mismatch')
    run = snapshot['run']
    require(run.get('id') == m['candidate_run_id'] and run.get('run_attempt') == m['candidate_attempt'] and run.get('head_sha') == m['candidate_source_sha'] and run.get('head_branch') == BRANCH and run.get('workflow_id') == m['candidate_workflow_id'] and run.get('path') == WORKFLOW and run.get('event') == 'push' and run.get('status') == 'completed' and run.get('conclusion') == 'success', 'Prepared run binding mismatch')
    require(snapshot['workflow'] == {'path': WORKFLOW, 'blob_sha': m['candidate_workflow_blob_sha'], 'sha256': m['candidate_workflow_sha256']}, 'Prepared workflow mismatch')
    latest = {j['name']: j for j in snapshot['latest_jobs']}
    require(len(snapshot['latest_jobs']) == 22 and set(latest) == set(expected_jobs) and all(j['status'] == 'completed' and j['conclusion'] == 'success' for j in latest.values()), 'Prepared gates not successful')
    check_needs(latest)
    retry_evidence = snapshot.get('retry_evidence')
    require(isinstance(retry_evidence, list), 'Prepared infrastructure retry evidence missing')
    records = {x['authorization']['job_id']: x for x in retry_evidence}
    historical = [j for attempt in snapshot['attempts'] for j in attempt['jobs'] if j['name'] in latest and j['id'] != latest[j['name']]['id'] and not (j['status'] == 'completed' and j['conclusion'] == 'success')]
    require(len(records) == len(retry_evidence) and set(records) == {j['id'] for j in historical}, 'Prepared infrastructure retry evidence mismatch')
    for job in historical:
        require(sha256(canonical(records[job['id']]['job_metadata'])) == job['api_metadata_sha256'], 'Prepared historical job metadata mismatch')
    class EvidenceApi:
        def json(self, path):
            matches = [x['capacity_annotations'] for x in retry_evidence if x['annotations_endpoint'] == path]
            require(len(matches) == 1, 'Prepared annotation endpoint mismatch')
            return matches[0]
    require(check_retry_authorizations(EvidenceApi(), m, [x['job_metadata'] for x in retry_evidence], latest) == retry_evidence, 'Prepared retry authorization changed')
    artifact = artifact_view(proof['candidate_artifact_metadata'], m)
    job = latest[ANDROID_JOB]
    require(job['id'] == m['candidate_producer_job_id'] and job['run_attempt'] == m['candidate_producer_attempt'], 'Prepared producer job mismatch')
    steps = [s for s in job['steps'] if s['name'] == 'Run ' + UPLOAD_REF]
    require(len(steps) == 1 and steps[0]['status'] == 'completed' and steps[0]['conclusion'] == 'success', 'Prepared upload step mismatch')
    step = steps[0]
    expected = {'schema': 'github-upload-artifact-job-log/v1', 'run_id': m['candidate_run_id'],
                'run_attempt': m['candidate_producer_attempt'], 'job_id': m['candidate_producer_job_id'], 'job_name': ANDROID_JOB,
                'step_number': step['number'], 'step_name': step['name'], 'step_started_at': step['started_at'], 'step_completed_at': step['completed_at'],
                'log_sha256': proof['candidate_producer_log_sha256'], 'artifact_id': artifact['id'], 'artifact_name': artifact['name'], 'artifact_digest': artifact['digest'],
                'artifact_size_in_bytes': artifact['size_in_bytes'], 'upload_action_ref': UPLOAD_REF, 'upload_action_sha': UPLOAD_SHA}
    require(re.fullmatch('[a-f0-9]{64}', expected['log_sha256']) and receipt == expected, 'Prepared producer receipt binding mismatch')


# Authentic public annotations for the reviewed never-acquired ARM job.
CAPACITY_MESSAGE = 'The job was not acquired by Runner of type hosted even after multiple attempts'
CAPACITY_NOTICE = 'Due to capacity constraints, jobs targeting macOS arm64 runners may experience longer queue times.'


def check_retry_authorizations(api, m, raw_jobs, latest):
    reviewed = m.get('candidate_retry_authorizations')
    require(isinstance(reviewed, list), 'Explicit infrastructure retry authorizations required')
    fields = {'job_id', 'run_attempt', 'job_name', 'job_snapshot_sha256', 'capacity_annotations_sha256'}
    require(all(isinstance(a, dict) and set(a) == fields for a in reviewed), 'Retry authorization schema mismatch')
    indexed = {a['job_id']: a for a in reviewed}
    require(len(indexed) == len(reviewed), 'Duplicate retry authorization')
    replaced = [j for j in raw_jobs if j['name'] in latest and j['id'] != latest[j['name']]['id'] and not (j.get('status') == 'completed' and j.get('conclusion') == 'success')]
    require(set(indexed) == {j['id'] for j in replaced}, 'Non-successful execution override not explicitly authorized')
    evidence = []
    for job in sorted(replaced, key=lambda j: j['id']):
        authorization = indexed[job['id']]
        require(job.get('status') == 'completed' and job.get('conclusion') == 'cancelled' and type(job.get('runner_id')) is int and job['runner_id'] == 0 and job.get('steps') == [], 'Only never-started infrastructure cancellations may be retried')
        require(authorization['run_attempt'] == job['run_attempt'] and authorization['job_name'] == job['name'] and authorization['job_snapshot_sha256'] == sha256(canonical(job)), 'Reviewed cancelled execution metadata changed')
        annotations = api.json('/check-runs/' + str(job['id']) + '/annotations?per_page=100')
        require(isinstance(annotations, list) and 0 < len(annotations) < 100, 'Capacity annotations missing/truncated')
        require(sha256(canonical(annotations)) == authorization['capacity_annotations_sha256'], 'Reviewed capacity annotation changed')
        require(sum(a.get('annotation_level') == 'failure' and a.get('message') == CAPACITY_MESSAGE for a in annotations) == 1 and any(a.get('annotation_level') == 'notice' and a.get('message') == CAPACITY_NOTICE for a in annotations), 'Known hosted capacity cancellation evidence missing')
        require(all((a.get('annotation_level'), a.get('message')) in {('failure', CAPACITY_MESSAGE), ('notice', CAPACITY_NOTICE)} and a.get('path') == '.github' and a.get('blob_href') == 'https://github.com/' + REPO + '/blob/' + m['candidate_source_sha'] + '/.github' and a.get('raw_details') == '' for a in annotations), 'Unreviewed capacity annotation')
        evidence.append({'authorization': authorization, 'job_metadata': job, 'capacity_annotations': annotations, 'annotations_endpoint': '/check-runs/' + str(job['id']) + '/annotations?per_page=100'})
    return evidence


def check_anchor(api, m, snapshot):
    require(project(api.json('/actions/runs/' + str(m['candidate_run_id'])), RUN_FIELDS) == snapshot['run'], 'Final run snapshot race')
    branch = api.json('/git/ref/heads/' + BRANCH)
    require(branch.get('object', {}).get('type') == 'commit' and branch['object'].get('sha') == m['candidate_source_sha'], 'Final HEAD snapshot race')


# Only identity changes observed and independently reviewed in real attempt 2.
ALIAS_IDENTITY_FIELDS = frozenset({'id', 'node_id', 'url', 'check_run_url', 'html_url', 'run_attempt', 'created_at', 'runner_group_id'})


def canonical_job_urls(job):
    require(isinstance(job.get('node_id'), str) and bool(job['node_id']), 'Missing job node identity')
    base = 'https://api.github.com/repos/' + REPO
    require(job.get('url') == base + '/actions/jobs/' + str(job['id']) and
            job.get('check_run_url') == base + '/check-runs/' + str(job['id']) and
            job.get('html_url') == 'https://github.com/' + REPO + '/actions/runs/' + str(job['run_id']) + '/job/' + str(job['id']), 'Noncanonical job identity URL')


def resolve_execution(job, previous, executions, attempt_run):
    canonical_job_urls(job)
    began = instant(attempt_run['run_started_at'])
    start = instant(job['started_at'])
    if start >= began:
        return job, None
    # A pre-attempt execution timestamp is NOT enough to admit an alias.
    require(previous is not None and previous['run_attempt'] == job['run_attempt'] - 1, 'Alias has no immediately preceding attempt record')
    canonical_job_urls(previous)
    require(job['status'] == previous['status'] == 'completed' and job['conclusion'] == previous['conclusion'] == 'success' and job['runner_id'] > 0 and job['steps'], 'Alias cannot bypass a later non-successful execution')
    require(set(job) == set(previous) and ALIAS_IDENTITY_FIELDS <= set(job), 'Alias metadata key set changed')
    require({k: v for k, v in job.items() if k not in ALIAS_IDENTITY_FIELDS} == {k: v for k, v in previous.items() if k not in ALIAS_IDENTITY_FIELDS}, 'Alias non-identity metadata changed')
    require(job['id'] != previous['id'] and job['node_id'] != previous['node_id'], 'Alias identity was not new')
    execution = executions[previous['id']]
    same_execution_payload = {k: v for k, v in execution.items() if k not in ALIAS_IDENTITY_FIELDS} == {k: v for k, v in job.items() if k not in ALIAS_IDENTITY_FIELDS}
    continuation = (previous['runner_group_id'] is None and execution['id'] != previous['id'] and
                    execution['run_attempt'] < previous['run_attempt'] and same_execution_payload)
    require(job['runner_group_id'] is None and ((type(previous['runner_group_id']) is int and previous['runner_group_id'] == 0) or continuation), 'Unreviewed alias runner group transition')
    require(instant(job['created_at']) >= began and instant(job['completed_at']) < began, 'Alias creation/execution interval mismatch')
    execution = executions[previous['id']]
    alias = {'schema': 'github-actions-carried-forward-job/v1', 'job_name': job['name'],
             'alias_job_id': job['id'], 'alias_run_attempt': job['run_attempt'],
             'previous_job_id': previous['id'], 'previous_run_attempt': previous['run_attempt'],
             'execution_job_id': execution['id'], 'execution_run_attempt': execution['run_attempt'],
             'alias_metadata_sha256': sha256(canonical(job)), 'previous_metadata_sha256': sha256(canonical(previous)),
             'execution_metadata_sha256': sha256(canonical(execution))}
    return execution, alias


def verify_alias_logs(api, snapshot):
    # Cache is owned by the authenticated transport, keyed by immutable job ID.
    proofs = []
    for alias in snapshot['job_aliases']:
        original = api.job_log(alias['execution_job_id'])
        previous = api.job_log(alias['previous_job_id'])
        carried = api.job_log(alias['alias_job_id'])
        require(original and original == previous == carried, 'Alias raw job logs differ or are missing')
        proofs.append({'alias_job_id': alias['alias_job_id'], 'alias_run_attempt': alias['alias_run_attempt'],
                       'execution_job_id': alias['execution_job_id'], 'execution_run_attempt': alias['execution_run_attempt'],
                       'log_sha256': sha256(original)})
    return proofs


def check_alias_log_proofs(proof):
    aliases = proof['candidate_gates_snapshot']['job_aliases']
    logs = proof['alias_log_proofs']
    require(isinstance(logs, list) and len(logs) == len(aliases), 'Incomplete alias log proof coverage')
    require(sha256(canonical(logs)) == proof['alias_log_proofs_sha256'], 'Alias log proof hash changed')
    root_hashes = {}
    for alias, record in zip(aliases, logs):
        expected = {k: alias[k] for k in ('alias_job_id', 'alias_run_attempt', 'execution_job_id', 'execution_run_attempt')}
        require(set(record) == set(expected) | {'log_sha256'} and all(record[k] == v for k, v in expected.items()) and isinstance(record['log_sha256'], str) and re.fullmatch('[a-f0-9]{64}', record['log_sha256']), 'Alias log proof mapping changed')
        root = record['execution_job_id']
        require(root not in root_hashes or root_hashes[root] == record['log_sha256'], 'Conflicting log hashes for one actual execution')
        root_hashes[root] = record['log_sha256']
        if alias['job_name'] == ANDROID_JOB:
            require(record['execution_job_id'] == proof['candidate_producer_job_id'] and record['execution_run_attempt'] == proof['candidate_producer_attempt'] and record['log_sha256'] == proof['producer_job_receipt']['log_sha256'], 'Producer alias log chain mismatch')


FULL_JOB_FIELDS = frozenset({'check_run_url', 'completed_at', 'conclusion', 'created_at', 'head_branch', 'head_sha', 'html_url', 'id', 'labels', 'name', 'node_id', 'run_attempt', 'run_id', 'run_url', 'runner_group_id', 'runner_group_name', 'runner_id', 'runner_name', 'started_at', 'status', 'steps', 'url', 'workflow_name'})


def validate_job_record(job):
    require(set(job) == FULL_JOB_FIELDS, 'Unknown/missing job metadata field')
    require(type(job['run_id']) is int and type(job['run_attempt']) is int and job['run_attempt'] > 0, 'Invalid job run identity types')
    canonical_job_urls(job)
    require(job['run_url'] == 'https://api.github.com/repos/' + REPO + '/actions/runs/' + str(job['run_id']), 'Noncanonical job run URL')
    start, end = instant(job['started_at']), instant(job['completed_at'])
    require(start <= end, 'Invalid actual execution interval')
    require(isinstance(job['steps'], list), 'Missing actual step records')
    for step in job['steps']:
        require(set(step) == set(STEP_FIELDS), 'Unknown/missing step metadata field')
        if step['started_at'] is None or step['completed_at'] is None:
            require(step['started_at'] is None and step['completed_at'] is None and step['conclusion'] == 'skipped', 'Non-skipped step has no execution interval')
        else:
            require(start <= instant(step['started_at']) <= instant(step['completed_at']) <= end, 'Step outside actual job execution interval')

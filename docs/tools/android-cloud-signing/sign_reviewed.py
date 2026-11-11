"""Sign only the exact reviewed unsigned Android artifact. Never publish or generate keys."""
import argparse
import base64
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import verify_supplemental

REPO = 'ZhiweiXiao98/t3code'
BRANCH = 'maintenance/v0.1.8-zh-cloud'
SOURCE_SHA = '3270444c64826f67c953c2816dd1fd8f10d87953'
SOURCE_TREE = '4eb59e49773d95fc7be03f51f6a3493f343864f6'
CANDIDATE_RUN = 42994944772
CANDIDATE_ATTEMPT = 1
ANDROID_JOB = 'Android arm64 unsigned candidate (NOT installable)'
RECOVERY_RUN = 40649758501
RECOVERY_ARTIFACT = 12799615493
RECOVERY_ZIP_SHA256 = 'b2c345e3b7566e2c6cd3efa8be8213b464f1c3a04497967c96228d3797769fdd'
CERT = '82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88'
KEY_HASH = '7e4922f7de02c1c739e627eb3ef87fa1fb639329ed27613dff8b4f0fdad2d397'
APK_NAME = 'T3-Code-zh-CN-Android-0.1.8-zh.1-arm64-v8a.apk'
UNSIGNED_APK_NAME = 'T3-Code-zh-CN-Android-0.1.8-zh.1-arm64-UNSIGNED-NOT-INSTALLABLE.apk'
JOBS = set(['Android arm64 unsigned candidate (NOT installable)', 'Build validated desktop bundle', 'Clean desktop appimage Debian 13 guest (Ubuntu 24.04 host) first start', 'Clean desktop deb first start', 'Clean desktop nsis first start', 'Clean macOS arm64 dmg first start', 'Clean macOS arm64 zip first start', 'Clean macOS x64 dmg first start', 'Clean macOS x64 zip first start', 'Desktop mac arm64 (integrity checked)', 'Desktop mac x64 (integrity checked)', 'Desktop win x64 (integrity checked)', 'Lint and typecheck', 'Linux x64 and embedded Windows WSL runtime', 'Mobile native static analysis', 'Rust native formatting and tests', 'Tests (clients)', 'Tests (server-1)', 'Tests (server-2)', 'Tests (server-3)', 'Tests (web)', 'Validate exact source'])


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def copy_limited(source, target, maximum):
    require(type(maximum) is int and maximum > 0, 'Invalid reviewed download limit')
    total = 0
    while True:
        block = source.read(min(1024 * 1024, maximum - total + 1))
        if not block:
            return total
        total += len(block)
        require(total <= maximum, 'Artifact exceeds reviewed download limit')
        target.write(block)


def read_input(path):
    manifest = json.loads(Path(path).read_text())
    require(manifest.get('enabled') is True, 'Signing input disabled; no signing permitted')
    supplemental_pins()
    for field in ('candidate_run_id', 'candidate_attempt', 'candidate_artifact_id', 'candidate_producer_job_id', 'candidate_producer_attempt', 'candidate_unsigned_apk_size', 'candidate_artifact_zip_size'):
        require(type(manifest.get(field)) is int and manifest[field] > 0, 'Missing reviewed numeric input')
    for field, length in (('candidate_source_sha', 40), ('candidate_artifact_zip_sha256', 64), ('candidate_unsigned_apk_sha256', 64), ('candidate_source_tree_sha', 40)):
        require(isinstance(manifest.get(field), str) and re.fullmatch('[a-f0-9]{' + str(length) + '}', manifest[field]), 'Missing reviewed digest input')
    require(manifest['candidate_run_id'] == CANDIDATE_RUN and
            manifest['candidate_attempt'] == CANDIDATE_ATTEMPT and
            manifest['candidate_source_sha'] == SOURCE_SHA and
            manifest['candidate_source_tree_sha'] == SOURCE_TREE,
            'Input is not this exact reviewed v0.1.8 candidate')
    require(manifest['candidate_producer_attempt'] <= manifest['candidate_attempt'], 'Producer attempt is in the future')
    return manifest


def supplemental_pins():
    pins = json.loads(Path(__file__).with_name('supplemental-pin.json').read_text())
    verify_supplemental.check_pins(pins)
    require(pins['source'] == {'sha': SOURCE_SHA, 'tree': SOURCE_TREE, 'branch': BRANCH,
                              'baseline_run_id': CANDIDATE_RUN, 'baseline_run_attempt': CANDIDATE_ATTEMPT},
            'Supplemental application binding mismatch')
    return pins


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Api:
    def __init__(self):
        self.token = os.environ.get('GITHUB_TOKEN', '')
        require(bool(self.token), 'Read-only Actions token required')

    def request(self, suffix):
        return urllib.request.Request('https://api.github.com/repos/' + REPO + suffix,
                                      headers={'Authorization': 'Bearer ' + self.token,
                                               'Accept': 'application/vnd.github+json'})

    def json(self, suffix):
        with urllib.request.urlopen(self.request(suffix), timeout=60) as response:
            return json.load(response)

    def download(self, artifact_id, destination, maximum):
        # Do not forward GitHub Authorization to signed object-storage URLs.
        try:
            urllib.request.build_opener(NoRedirect()).open(self.request('/actions/artifacts/' + str(artifact_id) + '/zip'), timeout=60)
        except urllib.error.HTTPError as error:
            require(error.code == 302, 'Artifact redirect missing')
            location = error.headers.get('Location', '')
        else:
            raise ValueError('Unexpected artifact download response')
        url = urllib.parse.urlparse(location)
        require(url.scheme == 'https' and url.hostname and
                (url.hostname.endswith('.blob.core.windows.net') or url.hostname.endswith('.githubusercontent.com') or url.hostname.endswith('.actions.githubusercontent.com')),
                'Unexpected artifact storage host')
        with urllib.request.urlopen(location, timeout=120) as response, open(destination, 'xb') as out:
            copy_limited(response, out, maximum)


def check_run(run, manifest):
    require(run.get('id') == manifest['candidate_run_id'] and run.get('run_attempt') == manifest['candidate_attempt'], 'Run/attempt mismatch')
    require(run.get('head_sha') == manifest['candidate_source_sha'] and run.get('head_branch') == BRANCH, 'Source/ref mismatch')
    require(run.get('path') == '.github/workflows/client-release.yml' and run.get('event') in ('push', 'workflow_dispatch'), 'Workflow/event mismatch')
    require(run.get('repository', {}).get('full_name') == REPO and run.get('status') == 'completed' and run.get('conclusion') == 'success', 'Candidate run not successful')
    require(run.get('head_repository', {}).get('full_name') == REPO, 'Candidate source repository mismatch')
    require(run.get('head_commit', {}).get('tree_id') == manifest['candidate_source_tree_sha'], 'Candidate source tree mismatch')
    require(run.get('repository', {}).get('private') is False, 'Standard hosted runner requires public repository')


def check_jobs(jobs, manifest):
    require(len(jobs) == 22 and {x.get('name') for x in jobs} == JOBS, 'Expected exactly all 22 release gates')
    require(all(x.get('status') == 'completed' and x.get('conclusion') == 'success' for x in jobs), 'A release gate did not succeed')
    require(all(x.get('run_id') == manifest['candidate_run_id'] and
                x.get('run_attempt') == manifest['candidate_attempt'] and
                x.get('head_sha') == manifest['candidate_source_sha'] for x in jobs), 'Release job source/attempt mismatch')


def stamp(value):
    require(isinstance(value, str) and value.endswith('Z'), 'Missing UTC provenance timestamp')
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def check_artifact_producer(artifact, jobs, original, manifest):
    latest = [x for x in jobs if x.get('name') == ANDROID_JOB]
    require(len(latest) == 1, 'Android producing gate must be unique')
    latest = latest[0]
    require(original.get('id') == manifest['candidate_producer_job_id'] and
            original.get('run_id') == manifest['candidate_run_id'] and
            original.get('run_attempt') == manifest['candidate_producer_attempt'] and
            original.get('head_sha') == manifest['candidate_source_sha'] and
            original.get('head_branch') == BRANCH and original.get('name') == ANDROID_JOB and
            original.get('status') == 'completed' and original.get('conclusion') == 'success',
            'Original Android producing job mismatch')
    require(all(original.get(k) == latest.get(k) == manifest['candidate_producer_' + k]
                for k in ('started_at', 'completed_at')), 'Retained Android producing interval changed')
    # A rerun retains successful artifacts and their original execution timestamps.
    start, end = stamp(original['started_at']), stamp(original['completed_at'])
    created, updated = stamp(artifact.get('created_at')), stamp(artifact.get('updated_at'))
    require(start <= created <= updated <= end, 'Artifact outside successful producing job interval')
    uploads = [x for x in original.get('steps', []) if x.get('name') == 'Run actions/upload-artifact@v7']
    require(len(uploads) == 1 and uploads[0].get('status') == 'completed' and
            uploads[0].get('conclusion') == 'success' and
            stamp(uploads[0].get('started_at')) <= created <= updated <= stamp(uploads[0].get('completed_at')),
            'Artifact outside original successful upload step')
    require(latest.get('steps') == original.get('steps'), 'Retained producing steps changed')
    return {'original_job_id': original['id'], 'original_attempt': original['run_attempt'],
            'latest_job_id': latest['id'], 'latest_attempt': latest['run_attempt'],
            'started_at': original['started_at'], 'completed_at': original['completed_at'],
            'artifact_created_at': artifact['created_at'], 'artifact_updated_at': artifact['updated_at']}



def safe_members(archive):
    seen = set()
    files = []
    for item in archive.infolist():
        path = PurePosixPath(item.filename)
        require(not path.is_absolute() and '..' not in path.parts and '\\' not in item.filename and item.filename not in seen, 'Unsafe/duplicate ZIP path')
        seen.add(item.filename)
        require((item.external_attr >> 16) & 0o170000 != 0o120000, 'ZIP symlink rejected')
        require(item.file_size <= 512 * 1024 * 1024, 'ZIP member too large')
        if not item.is_dir():
            files.append(item)
    return files


def tools():
    root = Path(os.environ['ANDROID_HOME']) / 'build-tools' / '36.0.0'
    for executable in ('aapt2', 'zipalign', 'apksigner'):
        require((root / executable).is_file(), 'Fixed Android build-tools 36.0.0 missing; stop')
    return root


def run(command):
    result = subprocess.run([str(x) for x in command], capture_output=True, text=True)
    require(result.returncode == 0, 'Reviewed APK tool validation failed; no command output exposed')
    return result.stdout + '\n' + result.stderr


def check_badging(text):
    require("package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000415' versionName='0.1.8-zh.1'" in text, 'APK package/version mismatch')
    natives = re.findall(r'^native-code:\s*(.*)$', text, re.M)
    require(natives == ["'arm64-v8a'"], 'APK must contain exactly arm64-v8a native code')


def check_unsigned(apk, tool, process=None):
    if process is None:
        process = subprocess.run
    result = process([str(tool / 'apksigner'), 'verify', '--verbose', str(apk)],
                     capture_output=True, text=True)
    require(result.returncode == 1 and 'DOES NOT VERIFY' in result.stdout + result.stderr,
            'Candidate must fail APK signature verification as unsigned')


def candidate_entry(archive):
    members = safe_members(archive)
    require(sum(x.file_size for x in members) <= 600 * 1024 * 1024, 'Candidate ZIP too large')
    require(archive.testzip() is None, 'Candidate ZIP integrity failure')
    apks = [x for x in members if x.filename.endswith('.apk')]
    require(len(apks) == 1 and apks[0].filename == UNSIGNED_APK_NAME and
            {x.filename for x in members} == {UNSIGNED_APK_NAME, 'SIGNING-BLOCKER.txt'} and len(members) == 2,
            'Unexpected candidate ZIP entries or APK filename')
    return apks[0]


def check_recovery_artifact(artifact):
    require(artifact.get('expired') is False and artifact.get('id') == RECOVERY_ARTIFACT and
            artifact.get('name') == 'android-public-recovery-evidence-' + str(RECOVERY_RUN) and
            artifact.get('digest') == 'sha256:' + RECOVERY_ZIP_SHA256,
            'Public recovery evidence binding mismatch')


def current_candidate(api, manifest):
    supplemental = verify_supplemental.verify(supplemental_pins())
    run_data = api.json('/actions/runs/' + str(manifest['candidate_run_id']))
    check_run(run_data, manifest)
    jobs = api.json('/actions/runs/' + str(manifest['candidate_run_id']) + '/attempts/' + str(manifest['candidate_attempt']) + '/jobs?per_page=100')
    require(jobs.get('total_count') == 22, 'Release gate pagination/count mismatch')
    check_jobs(jobs['jobs'], manifest)
    require(api.json('/git/ref/heads/' + BRANCH).get('object', {}).get('sha') == manifest['candidate_source_sha'],
            'Candidate branch moved after review')
    return {**jobs, 'supplemental_coverage': supplemental}


def prepare(input_path, workspace):
    manifest = read_input(input_path)
    out = Path(workspace)
    out.mkdir(mode=0o700, exist_ok=False)
    api = Api()
    jobs = current_candidate(api, manifest)
    recovery = api.json('/actions/runs/' + str(RECOVERY_RUN))
    require(recovery.get('status') == 'completed' and recovery.get('conclusion') == 'success' and
            recovery.get('head_branch') == 'signing/android-bootstrap' and
            recovery.get('head_sha') == '8fc8b21abd2380926242fc49e7f488cb4b3aa0b8' and
            recovery.get('repository', {}).get('full_name') == REPO and
            recovery.get('path') == '.github/workflows/android-signing-recovery.yml', 'Required fixed recovery run is not successful')
    artifacts = api.json('/actions/runs/' + str(RECOVERY_RUN) + '/artifacts?per_page=100')
    matches = [x for x in artifacts.get('artifacts', []) if x['name'] == 'android-public-recovery-evidence-' + str(RECOVERY_RUN)]
    require(len(matches) == 1, 'Public recovery evidence must be unique')
    check_recovery_artifact(matches[0])
    evidence_zip = out / 'recovery.zip'
    api.download(matches[0]['id'], evidence_zip, 128 * 1024)
    require(digest(evidence_zip) == RECOVERY_ZIP_SHA256, 'Recovery artifact digest mismatch')
    with zipfile.ZipFile(evidence_zip) as archive:
        members = safe_members(archive)
        require(len(members) == 1 and members[0].filename == 'recovery-report.json', 'Unexpected recovery ZIP content')
        require(archive.testzip() is None, 'Recovery ZIP integrity failure')
        report = json.loads(archive.read(members[0]))
    require(report.get('certificate_sha256') == CERT and report.get('encrypted_container_sha256') == KEY_HASH and
            report.get('imported_backup_private_key_recovery_verified') is True, 'Recovery identity proof mismatch')
    artifact = api.json('/actions/artifacts/' + str(manifest['candidate_artifact_id']))
    require(artifact.get('id') == manifest['candidate_artifact_id'] and artifact.get('expired') is False and artifact.get('name') == 'android-UNSIGNED-NOT-INSTALLABLE' and
            artifact.get('workflow_run', {}).get('id') == manifest['candidate_run_id'] and
            artifact.get('workflow_run', {}).get('head_sha') == manifest['candidate_source_sha'] and
            artifact.get('workflow_run', {}).get('head_branch') == BRANCH, 'Candidate artifact binding mismatch')
    require(stamp(artifact.get('expires_at')) > datetime.now(timezone.utc), 'Candidate artifact expired by timestamp')
    original_jobs = api.json('/actions/runs/' + str(manifest['candidate_run_id']) + '/attempts/' +
                             str(manifest['candidate_producer_attempt']) + '/jobs?per_page=100')
    require(original_jobs.get('total_count') == len(original_jobs.get('jobs', [])) < 100, 'Original job pagination mismatch')
    originals = [x for x in original_jobs['jobs'] if x.get('id') == manifest['candidate_producer_job_id']]
    require(len(originals) == 1, 'Original producer job missing or duplicate')
    producer = check_artifact_producer(artifact, jobs['jobs'], originals[0], manifest)
    archive_path = out / 'candidate.zip'
    api.download(manifest['candidate_artifact_id'], archive_path, manifest['candidate_artifact_zip_size'])
    require(archive_path.stat().st_size == artifact.get('size_in_bytes') == manifest['candidate_artifact_zip_size'], 'Candidate archive size mismatch')
    require(digest(archive_path) == manifest['candidate_artifact_zip_sha256'] and artifact.get('digest') == 'sha256:' + manifest['candidate_artifact_zip_sha256'], 'Candidate artifact ZIP digest mismatch')
    unsigned = out / 'reviewed-unsigned.apk'
    with zipfile.ZipFile(archive_path) as archive:
        entry = candidate_entry(archive)
        with archive.open(entry) as source, open(unsigned, 'xb') as target:
            while True:
                block = source.read(1024 * 1024)
                if not block:
                    break
                target.write(block)
    require(unsigned.stat().st_size == manifest['candidate_unsigned_apk_size'] and
            digest(unsigned) == manifest['candidate_unsigned_apk_sha256'], 'Reviewed APK bytes mismatch')
    with zipfile.ZipFile(unsigned) as archive:
        members = safe_members(archive)
        require(sum(x.file_size for x in members) <= 600 * 1024 * 1024, 'APK contents too large')
        require(archive.testzip() is None, 'APK ZIP integrity failure')
        require({x.filename.split('/')[1] for x in members if x.filename.startswith('lib/') and x.filename.endswith('.so')} == {'arm64-v8a'},
                'APK library architecture mismatch')
    check_badging(run([tools() / 'aapt2', 'dump', 'badging', unsigned]))
    check_unsigned(unsigned, tools())
    # Recheck after downloads and APK inspection, immediately before the secret-bearing step.
    jobs = current_candidate(api, manifest)
    fresh_artifact = api.json('/actions/artifacts/' + str(manifest['candidate_artifact_id']))
    require(fresh_artifact == artifact and fresh_artifact.get('expired') is False,
            'Candidate artifact changed during inspection')
    require(stamp(fresh_artifact.get('expires_at')) > datetime.now(timezone.utc), 'Candidate artifact expired during inspection')
    fresh_original_jobs = api.json('/actions/runs/' + str(manifest['candidate_run_id']) + '/attempts/' +
                                  str(manifest['candidate_producer_attempt']) + '/jobs?per_page=100')
    require(fresh_original_jobs.get('total_count') == len(fresh_original_jobs.get('jobs', [])) < 100,
            'Fresh producer pagination mismatch')
    fresh_originals = [x for x in fresh_original_jobs['jobs'] if x.get('id') == manifest['candidate_producer_job_id']]
    require(len(fresh_originals) == 1 and fresh_originals[0] == originals[0],
            'Candidate original producer changed during inspection')
    producer = check_artifact_producer(fresh_artifact, jobs['jobs'], fresh_originals[0], manifest)
    proof = {**manifest, 'unsigned_apk_sha256': digest(unsigned), 'recovery_run_id': RECOVERY_RUN,
             'certificate_sha256': CERT, 'encrypted_container_sha256': KEY_HASH,
             'candidate_apk_zip_entry': entry.filename, 'producer': producer,
             'supplemental_coverage': jobs['supplemental_coverage'],
             'validated_release_jobs': [{'id': x['id'], 'name': x['name'], 'run_attempt': x['run_attempt'],
                                         'started_at': x['started_at'], 'completed_at': x['completed_at']}
                                        for x in jobs['jobs']]}
    (out / 'reviewed-provenance.json').write_text(json.dumps(proof, indent=2) + '\n')
    for path in (evidence_zip, archive_path):
        path.unlink()


def sign(input_path, workspace, destination):
    manifest = read_input(input_path)
    work = Path(workspace)
    proof = json.loads((work / 'reviewed-provenance.json').read_text())
    require(all(proof.get(k) == v for k, v in manifest.items()) and proof.get('certificate_sha256') == CERT and proof.get('recovery_run_id') == RECOVERY_RUN, 'Reviewed manifest changed')
    unsigned = work / 'reviewed-unsigned.apk'
    require(digest(unsigned) == proof['unsigned_apk_sha256'] == manifest['candidate_unsigned_apk_sha256'] and
            unsigned.stat().st_size == manifest['candidate_unsigned_apk_size'], 'Reviewed APK changed')
    encoded = os.environ.get('ANDROID_KEYSTORE_BASE64', '').strip()
    password = os.environ.get('ANDROID_KEYSTORE_PASSWORD', '')
    require(encoded and len(encoded) <= 48000 and 32 <= len(password) <= 256, 'Signing Secrets missing')
    data = base64.b64decode(encoded, validate=True)
    require(hashlib.sha256(data).hexdigest() == KEY_HASH, 'Fixed signing identity container mismatch')
    key = work / 'signing-only.p12'
    out = Path(destination)
    out.mkdir(mode=0o700, exist_ok=False)
    aligned = work / 'aligned.apk'
    signed = out / APK_NAME
    try:
        with os.fdopen(os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as stream:
            stream.write(data)
        tool = tools()
        run([tool / 'zipalign', '-P', '16', '-f', '4', unsigned, aligned])
        run([tool / 'apksigner', 'sign', '--ks', key, '--ks-key-alias', 't3code-release',
             '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD', '--key-pass', 'env:ANDROID_KEYSTORE_PASSWORD',
             '--out', signed, aligned])
        verification = run([tool / 'apksigner', 'verify', '--verbose', '--print-certs', signed])
        certs = re.findall(r'^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]+)\s*$', verification, re.M)
        require([x.lower() for x in certs] == [CERT], 'Signed APK certificate mismatch')
        run([tool / 'zipalign', '-c', '-P', '16', '4', signed])
        check_badging(run([tool / 'aapt2', 'dump', 'badging', signed]))
        proof.update({'signed_apk_sha256': digest(signed), 'apk_signature_verified': True,
                      'source_sha': manifest['candidate_source_sha'],
                      'candidate_artifact_sha256': manifest['candidate_artifact_zip_sha256'],
                      'package_name': 'com.zhiweixiao.t3code.zhcn', 'version_name': '0.1.8-zh.1', 'version_code': 1000415})
        (out / 'BUILD-PROVENANCE.json').write_text(json.dumps(proof, indent=2) + '\n')
        (out / 'SHA256SUMS.txt').write_text(digest(signed) + '  ' + APK_NAME + '\n' + digest(out / 'BUILD-PROVENANCE.json') + '  BUILD-PROVENANCE.json\n')
    finally:
        key.unlink(missing_ok=True)
        aligned.unlink(missing_ok=True)
    # Only explicit three outputs are eligible for upload by the workflow.


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('prepare', 'sign'))
    parser.add_argument('--input', required=True)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--output')
    args = parser.parse_args()
    try:
        if args.operation == 'prepare':
            prepare(args.input, args.workspace)
        else:
            require(bool(args.output), 'Output directory required')
            sign(args.input, args.workspace, args.output)
    except Exception:
        raise SystemExit('Reviewed APK operation failed closed. No publication or key replacement performed.') from None
    print('Reviewed APK ' + args.operation + ' completed; no release publication performed.')



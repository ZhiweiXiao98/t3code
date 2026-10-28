"""Sign only the exact reviewed unsigned Android artifact. Never publish or generate keys."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = 'ZhiweiXiao98/t3code'
BRANCH = 'maintenance/v0.1.3-zh-cloud'
RECOVERY_RUN = 40649758501
RECOVERY_ARTIFACT = 12799615493
RECOVERY_ZIP_SHA256 = 'b2c345e3b7566e2c6cd3efa8be8213b464f1c3a04497967c96228d3797769fdd'
CERT = '82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88'
KEY_HASH = '7e4922f7de02c1c739e627eb3ef87fa1fb639329ed27613dff8b4f0fdad2d397'
APK_NAME = 'T3-Code-zh-CN-Android-0.1.3-zh.1-arm64-v8a.apk'
UNSIGNED_APK_NAME = 'T3-Code-zh-CN-Android-0.1.3-zh.1-arm64-UNSIGNED-NOT-INSTALLABLE.apk'
JOBS = {'Validate exact source', 'Lint and typecheck', 'Rust native formatting and tests',
        'Mobile native static analysis', 'Build validated desktop bundle',
        'Linux x64 and embedded Windows WSL runtime',
        'Android arm64 unsigned candidate (NOT installable)',
        'Desktop win x64 (unsigned)', 'Desktop mac arm64 (unsigned)', 'Desktop mac x64 (unsigned)',
        *{'Tests (' + x + ')' for x in ('clients', 'web', 'server-1', 'server-2', 'server-3')}}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def read_input(path):
    manifest = json.loads(Path(path).read_text())
    require(manifest.get('enabled') is True, 'Signing input disabled; no signing permitted')
    for field in ('candidate_run_id', 'candidate_attempt', 'candidate_artifact_id'):
        require(type(manifest.get(field)) is int and manifest[field] > 0, 'Missing reviewed numeric input')
    for field, length in (('candidate_source_sha', 40), ('candidate_artifact_zip_sha256', 64)):
        require(isinstance(manifest.get(field), str) and re.fullmatch('[a-f0-9]{' + str(length) + '}', manifest[field]), 'Missing reviewed digest input')
    return manifest


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

    def download(self, artifact_id, destination):
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
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                out.write(block)


def check_run(run, manifest):
    require(run.get('id') == manifest['candidate_run_id'] and run.get('run_attempt') == manifest['candidate_attempt'], 'Run/attempt mismatch')
    require(run.get('head_sha') == manifest['candidate_source_sha'] and run.get('head_branch') == BRANCH, 'Source/ref mismatch')
    require(run.get('path') == '.github/workflows/client-release.yml' and run.get('event') in ('push', 'workflow_dispatch'), 'Workflow/event mismatch')
    require(run.get('repository', {}).get('full_name') == REPO and run.get('status') == 'completed' and run.get('conclusion') == 'success', 'Candidate run not successful')
    require(run.get('head_repository', {}).get('full_name') == REPO, 'Candidate source repository mismatch')


def check_jobs(jobs):
    require(len(jobs) == 15 and {x.get('name') for x in jobs} == JOBS, 'Expected exactly all 15 release gates')
    require(all(x.get('status') == 'completed' and x.get('conclusion') == 'success' for x in jobs), 'A release gate did not succeed')


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
    require("package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000411' versionName='0.1.3-zh.1'" in text, 'APK package/version mismatch')
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
            all(x.filename in (UNSIGNED_APK_NAME, 'SIGNING-BLOCKER.txt') for x in members),
            'Unexpected candidate ZIP entries or APK filename')
    return apks[0]


def check_recovery_artifact(artifact):
    require(artifact.get('expired') is False and artifact.get('id') == RECOVERY_ARTIFACT and
            artifact.get('name') == 'android-public-recovery-evidence-' + str(RECOVERY_RUN) and
            artifact.get('digest') == 'sha256:' + RECOVERY_ZIP_SHA256,
            'Public recovery evidence binding mismatch')


def prepare(input_path, workspace):
    manifest = read_input(input_path)
    out = Path(workspace)
    out.mkdir(mode=0o700, exist_ok=False)
    api = Api()
    run_data = api.json('/actions/runs/' + str(manifest['candidate_run_id']))
    check_run(run_data, manifest)
    jobs = api.json('/actions/runs/' + str(manifest['candidate_run_id']) + '/attempts/' + str(manifest['candidate_attempt']) + '/jobs?per_page=100')
    require(jobs.get('total_count') == 15, 'Release gate pagination/count mismatch')
    check_jobs(jobs['jobs'])
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
    api.download(matches[0]['id'], evidence_zip)
    require(digest(evidence_zip) == RECOVERY_ZIP_SHA256, 'Recovery artifact digest mismatch')
    with zipfile.ZipFile(evidence_zip) as archive:
        members = safe_members(archive)
        require(len(members) == 1 and members[0].filename == 'recovery-report.json', 'Unexpected recovery ZIP content')
        require(archive.testzip() is None, 'Recovery ZIP integrity failure')
        report = json.loads(archive.read(members[0]))
    require(report.get('certificate_sha256') == CERT and report.get('encrypted_container_sha256') == KEY_HASH and
            report.get('imported_backup_private_key_recovery_verified') is True, 'Recovery identity proof mismatch')
    artifact = api.json('/actions/artifacts/' + str(manifest['candidate_artifact_id']))
    require(not artifact.get('expired') and artifact.get('name') == 'android-UNSIGNED-NOT-INSTALLABLE' and
            artifact.get('workflow_run', {}).get('id') == manifest['candidate_run_id'] and
            artifact.get('workflow_run', {}).get('head_sha') == manifest['candidate_source_sha'] and
            artifact.get('workflow_run', {}).get('head_branch') == BRANCH, 'Candidate artifact binding mismatch')
    archive_path = out / 'candidate.zip'
    api.download(manifest['candidate_artifact_id'], archive_path)
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
    check_badging(run([tools() / 'aapt2', 'dump', 'badging', unsigned]))
    check_unsigned(unsigned, tools())
    proof = {**manifest, 'unsigned_apk_sha256': digest(unsigned), 'recovery_run_id': RECOVERY_RUN,
             'certificate_sha256': CERT, 'encrypted_container_sha256': KEY_HASH,
             'candidate_apk_zip_entry': entry.filename}
    (out / 'reviewed-provenance.json').write_text(json.dumps(proof, indent=2) + '\n')
    for path in (evidence_zip, archive_path):
        path.unlink()


def sign(input_path, workspace, destination):
    manifest = read_input(input_path)
    work = Path(workspace)
    proof = json.loads((work / 'reviewed-provenance.json').read_text())
    require(all(proof.get(k) == v for k, v in manifest.items()) and proof.get('certificate_sha256') == CERT and proof.get('recovery_run_id') == RECOVERY_RUN, 'Reviewed manifest changed')
    unsigned = work / 'reviewed-unsigned.apk'
    require(digest(unsigned) == proof['unsigned_apk_sha256'], 'Reviewed APK changed')
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
                      'package_name': 'com.zhiweixiao.t3code.zhcn', 'version_name': '0.1.3-zh.1', 'version_code': 1000411})
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

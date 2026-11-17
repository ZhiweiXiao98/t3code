# Migrated mock workflow; preserved original APK/recovery/secret-boundary tests.
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile
import sign_reviewed as signer
ORIGINAL_READ_INPUT=signer.read_input

class ReviewedSigningTests(unittest.TestCase):

    def setUp(self):
        # Explicit mock input boundary only. Actual read_input remains unconditionally blocked.
        mock=patch.object(signer,'read_input',side_effect=lambda path:json.loads(Path(path).read_text()))
        mock.start();self.addCleanup(mock.stop)

    def test_production_interlock_is_not_bypassed(self):
        m=json.loads(Path(signer.__file__).with_name('reviewed-signing-input.json').read_text())
        for mode in ['disabled','source','receipt']:
            q=dict(m);q['enabled']=True
            if mode=='disabled':q['enabled']=False
            elif mode=='source':q['candidate_source_sha']='0'*40
            else:q['receipt_pins_sha256']='0'*64
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp)/'input.json';p.write_text(json.dumps(q))
                with self.assertRaises(ValueError):ORIGINAL_READ_INPUT(p)

    def manifest(self):
        m = json.loads(Path(__file__).with_name('reviewed-signing-input.json').read_text())
        m.update({'candidate_artifact_id': 900001, 'candidate_artifact_zip_size': 123, 'candidate_artifact_zip_sha256': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'candidate_unsigned_apk_sha256': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'candidate_unsigned_apk_size': 12345, 'candidate_producer_job_id': 900002, 'candidate_producer_attempt': 1, 'candidate_producer_started_at': '2026-11-09T15:40:27Z', 'candidate_producer_completed_at': '2026-11-09T16:07:59Z'})
        m['enabled'] = True
        return m

    def producer_fixture(self):
        m = self.manifest()
        original = dict(id=m['candidate_producer_job_id'], run_id=m['candidate_run_id'], run_attempt=1, head_sha=m['candidate_source_sha'], head_branch=signer.BRANCH, name=signer.ANDROID_JOB, status='completed', conclusion='success', started_at=m['candidate_producer_started_at'], completed_at=m['candidate_producer_completed_at'], steps=[dict(name='Run actions/upload-artifact@v7', status='completed', conclusion='success', started_at='2026-11-09T16:07:52Z', completed_at='2026-11-09T16:07:56Z')])
        latest = dict(original, id=129551965272, run_attempt=2)
        artifact = dict(created_at='2026-11-09T16:07:55Z', updated_at='2026-11-09T16:07:55Z')
        return (m, original, latest, artifact)

    def test_changed_apk_rejected_before_secret_access(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            work = root / 'work'
            work.mkdir()
            inp = root / 'input.json'
            m = self.manifest()
            inp.write_text(json.dumps(m))
            unsigned = work / 'reviewed-unsigned.apk'
            unsigned.write_bytes(b'UNREVIEWED MOCK APK')
            proof = {**m, 'unsigned_apk_sha256': signer.digest(unsigned), 'certificate_sha256': signer.CERT, 'recovery_run_id': signer.RECOVERY_RUN}
            (work / 'reviewed-provenance.json').write_text(json.dumps(proof))
            with patch.object(signer.os.environ, 'get', side_effect=AssertionError('Secret access forbidden')), self.assertRaisesRegex(ValueError, 'APK changed'):
                signer.sign(inp, work, root / 'output')
            self.assertFalse((work / 'signing-only.p12').exists())

    def test_prepare_rechecks_after_apk_inspection_without_secrets(self):

        def make_zip(files):
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, 'w') as z:
                for name, content in files.items():
                    z.writestr(name, content)
            return stream.getvalue()
        apk = make_zip({'AndroidManifest.xml': b'PUBLIC MOCK MANIFEST', 'lib/arm64-v8a/mock.so': b'PUBLIC MOCK LIBRARY'})
        candidate = make_zip({signer.UNSIGNED_APK_NAME: apk, 'SIGNING-BLOCKER.txt': b'PUBLIC MOCK WARNING'})
        recovery = make_zip({'recovery-report.json': json.dumps({'certificate_sha256': signer.CERT, 'encrypted_container_sha256': signer.KEY_HASH, 'imported_backup_private_key_recovery_verified': True}).encode()})
        for race in [False, True, 'expired-artifact', 'deleted-artifact', 'changed-producer']:
            with self.subTest(race=race), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                inp = root / 'input.json'
                m, original, latest, artifact = self.producer_fixture()
                latest = dict(original, run_attempt=signer.CANDIDATE_ATTEMPT)
                m.update(candidate_artifact_zip_sha256=hashlib.sha256(candidate).hexdigest(), candidate_artifact_zip_size=len(candidate), candidate_unsigned_apk_sha256=hashlib.sha256(apk).hexdigest(), candidate_unsigned_apk_size=len(apk))
                inp.write_text(json.dumps(m))
                artifact.update(id=m['candidate_artifact_id'], size_in_bytes=len(candidate), expired=False, expires_at='2099-01-01T00:00:00Z', name='android-UNSIGNED-NOT-INSTALLABLE', digest='sha256:' + m['candidate_artifact_zip_sha256'], workflow_run={'id': m['candidate_run_id'], 'head_sha': signer.SOURCE_SHA, 'head_branch': signer.BRANCH})
                jobs = [dict(latest, name=n, id=100 + i) if n != signer.ANDROID_JOB else latest for i, n in enumerate([j['api_snapshot']['name'] for j in json.loads(Path(__file__).with_name('receipt-collection-plan.json').read_text())['jobs'] if j['id'] in {g['job_id'] for g in json.loads(Path(__file__).with_name('receipt-collection-plan.json').read_text())['logical_gates'].values()}])]
                checks = []
                reads = {'artifact': 0, 'producer': 0}

                class FakeApi:

                    def json(self, url):
                        if url == '/actions/runs/' + str(signer.CANDIDATE_RUN):
                            checks.append('candidate-run')
                            return dict(id=signer.CANDIDATE_RUN, run_attempt=3 if race is True and len(checks) == 2 else signer.CANDIDATE_ATTEMPT, head_sha=signer.SOURCE_SHA, head_branch=signer.BRANCH, path='.github/workflows/client-release.yml', event='push', repository={'full_name': signer.REPO, 'private': False}, head_repository={'full_name': signer.REPO}, head_commit={'tree_id': signer.SOURCE_TREE}, status='completed', conclusion='failure')
                        if '/attempts/' + str(signer.CANDIDATE_ATTEMPT) + '/jobs?' in url:
                            reads['producer'] += 1
                            observed = [dict(j) for j in jobs]
                            if race == 'changed-producer' and reads['producer'] == 2:
                                for job in observed:
                                    if job['name'] == signer.ANDROID_JOB:
                                        job['completed_at'] = '2026-11-09T16:08:00Z'
                            return {'total_count': 26, 'jobs': observed}
                        if url.startswith('/git/ref/'):
                            return {'object': {'sha': signer.SOURCE_SHA}}
                        if url == '/actions/runs/' + str(signer.RECOVERY_RUN):
                            return dict(status='completed', conclusion='success', head_branch='signing/android-bootstrap', head_sha='8fc8b21abd2380926242fc49e7f488cb4b3aa0b8', repository={'full_name': signer.REPO}, path='.github/workflows/android-signing-recovery.yml')
                        if '/artifacts?' in url:
                            return {'artifacts': [dict(id=signer.RECOVERY_ARTIFACT, expired=False, expires_at='2099-01-01T00:00:00Z', name='android-public-recovery-evidence-' + str(signer.RECOVERY_RUN), digest='sha256:' + hashlib.sha256(recovery).hexdigest())]}
                        if url == '/actions/artifacts/' + str(m['candidate_artifact_id']):
                            reads['artifact'] += 1
                            if reads['artifact'] > 1 and race == 'expired-artifact':
                                return dict(artifact, expired=True)
                            if reads['artifact'] > 1 and race == 'deleted-artifact':
                                return {}
                            return dict(artifact)
                        raise AssertionError('Unexpected API ' + url)

                    def download(self, artifact_id, target, maximum):
                        Path(target).write_bytes(recovery if artifact_id == signer.RECOVERY_ARTIFACT else candidate)
                with patch.object(signer.receipt_guard, 'verify', return_value={'jobs':jobs,'total_count':26,'supplemental_coverage':{},'ui_validation':{},'receipt_provenance':{}}), patch.object(signer, 'Api', FakeApi), patch.object(signer, 'RECOVERY_ZIP_SHA256', hashlib.sha256(recovery).hexdigest()), patch.object(signer, 'tools', return_value=Path('/PUBLIC-MOCK')), patch.object(signer, 'run', return_value="package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000417' versionName='0.1.9-zh.2'\nnative-code: 'arm64-v8a'\n"), patch.object(signer.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='DOES NOT VERIFY', stderr='')):
                    if race:
                        with self.assertRaises(ValueError):
                            signer.prepare(inp, root / 'work')
                        self.assertFalse((root / 'work/reviewed-provenance.json').exists())
                    else:
                        signer.prepare(inp, root / 'work')
                        proof = json.loads((root / 'work/reviewed-provenance.json').read_text())
                        self.assertEqual(len(proof['validated_release_jobs']), 26)
                        self.assertEqual(proof['unsigned_apk_sha256'], m['candidate_unsigned_apk_sha256'])
                self.assertEqual(checks, ['candidate-run', 'candidate-run'])

    def test_mock_sign_outputs_only_expected_public_files(self):
        commands = []
        data = b'NOT A KEY PUBLIC MOCK'
        expected_hash = hashlib.sha256(data).hexdigest()

        def fake(command):
            command = [str(x) for x in command]
            commands.append(command)
            self.assertNotIn('-genkeypair', command)
            if 'sign' in command:
                Path(command[command.index('--out') + 1]).write_bytes(b'NOT AN APK PUBLIC MOCK SIGNED')
            elif 'verify' in command:
                return 'Signer #1 certificate SHA-256 digest: ' + signer.CERT + '\n'
            elif '-f' in command:
                Path(command[-1]).write_bytes(b'PUBLIC MOCK ALIGNED')
            elif 'badging' in command:
                return "package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000417' versionName='0.1.9-zh.2'\nnative-code: 'arm64-v8a'\n"
            return ''
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            work = root / 'work'
            work.mkdir()
            output = root / 'output'
            inp = root / 'input.json'
            m = self.manifest()
            m['candidate_unsigned_apk_sha256'] = hashlib.sha256(b'PUBLIC MOCK UNSIGNED').hexdigest()
            m['candidate_unsigned_apk_size'] = len(b'PUBLIC MOCK UNSIGNED')
            inp.write_text(json.dumps(m))
            unsigned = work / 'reviewed-unsigned.apk'
            unsigned.write_bytes(b'PUBLIC MOCK UNSIGNED')
            proof = {**m, 'unsigned_apk_sha256': signer.digest(unsigned), 'certificate_sha256': signer.CERT, 'recovery_run_id': signer.RECOVERY_RUN}
            (work / 'reviewed-provenance.json').write_text(json.dumps(proof))
            with patch.dict(os.environ, {'ANDROID_KEYSTORE_BASE64': base64.b64encode(data).decode(), 'ANDROID_KEYSTORE_PASSWORD': 'PUBLIC-NOT-A-SECRET-' * 3}), patch.object(signer, 'KEY_HASH', expected_hash), patch.object(signer, 'tools', return_value=Path('/PUBLIC-MOCK-TOOLS')), patch.object(signer, 'run', side_effect=fake), patch.object(signer.subprocess, 'run', side_effect=AssertionError('Real tool execution forbidden')):
                signer.sign(inp, work, output)
            self.assertEqual({x.name for x in output.iterdir()}, {signer.APK_NAME, 'BUILD-PROVENANCE.json', 'SHA256SUMS.txt'})
            self.assertFalse((work / 'signing-only.p12').exists())
            self.assertFalse((work / 'aligned.apk').exists())
            report = json.loads((output / 'BUILD-PROVENANCE.json').read_text())
            self.assertEqual(report['source_sha'], signer.SOURCE_SHA)
            self.assertEqual(report['candidate_artifact_sha256'], m['candidate_artifact_zip_sha256'])
            self.assertEqual(report['version_code'], 1000417)
            self.assertEqual(len((output / 'SHA256SUMS.txt').read_text().splitlines()), 2)
            self.assertNotIn('PUBLIC-NOT-A-SECRET-', repr(commands))

class InputAndRunBindings(unittest.TestCase):
 def test_disabled_and_wrong_candidate_input(self):
  m=json.loads(Path(signer.__file__).with_name('reviewed-signing-input.json').read_text())
  m['enabled']=False
  with self.assertRaises(ValueError):signer.validate_input(m)
  m['enabled']=True;signer.validate_input(m)
  for k in ['candidate_run_id','candidate_attempt','candidate_source_sha','candidate_source_tree_sha','candidate_artifact_zip_sha256','candidate_unsigned_apk_sha256','candidate_producer_attempt']:
   q=dict(m);q[k]='0' if isinstance(q[k],str) else -1
   with self.subTest(field=k),self.assertRaises(ValueError):signer.validate_input(q)
 def test_original_run_retains_failure_exact_identity(self):
  m=json.loads(Path(signer.__file__).with_name('reviewed-signing-input.json').read_text())
  r=dict(id=signer.CANDIDATE_RUN,run_attempt=1,head_sha=signer.SOURCE_SHA,head_branch=signer.BRANCH,path='.github/workflows/client-release.yml',event='push',repository={'full_name':signer.REPO,'private':False},head_repository={'full_name':signer.REPO},head_commit={'tree_id':signer.SOURCE_TREE},status='completed',conclusion='failure')
  signer.check_run(r,m)
  for k,v in [('run_attempt',2),('head_sha','0'*40),('head_branch','main'),('status','in_progress'),('conclusion','success'),('path','wrong')]:
   with self.subTest(field=k),self.assertRaises(ValueError):signer.check_run(dict(r,**{k:v}),m)

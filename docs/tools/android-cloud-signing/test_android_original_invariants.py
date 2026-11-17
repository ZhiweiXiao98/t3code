# Exact original test bodies, isolated from obsolete 21-job/UI harness.
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

class OriginalAndroidInvariantTests(unittest.TestCase):

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

    def test_retained_artifact_uses_original_actual_job_interval(self):
        m, original, latest, artifact = self.producer_fixture()
        proof = signer.check_artifact_producer(artifact, [latest], original, m)
        self.assertEqual(proof['original_attempt'], 1)
        self.assertEqual(proof['latest_attempt'], 2)
        self.assertNotEqual(proof['original_job_id'], proof['latest_job_id'])
        for field, value in [('id', 123), ('run_id', 123), ('run_attempt', 2), ('head_sha', 'a' * 40), ('head_branch', 'main'), ('name', 'other'), ('status', 'in_progress'), ('conclusion', 'skipped'), ('started_at', '2026-11-10T00:55:23Z')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                signer.check_artifact_producer(artifact, [latest], dict(original, **{field: value}), m)
        for ts in ['2026-11-09T15:40:26Z', '2026-11-09T16:07:51Z', '2026-11-09T16:07:57Z', '2026-11-10T01:00:00Z', None]:
            with self.subTest(ts=ts), self.assertRaises(ValueError):
                signer.check_artifact_producer(dict(created_at=ts, updated_at=ts), [latest], original, m)
        with self.assertRaises(ValueError):
            signer.check_artifact_producer(artifact, [latest, latest], original, m)
        with self.assertRaises(ValueError):
            signer.check_artifact_producer(artifact, [dict(latest, started_at='2026-11-10T00:55:23Z')], original, m)
        with self.assertRaises(ValueError):
            signer.check_artifact_producer(artifact, [dict(latest, steps=[])], original, m)

    def test_download_rejects_one_byte_over_reviewed_limit(self):
        target = io.BytesIO()
        self.assertEqual(signer.copy_limited(io.BytesIO(b'abcd'), target, 4), 4)
        self.assertEqual(target.getvalue(), b'abcd')
        with self.assertRaisesRegex(ValueError, 'download limit'):
            signer.copy_limited(io.BytesIO(b'abcde'), io.BytesIO(), 4)

    def test_apk_badging_is_exact(self):
        valid = "package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000417' versionName='0.1.9-zh.2'\nnative-code: 'arm64-v8a'\n"
        signer.check_badging(valid)
        for wrong in [valid.replace('1000417', '10103'), valid.replace('arm64-v8a', 'x86_64'), valid.replace("'arm64-v8a'", "'arm64-v8a' 'armeabi-v7a'")]:
            with self.assertRaises(ValueError):
                signer.check_badging(wrong)

    def test_unsigned_gate_requires_expected_verifier_failure(self):

        def fake(code, text):
            return lambda *args, **kwargs: SimpleNamespace(returncode=code, stdout='', stderr=text)
        signer.check_unsigned(Path('PUBLIC-MOCK.apk'), Path('/MOCK'), process=fake(1, 'DOES NOT VERIFY'))
        for code, text in [(0, 'Verified'), (127, 'not found'), (1, 'unrelated failure')]:
            with self.assertRaises(ValueError):
                signer.check_unsigned(Path('PUBLIC-MOCK.apk'), Path('/MOCK'), process=fake(code, text))

    def test_recovery_artifact_is_fixed_and_not_expired(self):
        artifact = dict(id=12799615493, expired=False, expires_at='2099-01-01T00:00:00Z', name='android-public-recovery-evidence-40649758501', digest='sha256:b2c345e3b7566e2c6cd3efa8be8213b464f1c3a04497967c96228d3797769fdd')
        signer.check_recovery_artifact(artifact)
        for field, wrong in [('id', 123), ('expired', True), ('digest', 'sha256:' + 'a' * 64), ('name', 'other'), ('expires_at', '2000-01-01T00:00:00Z'), ('expires_at', None)]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                signer.check_recovery_artifact(dict(artifact, **{field: wrong}))

    def test_candidate_filename_and_full_zip_crc_check(self):
        for name, accepted in [(signer.UNSIGNED_APK_NAME, True), ('unreviewed.apk', False), ('nested/' + signer.UNSIGNED_APK_NAME, False)]:
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, 'w') as archive:
                archive.writestr(name, b'PUBLIC MOCK APK')
                archive.writestr('SIGNING-BLOCKER.txt', b'PUBLIC MOCK')
            stream.seek(0)
            with zipfile.ZipFile(stream) as archive:
                if accepted:
                    self.assertEqual(signer.candidate_entry(archive).filename, signer.UNSIGNED_APK_NAME)
                    with patch.object(archive, 'testzip', return_value='bad.apk'), self.assertRaises(ValueError):
                        signer.candidate_entry(archive)
                else:
                    with self.assertRaises(ValueError):
                        signer.candidate_entry(archive)

    def test_zip_rejects_traversal_symlink_and_duplicates(self):
        for filename, symlink in [('../outside.apk', False), ('/absolute.apk', False), ('a\\b.apk', False), ('link.apk', True)]:
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, 'w') as out:
                item = zipfile.ZipInfo(filename)
                if symlink:
                    item.external_attr = 41471 << 16
                out.writestr(item, b'PUBLIC MOCK')
            stream.seek(0)
            with zipfile.ZipFile(stream) as archive, self.assertRaises(ValueError):
                signer.safe_members(archive)

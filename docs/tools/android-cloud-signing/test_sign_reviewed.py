"""Public metadata and mocked signing only: no keys, network or programs."""
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


class ReviewedSigningTests(unittest.TestCase):
    def manifest(self):
        return dict(enabled=True, candidate_run_id=123, candidate_attempt=1,
                    candidate_source_sha='a' * 40, candidate_artifact_id=456,
                    candidate_artifact_zip_sha256='b' * 64)

    def test_disabled_input(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'input.json'
            path.write_text('{"enabled":false}')
            with self.assertRaisesRegex(ValueError, 'disabled'):
                signer.read_input(path)

    def test_exact_run_binding_and_gates(self):
        m = self.manifest()
        run = dict(id=123, run_attempt=1, head_sha='a' * 40, head_branch=signer.BRANCH,
                   path='.github/workflows/client-release.yml', event='push',
                   repository={'full_name':signer.REPO}, head_repository={'full_name':signer.REPO}, status='completed', conclusion='success')
        signer.check_run(run, m)
        with self.assertRaises(ValueError):
            signer.check_run(dict(run, head_repository={'full_name':'someone/other'}), m)
        for field, wrong in [('head_sha', 'c' * 40), ('run_attempt', 2), ('head_branch','main'),
                             ('path','.github/workflows/ci.yml'), ('conclusion','failure')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                signer.check_run(dict(run, **{field:wrong}), m)
        jobs = [dict(name=x, status='completed', conclusion='success') for x in signer.JOBS]
        signer.check_jobs(jobs)
        with self.assertRaises(ValueError): signer.check_jobs(jobs[:-1])
        jobs[0]['conclusion'] = 'skipped'
        with self.assertRaises(ValueError): signer.check_jobs(jobs)

    def test_apk_badging_is_exact(self):
        valid = "package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000411' versionName='0.1.3-zh.1'\nnative-code: 'arm64-v8a'\n"
        signer.check_badging(valid)
        for wrong in [valid.replace('1000411','10103'), valid.replace('arm64-v8a','x86_64'), valid.replace("'arm64-v8a'", "'arm64-v8a' 'armeabi-v7a'")]:
            with self.assertRaises(ValueError): signer.check_badging(wrong)

    def test_unsigned_gate_requires_expected_verifier_failure(self):
        def fake(code, text):
            return lambda *args, **kwargs: SimpleNamespace(returncode=code, stdout='', stderr=text)
        signer.check_unsigned(Path('PUBLIC-MOCK.apk'), Path('/MOCK'), process=fake(1,'DOES NOT VERIFY'))
        for code,text in [(0,'Verified'),(127,'not found'),(1,'unrelated failure')]:
            with self.assertRaises(ValueError):
                signer.check_unsigned(Path('PUBLIC-MOCK.apk'),Path('/MOCK'),process=fake(code,text))

    def test_recovery_artifact_is_fixed_and_not_expired(self):
        artifact=dict(id=12799615493, expired=False,
                      name='android-public-recovery-evidence-40649758501',
                      digest='sha256:b2c345e3b7566e2c6cd3efa8be8213b464f1c3a04497967c96228d3797769fdd')
        signer.check_recovery_artifact(artifact)
        for field, wrong in [('id',123),('expired',True),('digest','sha256:'+'a'*64),('name','other')]:
            with self.subTest(field=field),self.assertRaises(ValueError):
                signer.check_recovery_artifact(dict(artifact,**{field:wrong}))

    def test_candidate_filename_and_full_zip_crc_check(self):
        for name, accepted in [(signer.UNSIGNED_APK_NAME,True),('unreviewed.apk',False),('nested/'+signer.UNSIGNED_APK_NAME,False)]:
            stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w') as archive:
                archive.writestr(name,b'PUBLIC MOCK APK')
                archive.writestr('SIGNING-BLOCKER.txt',b'PUBLIC MOCK')
            stream.seek(0)
            with zipfile.ZipFile(stream) as archive:
                if accepted:
                    self.assertEqual(signer.candidate_entry(archive).filename,signer.UNSIGNED_APK_NAME)
                    with patch.object(archive,'testzip',return_value='bad.apk'),self.assertRaises(ValueError):
                        signer.candidate_entry(archive)
                else:
                    with self.assertRaises(ValueError):signer.candidate_entry(archive)

    def test_zip_rejects_traversal_symlink_and_duplicates(self):
        for filename, symlink in [('../outside.apk',False), ('/absolute.apk',False), ('a\\b.apk',False), ('link.apk',True)]:
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, 'w') as out:
                item = zipfile.ZipInfo(filename)
                if symlink: item.external_attr = 0o120777 << 16
                out.writestr(item,b'PUBLIC MOCK')
            stream.seek(0)
            with zipfile.ZipFile(stream) as archive, self.assertRaises(ValueError): signer.safe_members(archive)

    def test_mock_sign_outputs_only_expected_public_files(self):
        commands=[]
        data=b'NOT A KEY PUBLIC MOCK'
        expected_hash=hashlib.sha256(data).hexdigest()
        def fake(command):
            command=[str(x) for x in command]
            commands.append(command)
            self.assertNotIn('-genkeypair',command)
            if 'sign' in command:
                Path(command[command.index('--out')+1]).write_bytes(b'NOT AN APK PUBLIC MOCK SIGNED')
            elif 'verify' in command:
                return 'Signer #1 certificate SHA-256 digest: '+signer.CERT+'\n'
            elif '-f' in command:
                Path(command[-1]).write_bytes(b'PUBLIC MOCK ALIGNED')
            elif 'badging' in command:
                return "package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000411' versionName='0.1.3-zh.1'\nnative-code: 'arm64-v8a'\n"
            return ''
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); work=root/'work';work.mkdir();output=root/'output';inp=root/'input.json'
            m=self.manifest();inp.write_text(json.dumps(m))
            unsigned=work/'reviewed-unsigned.apk';unsigned.write_bytes(b'PUBLIC MOCK UNSIGNED')
            proof={**m,'unsigned_apk_sha256':signer.digest(unsigned),'certificate_sha256':signer.CERT,'recovery_run_id':signer.RECOVERY_RUN}
            (work/'reviewed-provenance.json').write_text(json.dumps(proof))
            with patch.dict(os.environ,{'ANDROID_KEYSTORE_BASE64':base64.b64encode(data).decode(),'ANDROID_KEYSTORE_PASSWORD':'PUBLIC-NOT-A-SECRET-'*3}), patch.object(signer,'KEY_HASH',expected_hash), patch.object(signer,'tools',return_value=Path('/PUBLIC-MOCK-TOOLS')), patch.object(signer,'run',side_effect=fake), patch.object(signer.subprocess,'run',side_effect=AssertionError('Real tool execution forbidden')):
                signer.sign(inp,work,output)
            self.assertEqual({x.name for x in output.iterdir()},{signer.APK_NAME,'BUILD-PROVENANCE.json','SHA256SUMS.txt'})
            self.assertFalse((work/'signing-only.p12').exists())
            self.assertFalse((work/'aligned.apk').exists())
            report=json.loads((output/'BUILD-PROVENANCE.json').read_text())
            self.assertEqual(report['source_sha'],'a'*40)
            self.assertEqual(report['candidate_artifact_sha256'],'b'*64)
            self.assertEqual(report['version_code'],1000411)
            self.assertEqual(len((output/'SHA256SUMS.txt').read_text().splitlines()),2)
            self.assertNotIn('PUBLIC-NOT-A-SECRET-',repr(commands))


if __name__ == '__main__':
    unittest.main()

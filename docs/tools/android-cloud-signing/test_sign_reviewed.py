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
    def setUp(self):
        for target in ('supplemental_pins',):
            mock = patch.object(signer, target, return_value={})
            mock.start()
            self.addCleanup(mock.stop)
        mock = patch.object(signer.verify_supplemental, 'verify', return_value={})
        mock.start()
        self.addCleanup(mock.stop)

    def test_unreviewed_supplement_pins_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'Unreviewed coverage'):
            pins = json.loads(Path(__file__).with_name('supplemental-pin.json').read_text())
            pins['artifact']['id'] = None
            signer.verify_supplemental.check_pins(pins)

    def manifest(self):
        m = json.loads(Path(__file__).with_name('reviewed-signing-input.json').read_text())
        m.update({'candidate_artifact_id': 900001, 'candidate_artifact_zip_size':123, 'candidate_artifact_zip_sha256': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'candidate_unsigned_apk_sha256': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'candidate_unsigned_apk_size': 12345, 'candidate_producer_job_id': 900002, 'candidate_producer_attempt': 1, 'candidate_producer_started_at': '2026-11-09T15:40:27Z', 'candidate_producer_completed_at': '2026-11-09T16:07:59Z'})
        m['enabled'] = True  # Public test fixture, never persisted as a reviewed input.
        return m

    def test_disabled_input(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'input.json'
            path.write_text('{"enabled":false}')
            with self.assertRaisesRegex(ValueError, 'disabled'):
                signer.read_input(path)

    def test_exact_run_binding_and_gates(self):
        m = self.manifest()
        run = dict(id=signer.CANDIDATE_RUN, run_attempt=signer.CANDIDATE_ATTEMPT, head_sha=signer.SOURCE_SHA, head_branch=signer.BRANCH,
                   path='.github/workflows/client-release.yml', event='push',
                   head_commit={'tree_id':signer.SOURCE_TREE}, repository={'full_name':signer.REPO,'private':False}, head_repository={'full_name':signer.REPO}, status='completed', conclusion='success')
        signer.check_run(run, m)
        with self.assertRaises(ValueError):
            signer.check_run(dict(run, head_repository={'full_name':'someone/other'}), m)
        for field, wrong in [('head_sha', 'c' * 40), ('run_attempt', 3), ('head_branch','main'),
                             ('path','.github/workflows/ci.yml'), ('conclusion','failure')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                signer.check_run(dict(run, **{field:wrong}), m)
        jobs = [dict(name=x, status='completed', conclusion='success', run_id=signer.CANDIDATE_RUN, run_attempt=signer.CANDIDATE_ATTEMPT, head_sha=signer.SOURCE_SHA) for x in signer.JOBS]
        signer.check_jobs(jobs,m)
        with self.assertRaises(ValueError): signer.check_jobs(jobs[:-1],m)
        jobs[0]['conclusion'] = 'skipped'
        with self.assertRaises(ValueError): signer.check_jobs(jobs,m)

    def test_input_pins_exact_candidate(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'input.json'
            good = self.manifest()
            path.write_text(json.dumps(good))
            signer.read_input(path)
            for field, wrong in [('candidate_run_id',1),('candidate_attempt',3),
                                 ('candidate_source_sha','a'*40),('candidate_source_tree_sha','b'*40),
                                 ('candidate_unsigned_apk_sha256',None),('candidate_unsigned_apk_size',True),
                                 ('candidate_producer_attempt',3)]:
                path.write_text(json.dumps({**good,field:wrong}))
                with self.subTest(field=field), self.assertRaises(ValueError): signer.read_input(path)

    def test_all_22_gates_reject_partial_old_or_wrong_attempt(self):
        m = self.manifest()
        good = [dict(name=x,status='completed',conclusion='success',run_id=signer.CANDIDATE_RUN,
                     run_attempt=signer.CANDIDATE_ATTEMPT,head_sha=signer.SOURCE_SHA) for x in signer.JOBS]
        signer.check_jobs(good,m)
        for wrong in [good[:15],good[:-1]+[good[0]],good+[good[0]]]:
            with self.assertRaises(ValueError): signer.check_jobs(wrong,m)
        for field,value in [('status','in_progress'),('conclusion','skipped'),('conclusion','failure'),
                            ('run_id',123),('run_attempt',99),('head_sha','a'*40)]:
            jobs=[dict(x) for x in good];jobs[0][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(ValueError):signer.check_jobs(jobs,m)

    def producer_fixture(self):
        m=self.manifest()
        original=dict(id=m['candidate_producer_job_id'],run_id=m['candidate_run_id'],run_attempt=1,
                      head_sha=m['candidate_source_sha'],head_branch=signer.BRANCH,name=signer.ANDROID_JOB,
                      status='completed',conclusion='success',started_at=m['candidate_producer_started_at'],
                      completed_at=m['candidate_producer_completed_at'],steps=[dict(name='Run actions/upload-artifact@v7',
                      status='completed',conclusion='success',started_at='2026-11-09T16:07:52Z',completed_at='2026-11-09T16:07:56Z')])
        latest=dict(original,id=129551965272,run_attempt=2)
        artifact=dict(created_at='2026-11-09T16:07:55Z',updated_at='2026-11-09T16:07:55Z')
        return m,original,latest,artifact

    def test_retained_artifact_uses_original_actual_job_interval(self):
        m,original,latest,artifact=self.producer_fixture()
        proof=signer.check_artifact_producer(artifact,[latest],original,m)
        self.assertEqual(proof['original_attempt'],1)
        self.assertEqual(proof['latest_attempt'],2)
        self.assertNotEqual(proof['original_job_id'],proof['latest_job_id'])
        for field,value in [('id',123),('run_id',123),('run_attempt',2),('head_sha','a'*40),
                            ('head_branch','main'),('name','other'),('status','in_progress'),('conclusion','skipped'),
                            ('started_at','2026-11-10T00:55:23Z')]:
            with self.subTest(field=field),self.assertRaises(ValueError):
                signer.check_artifact_producer(artifact,[latest],dict(original,**{field:value}),m)
        for ts in ['2026-11-09T15:40:26Z','2026-11-09T16:07:51Z','2026-11-09T16:07:57Z','2026-11-10T01:00:00Z',None]:
            with self.subTest(ts=ts),self.assertRaises(ValueError):
                signer.check_artifact_producer(dict(created_at=ts,updated_at=ts),[latest],original,m)
        with self.assertRaises(ValueError):signer.check_artifact_producer(artifact,[latest,latest],original,m)
        with self.assertRaises(ValueError):signer.check_artifact_producer(artifact,[dict(latest,started_at='2026-11-10T00:55:23Z')],original,m)
        with self.assertRaises(ValueError):signer.check_artifact_producer(artifact,[dict(latest,steps=[])],original,m)

    def test_current_candidate_rejects_late_rerun_and_branch_move(self):
        m=self.manifest()
        run=dict(id=m['candidate_run_id'],run_attempt=signer.CANDIDATE_ATTEMPT,head_sha=m['candidate_source_sha'],head_branch=signer.BRANCH,
                 path='.github/workflows/client-release.yml',event='push',repository={'full_name':signer.REPO,'private':False},
                 head_repository={'full_name':signer.REPO},head_commit={'tree_id':signer.SOURCE_TREE},status='completed',conclusion='success')
        jobs={'total_count':22,'jobs':[dict(name=x,status='completed',conclusion='success',run_id=signer.CANDIDATE_RUN,
                     run_attempt=signer.CANDIDATE_ATTEMPT,head_sha=signer.SOURCE_SHA) for x in signer.JOBS]}
        class FakeApi:
            def __init__(self, response): self.response=iter(response)
            def json(self, suffix): return next(self.response)
        signer.current_candidate(FakeApi([run,jobs,{'object':{'sha':signer.SOURCE_SHA}}]),m)
        for wrong in [dict(run,run_attempt=3),dict(run,status='in_progress')]:
            with self.assertRaises(ValueError):signer.current_candidate(FakeApi([wrong]),m)
        with self.assertRaises(ValueError):signer.current_candidate(FakeApi([run,jobs,{'object':{'sha':'a'*40}}]),m)

    def test_changed_apk_rejected_before_secret_access(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);work=root/'work';work.mkdir();inp=root/'input.json'
            m=self.manifest();inp.write_text(json.dumps(m))
            unsigned=work/'reviewed-unsigned.apk';unsigned.write_bytes(b'UNREVIEWED MOCK APK')
            proof={**m,'unsigned_apk_sha256':signer.digest(unsigned),'certificate_sha256':signer.CERT,'recovery_run_id':signer.RECOVERY_RUN}
            (work/'reviewed-provenance.json').write_text(json.dumps(proof))
            with patch.object(signer.os.environ,'get',side_effect=AssertionError('Secret access forbidden')),self.assertRaisesRegex(ValueError,'APK changed'):
                signer.sign(inp,work,root/'output')
            self.assertFalse((work/'signing-only.p12').exists())

    def test_prepare_rechecks_after_apk_inspection_without_secrets(self):
        def make_zip(files):
            stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w') as z:
                for name,content in files.items():z.writestr(name,content)
            return stream.getvalue()
        apk=make_zip({'AndroidManifest.xml':b'PUBLIC MOCK MANIFEST','lib/arm64-v8a/mock.so':b'PUBLIC MOCK LIBRARY'})
        candidate=make_zip({signer.UNSIGNED_APK_NAME:apk,'SIGNING-BLOCKER.txt':b'PUBLIC MOCK WARNING'})
        recovery=make_zip({'recovery-report.json':json.dumps({'certificate_sha256':signer.CERT,'encrypted_container_sha256':signer.KEY_HASH,
                   'imported_backup_private_key_recovery_verified':True}).encode()})
        for race in [False,True,'expired-artifact','deleted-artifact','changed-producer']:
            with self.subTest(race=race),tempfile.TemporaryDirectory() as folder:
                root=Path(folder);inp=root/'input.json'
                m,original,latest,artifact=self.producer_fixture()
                latest=dict(original,id=900003,run_attempt=signer.CANDIDATE_ATTEMPT)
                m.update(candidate_artifact_zip_sha256=hashlib.sha256(candidate).hexdigest(),candidate_artifact_zip_size=len(candidate),
                         candidate_unsigned_apk_sha256=hashlib.sha256(apk).hexdigest(),candidate_unsigned_apk_size=len(apk))
                inp.write_text(json.dumps(m))
                artifact.update(id=m['candidate_artifact_id'],size_in_bytes=len(candidate),expired=False,expires_at='2099-01-01T00:00:00Z',name='android-UNSIGNED-NOT-INSTALLABLE',
                    digest='sha256:'+m['candidate_artifact_zip_sha256'],workflow_run={'id':m['candidate_run_id'],'head_sha':signer.SOURCE_SHA,'head_branch':signer.BRANCH})
                jobs=[dict(latest,name=n,id=100+i) if n!=signer.ANDROID_JOB else latest for i,n in enumerate(sorted(signer.JOBS))]
                checks=[]
                reads={'artifact':0,'producer':0}
                class FakeApi:
                    def json(self,url):
                        if url=='/actions/runs/'+str(signer.CANDIDATE_RUN):
                            checks.append('candidate-run')
                            return dict(id=signer.CANDIDATE_RUN,run_attempt=3 if race is True and len(checks)==2 else signer.CANDIDATE_ATTEMPT,
                                head_sha=signer.SOURCE_SHA,head_branch=signer.BRANCH,path='.github/workflows/client-release.yml',event='push',
                                repository={'full_name':signer.REPO,'private':False},head_repository={'full_name':signer.REPO},
                                head_commit={'tree_id':signer.SOURCE_TREE},status='completed',conclusion='success')
                        if '/attempts/'+str(signer.CANDIDATE_ATTEMPT)+'/jobs?' in url:return {'total_count':22,'jobs':jobs}
                        if '/attempts/1/jobs?' in url:
                            reads['producer']+=1
                            observed=dict(original)
                            if race=='changed-producer' and reads['producer']>1:observed['completed_at']='2026-11-09T16:08:00Z'
                            return {'total_count':1,'jobs':[observed]}
                        if url.startswith('/git/ref/'):return {'object':{'sha':signer.SOURCE_SHA}}
                        if url=='/actions/runs/'+str(signer.RECOVERY_RUN):return dict(status='completed',conclusion='success',head_branch='signing/android-bootstrap',
                            head_sha='8fc8b21abd2380926242fc49e7f488cb4b3aa0b8',repository={'full_name':signer.REPO},path='.github/workflows/android-signing-recovery.yml')
                        if '/artifacts?' in url:return {'artifacts':[dict(id=signer.RECOVERY_ARTIFACT,expired=False,name='android-public-recovery-evidence-'+str(signer.RECOVERY_RUN),digest='sha256:'+hashlib.sha256(recovery).hexdigest())]}
                        if url=='/actions/artifacts/'+str(m['candidate_artifact_id']):
                            reads['artifact']+=1
                            if reads['artifact']>1 and race=='expired-artifact':return dict(artifact,expired=True)
                            if reads['artifact']>1 and race=='deleted-artifact':return {}
                            return dict(artifact)
                        raise AssertionError('Unexpected API '+url)
                    def download(self,artifact_id,target,maximum):
                        Path(target).write_bytes(recovery if artifact_id==signer.RECOVERY_ARTIFACT else candidate)
                with patch.object(signer,'Api',FakeApi),patch.object(signer,'RECOVERY_ZIP_SHA256',hashlib.sha256(recovery).hexdigest()), \
                     patch.object(signer,'tools',return_value=Path('/PUBLIC-MOCK')), \
                     patch.object(signer,'run',return_value="package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000414' versionName='0.1.7-zh.1'\nnative-code: 'arm64-v8a'\n"), \
                     patch.object(signer.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout='DOES NOT VERIFY',stderr='')):
                    if race:
                        with self.assertRaises(ValueError):signer.prepare(inp,root/'work')
                        self.assertFalse((root/'work/reviewed-provenance.json').exists())
                    else:
                        signer.prepare(inp,root/'work')
                        proof=json.loads((root/'work/reviewed-provenance.json').read_text())
                        self.assertEqual(len(proof['validated_release_jobs']),22)
                        self.assertEqual(proof['unsigned_apk_sha256'],m['candidate_unsigned_apk_sha256'])
                self.assertEqual(checks,['candidate-run','candidate-run'])

    def test_download_rejects_one_byte_over_reviewed_limit(self):
        target=io.BytesIO()
        self.assertEqual(signer.copy_limited(io.BytesIO(b'abcd'),target,4),4)
        self.assertEqual(target.getvalue(),b'abcd')
        with self.assertRaisesRegex(ValueError,'download limit'):
            signer.copy_limited(io.BytesIO(b'abcde'),io.BytesIO(),4)

    def test_apk_badging_is_exact(self):
        valid = "package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000414' versionName='0.1.7-zh.1'\nnative-code: 'arm64-v8a'\n"
        signer.check_badging(valid)
        for wrong in [valid.replace('1000414','10103'), valid.replace('arm64-v8a','x86_64'), valid.replace("'arm64-v8a'", "'arm64-v8a' 'armeabi-v7a'")]:
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
                return "package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000414' versionName='0.1.7-zh.1'\nnative-code: 'arm64-v8a'\n"
            return ''
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); work=root/'work';work.mkdir();output=root/'output';inp=root/'input.json'
            m=self.manifest();m['candidate_unsigned_apk_sha256']=hashlib.sha256(b'PUBLIC MOCK UNSIGNED').hexdigest();m['candidate_unsigned_apk_size']=len(b'PUBLIC MOCK UNSIGNED');inp.write_text(json.dumps(m))
            unsigned=work/'reviewed-unsigned.apk';unsigned.write_bytes(b'PUBLIC MOCK UNSIGNED')
            proof={**m,'unsigned_apk_sha256':signer.digest(unsigned),'certificate_sha256':signer.CERT,'recovery_run_id':signer.RECOVERY_RUN}
            (work/'reviewed-provenance.json').write_text(json.dumps(proof))
            with patch.dict(os.environ,{'ANDROID_KEYSTORE_BASE64':base64.b64encode(data).decode(),'ANDROID_KEYSTORE_PASSWORD':'PUBLIC-NOT-A-SECRET-'*3}), patch.object(signer,'KEY_HASH',expected_hash), patch.object(signer,'tools',return_value=Path('/PUBLIC-MOCK-TOOLS')), patch.object(signer,'run',side_effect=fake), patch.object(signer.subprocess,'run',side_effect=AssertionError('Real tool execution forbidden')):
                signer.sign(inp,work,output)
            self.assertEqual({x.name for x in output.iterdir()},{signer.APK_NAME,'BUILD-PROVENANCE.json','SHA256SUMS.txt'})
            self.assertFalse((work/'signing-only.p12').exists())
            self.assertFalse((work/'aligned.apk').exists())
            report=json.loads((output/'BUILD-PROVENANCE.json').read_text())
            self.assertEqual(report['source_sha'],signer.SOURCE_SHA)
            self.assertEqual(report['candidate_artifact_sha256'],m['candidate_artifact_zip_sha256'])
            self.assertEqual(report['version_code'],1000414)
            self.assertEqual(len((output/'SHA256SUMS.txt').read_text().splitlines()),2)
            self.assertNotIn('PUBLIC-NOT-A-SECRET-',repr(commands))


if __name__ == '__main__':
    unittest.main()



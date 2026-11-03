"""All fixtures are public mock bytes; no network, keys, signing or writes to GitHub."""
import copy
import json
import io
import zipfile
from types import SimpleNamespace
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

import retry_provenance as p
from retry_fixture import FakeApi, fixture, signed_fixture
import sign_reviewed as signer


class RetryProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.data=fixture(); self.m=self.data['manifest']; self.api=FakeApi(self.data)
        self.prefix='/actions/runs/'+str(self.m['candidate_run_id'])
    def snapshot(self):return p.collect_snapshot(self.api,self.m,signer.JOBS)
    def page(self,n=2):return self.data['routes'][self.prefix+'/attempts/'+str(n)+'/jobs?per_page=100']
    def test_prior_cancelled_then_latest_success_all_twenty_two(self):
        s=self.snapshot();self.assertEqual(len(s['latest_jobs']),22)
        self.assertEqual({j['run_attempt'] for j in s['latest_jobs']},{1,2})
        arm=next(j for j in s['latest_jobs'] if j['name']=='Desktop mac arm64 (integrity checked)')
        self.assertEqual(arm['run_attempt'],2)
    def test_latest_failure_cancel_skipped_pending_rejected_for_every_gate(self):
        for name in signer.JOBS:
            for status,conclusion in [('completed','failure'),('completed','cancelled'),('completed','skipped'),('queued',None),('in_progress',None)]:
                with self.subTest(name=name,status=status,conclusion=conclusion):
                    data=fixture();page=data['routes'][self.prefix+'/attempts/2/jobs?per_page=100']
                    found=[j for j in page['jobs'] if j['name']==name]
                    if not found:
                        job=copy.deepcopy(next(j for j in data['routes'][self.prefix+'/attempts/1/jobs?per_page=100']['jobs'] if j['name']==name))
                        job.update(id=900,run_attempt=2);page['jobs'].append(job);page['total_count']+=1
                    else:job=found[0]
                    job.update(status=status,conclusion=conclusion)
                    with self.assertRaises(ValueError):p.collect_snapshot(FakeApi(data),data['manifest'],signer.JOBS)
    def test_missing_every_gate_is_rejected(self):
        for name in signer.JOBS:
            data=fixture()
            for n in (1,2):
                page=data['routes'][self.prefix+'/attempts/'+str(n)+'/jobs?per_page=100'];page['jobs']=[j for j in page['jobs'] if j['name']!=name];page['total_count']=len(page['jobs'])
            with self.subTest(name=name),self.assertRaises(ValueError):p.collect_snapshot(FakeApi(data),data['manifest'],signer.JOBS)
    def test_duplicate_job_or_execution_or_truncated_page(self):
        for mutation in ('name','id','count','missing-attempt','wrong-attempt'):
            with self.subTest(mutation=mutation):
                self.setUp();page=self.page()
                if mutation=='name':page['jobs'][1]['name']=page['jobs'][0]['name']
                elif mutation=='id':page['jobs'][0]['id']=self.page(1)['jobs'][0]['id']
                elif mutation=='count':page['total_count']+=1
                elif mutation=='missing-attempt':page['jobs']=[];page['total_count']=0
                elif mutation=='wrong-attempt':page['jobs'][0]['run_attempt']=1
                with self.assertRaises(ValueError):self.snapshot()
    def test_cross_run_sha_and_workflow_event(self):
        for field,value in [('run_id',7),('head_sha','2'*40),('run_attempt',3)]:
            self.setUp();self.page()['jobs'][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):self.snapshot()
        for field,value in [('id',7),('head_sha','2'*40),('workflow_id',9),('path','evil.yml'),('event','workflow_dispatch'),('head_branch','main')]:
            self.setUp();self.data['routes'][self.prefix+'/attempts/1'][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):self.snapshot()
    def test_only_observed_old_nonexecuting_placeholders_ignored(self):
        for mutation in ('name','runner','steps','labels','conclusion','time','current-attempt'):
            self.setUp();j=next(j for j in self.page(1)['jobs'] if j['name'] in p.OLD_MATRIX_PLACEHOLDERS)
            if mutation=='name':j['name']='Unknown skipped matrix'
            elif mutation=='runner':j['runner_id']=0
            elif mutation=='steps':j['steps']=[{}]
            elif mutation=='labels':j['labels']=['ubuntu-24.04']
            elif mutation=='conclusion':j['conclusion']='success'
            elif mutation=='time':j['completed_at']='2026-11-02T00:16:00Z'
            else:
                self.page(1)['jobs'].remove(j);self.page(1)['total_count']-=1;j['run_attempt']=2;self.page()['jobs'].append(j);self.page()['total_count']+=1
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):self.snapshot()
    def test_needs_dag_rejects_new_source_bundle_or_desktop_with_old_descendants(self):
        for name in ('Validate exact source','Build validated desktop bundle','Desktop win x64 (integrity checked)',p.ANDROID_JOB):
            self.setUp();j=next(j for j in self.page(1)['jobs'] if j['name']==name)
            if name==p.ANDROID_JOB: # Android newer than bundle is fine, but an impossible earlier execution is not.
                j['started_at']='2026-11-02T00:00:00Z'
            else:j['completed_at']='2026-11-02T01:00:00Z'
            with self.subTest(name=name),self.assertRaises(ValueError):self.snapshot()
    def test_same_second_old_clean_cannot_follow_new_producer_attempt(self):
        latest={j['name']:j for j in self.snapshot()['latest_jobs']}
        clean=latest['Clean desktop nsis first start'];producer=latest['Desktop mac arm64 (integrity checked)']
        clean['run_attempt']=1;clean['started_at']=producer['completed_at']
        with self.assertRaisesRegex(ValueError,'Stale downstream'):p.check_needs(latest)

    def test_head_and_workflow_blob_drift(self):
        self.data['routes']['/git/ref/heads/'+p.BRANCH]['object']['sha']='f'*40
        with self.assertRaisesRegex(ValueError,'HEAD'):self.snapshot()
        self.setUp();self.data['routes']['/contents/'+p.WORKFLOW+'?ref='+self.m['candidate_source_sha']]['content']='Zm9yZ2Vk'
        with self.assertRaisesRegex(ValueError,'blob'):self.snapshot()
    def test_snapshot_rerun_and_head_race(self):
        original=self.api.json;calls={}
        def racing(path):
            calls[path]=calls.get(path,0)+1;r=original(path)
            if path==self.prefix and calls[path]>1:r['run_attempt']=3
            return r
        with patch.object(self.api,'json',side_effect=racing),self.assertRaisesRegex(ValueError,'race'):self.snapshot()
        calls={}
        def head_racing(path):
            calls[path]=calls.get(path,0)+1;r=original(path)
            if path.startswith('/git/ref') and calls[path]>1:r['object']['sha']='2'*40
            return r
        with patch.object(self.api,'json',side_effect=head_racing),self.assertRaisesRegex(ValueError,'race'):self.snapshot()
    def test_artifact_id_run_sha_digest_expiry_and_name(self):
        good=self.data['routes']['/actions/artifacts/1'];p.artifact_view(good,self.m)
        for field,value in [('id',2),('name','old'),('digest','sha256:'+'b'*64),('expired',True),('expires_at','2020-01-01T00:00:00Z'),('size_in_bytes',0)]:
            with self.subTest(field=field),self.assertRaises(ValueError):p.artifact_view(dict(good,**{field:value}),self.m)
        for field,value in [('id',3),('head_sha','3'*40),('head_branch','main')]:
            bad=copy.deepcopy(good);bad['workflow_run'][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):p.artifact_view(bad,self.m)
    def receipt(self,log=None):return p.producer_receipt((log or self.data['log']).encode(),self.snapshot(),self.data['routes']['/actions/artifacts/1'],self.m)
    def test_producer_receipt_is_bound_to_latest_exact_job_attempt_and_log(self):
        r=self.receipt();self.assertEqual(r['run_attempt'],1);self.assertEqual(r['artifact_id'],1);self.assertEqual(r['log_sha256'],p.sha256(self.data['log'].encode()))
        for field,value in [('candidate_producer_job_id',999),('candidate_producer_attempt',2)]:
            self.setUp();self.m[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):self.receipt()
    def test_forged_or_mixed_receipt_cannot_pass_even_if_log_hash_is_reviewed(self):
        mutations=[lambda x:x.replace('Artifact ID 1','Artifact ID 2'),
                   lambda x:x.replace('Artifact ID is 1','Artifact ID is 2'),
                   lambda x:x.replace('a'*64,'b'*64),
                   lambda x:x.replace('/runs/10000000000/','/runs/99999999999/'),
                   lambda x:x.replace(p.UPLOAD_SHA,'f'*40),
                   lambda x:x.replace('  overwrite: false','  overwrite: true'),
                   lambda x:x.replace('##[group]Run actions/upload-artifact@v7','##[group]Run echo fake receipt'),
                   lambda x:x.replace('Finalizing artifact upload','##[group]Run actions/upload-artifact@v7'),
                   lambda x:x+x.splitlines(keepends=True)[-1],
                   lambda x:x.replace('SHA256 digest of uploaded artifact is ','echo SHA256 digest of uploaded artifact is ')]
        for i,mutate in enumerate(mutations):
            self.setUp();log=mutate(self.data['log']);self.m['candidate_producer_log_sha256']=p.sha256(log.encode())
            with self.subTest(case=i),self.assertRaises(ValueError):self.receipt(log)
    def test_old_artifact_after_android_rerun_is_rejected(self):
        j=next(j for j in self.page()['jobs'] if j['name']==p.ANDROID_JOB)
        j.update(started_at='2026-11-02T00:20:00Z',completed_at='2026-11-02T00:21:00Z',created_at='2026-11-02T00:20:00Z',runner_group_id=0)
        for step in j['steps']:step.update(started_at='2026-11-02T00:20:01Z',completed_at='2026-11-02T00:20:02Z')
        with self.assertRaisesRegex(ValueError,'producer'):self.receipt()
    def test_log_transport_is_github_job_id_only_and_rejects_foreign_redirect(self):
        error=urllib.error.HTTPError('https://api.github.com/',302,'',{'Location':'https://evil.example/log'},None)
        with patch.dict('os.environ',{'GITHUB_TOKEN':'PUBLIC-MOCK-READ-TOKEN'}),patch('urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect=error
            api=signer.Api()
            with self.assertRaisesRegex(ValueError,'storage host'):api.job_log(123)
            request=opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url,'https://api.github.com/repos/'+p.REPO+'/actions/jobs/123/logs')
    def test_receipt_rejects_old_metadata_late_duplicate_and_outside_setup(self):
        for mutation in ('old-created','late-duplicate','setup-window','unordered','input-receipt','second-endgroup'):
            self.setUp();log=self.data['log'];artifact=self.data['routes']['/actions/artifacts/1']
            if mutation=='old-created':artifact['created_at']='2020-01-01T00:00:00Z'
            elif mutation=='late-duplicate':log+=log.splitlines(keepends=True)[-1].replace('/artifacts/1','/artifacts/99')
            elif mutation=='setup-window':
                job=next(j for j in self.page(1)['jobs'] if j['name']==p.ANDROID_JOB);job['steps'][0]['started_at']=job['steps'][0]['completed_at']
            elif mutation=='unordered':
                lines=log.splitlines(keepends=True);lines[-1],lines[0]=lines[0],lines[-1];log=''.join(lines)
            elif mutation=='input-receipt':log=log.replace('##[endgroup]','')+'\n'
            else:log+=log.splitlines(keepends=True)[-1].split('Z ',1)[0]+'Z ##[endgroup]\n'
            self.m['candidate_producer_log_sha256']=p.sha256(log.encode())
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):self.receipt(log)
    def test_infrastructure_retry_authorization_is_required_and_exact(self):
        for mutation in ('none','unknown-id','wrong-hash','annotation-hash','annotation-text','ordinary-failure','started-cancellation','boolean-runner'):
            self.setUp();authorization=self.m['candidate_retry_authorizations'][0]
            job=next(j for j in self.page(1)['jobs'] if j['id']==authorization['job_id'])
            if mutation=='none':self.m['candidate_retry_authorizations']=[]
            elif mutation=='unknown-id':authorization['job_id']=998
            elif mutation=='wrong-hash':authorization['job_snapshot_sha256']='f'*64
            elif mutation=='annotation-hash':authorization['capacity_annotations_sha256']='f'*64
            elif mutation=='annotation-text':
                annotations=self.data['routes']['/check-runs/400/annotations?per_page=100'];annotations[0]['message']='Manual cancellation, not capacity'
                authorization['capacity_annotations_sha256']=p.sha256(p.canonical(annotations))
            elif mutation=='ordinary-failure':job['conclusion']='failure';authorization['job_snapshot_sha256']=p.sha256(p.canonical(job))
            elif mutation=='boolean-runner':job['runner_id']=False;authorization['job_snapshot_sha256']=p.sha256(p.canonical(job))
            else:job['runner_id']=42;job['steps']=[{}];authorization['job_snapshot_sha256']=p.sha256(p.canonical(job))
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):self.snapshot()
    def test_publisher_fixture_is_the_python_contract(self):
        saved=json.loads(Path(__file__).with_name('retry-fixture.json').read_text())
        self.assertEqual(saved,signed_fixture())

    def test_actual_prepare_entrypoint_and_late_snapshot_race(self):
        def zip_bytes(entries):
            stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w') as archive:
                for name,data in entries.items():archive.writestr(name,data)
            return stream.getvalue()
        for race in (False,True):
            self.setUp()
            candidate=zip_bytes({signer.UNSIGNED_APK_NAME:b'PUBLIC UNSIGNED MOCK APK','SIGNING-BLOCKER.txt':b'PUBLIC MOCK'})
            candidate_hash=p.sha256(candidate)
            self.m['candidate_artifact_zip_sha256']=candidate_hash
            self.data['log']=self.data['log'].replace('a'*64,candidate_hash)
            self.data['routes']['/actions/artifacts/1']['digest']='sha256:'+candidate_hash
            self.data['routes']['/actions/artifacts/1']['size_in_bytes']=len(candidate)
            self.data['log']=self.data['log'].replace('12345 bytes',str(len(candidate))+' bytes')
            recovery=zip_bytes({'recovery-report.json':json.dumps(dict(certificate_sha256=signer.CERT,encrypted_container_sha256=signer.KEY_HASH,imported_backup_private_key_recovery_verified=True)).encode()})
            recovery_hash=p.sha256(recovery)
            self.data['routes']['/actions/runs/'+str(signer.RECOVERY_RUN)]=dict(status='completed',conclusion='success',head_branch='signing/android-bootstrap',head_sha='8fc8b21abd2380926242fc49e7f488cb4b3aa0b8',repository={'full_name':p.REPO},path='.github/workflows/android-signing-recovery.yml')
            self.data['routes']['/actions/runs/'+str(signer.RECOVERY_RUN)+'/artifacts?per_page=100']={'artifacts':[dict(id=signer.RECOVERY_ARTIFACT,name='android-public-recovery-evidence-'+str(signer.RECOVERY_RUN),expired=False,digest='sha256:'+recovery_hash)]}
            downloaded=[]
            def download(artifact_id,destination):
                downloaded.append(artifact_id);Path(destination).write_bytes(recovery if artifact_id==signer.RECOVERY_ARTIFACT else candidate)
            self.api.download=download
            original=self.api.json;reads=0
            def changing(path):
                nonlocal reads
                result=original(path)
                if path=='/actions/artifacts/1':
                    reads+=1
                    if race and reads==2:self.data['routes'][self.prefix]['run_attempt']=3
                return result
            self.api.json=changing
            with tempfile.TemporaryDirectory() as root:
                inp=Path(root)/'input.json';out=Path(root)/'prepared';inp.write_text(json.dumps(self.m))
                with patch.object(signer,'Api',return_value=self.api),patch.object(signer,'RECOVERY_ZIP_SHA256',recovery_hash),patch.object(signer,'tools',return_value=Path('/PUBLIC-MOCK-TOOLS')),patch.object(signer,'run',return_value="package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000413' versionName='0.1.6-zh.1'\nnative-code: 'arm64-v8a'\n"),patch.object(signer.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout='',stderr='DOES NOT VERIFY')):
                    if race:
                        with self.assertRaisesRegex(ValueError,'snapshot race'):signer.prepare(inp,out)
                        self.assertFalse((out/'reviewed-provenance.json').exists())
                    else:
                        signer.prepare(inp,out)
                        proof=json.loads((out/'reviewed-provenance.json').read_text())
                        p.check_prepared(proof,self.m,signer.JOBS)
                        self.assertEqual(proof['candidate_producer_log_sha256'],p.sha256(self.data['log'].encode()))
                        self.assertEqual(proof['producer_job_receipt']['artifact_id'],1)
                        self.assertEqual(proof['candidate_gates_snapshot']['retry_evidence'][0]['authorization']['job_id'],400)
                        self.assertEqual({x.name for x in out.iterdir()},{'reviewed-provenance.json','reviewed-unsigned.apk'})
                self.assertEqual(downloaded,[signer.RECOVERY_ARTIFACT,1])

    def test_reviewed_input_cannot_supply_fake_proof_or_normalized_log_hash(self):
        for field in ('candidate_producer_log_sha256','producer_job_receipt','candidate_gates_snapshot'):
            manifest=copy.deepcopy(self.m);manifest[field]='fake-external-proof'
            with tempfile.TemporaryDirectory() as root:
                path=Path(root)/'input.json';path.write_text(json.dumps(manifest))
                with self.subTest(field=field),self.assertRaisesRegex(ValueError,'Unexpected reviewed input'):signer.read_input(path)

    def test_disabled_prepare_stops_before_workspace_or_api(self):
        with tempfile.TemporaryDirectory() as d:
            input_path=Path(d)/'input.json';input_path.write_text('{"enabled":false}')
            out=Path(d)/'never-created'
            with patch.object(signer,'Api',side_effect=AssertionError('No API permitted')),self.assertRaises(ValueError):signer.prepare(input_path,out)
            self.assertFalse(out.exists())


if __name__=='__main__':unittest.main()

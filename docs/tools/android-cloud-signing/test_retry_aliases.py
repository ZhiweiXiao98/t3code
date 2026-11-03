"""Carry-forward API aliases are not new executions. Public offline mocks only."""
import copy
import io
import json
from pathlib import Path
import unittest
import urllib.error
from unittest.mock import patch
import retry_provenance as p
from retry_fixture import fixture, fixture_three_attempts, signed_fixture, FakeApi
import sign_reviewed as signer


class AliasTests(unittest.TestCase):
    def setUp(self):
        self.data=fixture();self.m=self.data['manifest'];self.api=FakeApi(self.data);self.prefix='/actions/runs/'+str(self.m['candidate_run_id'])
    def page(self,n):return self.data['routes'][self.prefix+'/attempts/'+str(n)+'/jobs?per_page=100']
    def snapshot(self):return p.collect_snapshot(self.api,self.m,signer.JOBS)
    def alias(self,name=p.ANDROID_JOB):return next(j for j in self.page(2)['jobs'] if j['name']==name)
    def original(self,name=p.ANDROID_JOB):return next(j for j in self.page(1)['jobs'] if j['name']==name)
    def test_fourteen_aliases_all_have_authenticated_log_equality(self):
        snapshot=self.snapshot();proofs=p.verify_alias_logs(self.api,snapshot)
        self.assertEqual(len(snapshot['job_aliases']),14);self.assertEqual(len(proofs),14)
        latest=next(j for j in snapshot['latest_jobs'] if j['name']==p.ANDROID_JOB)
        latest_api=next(j for j in snapshot['latest_api_jobs'] if j['name']==p.ANDROID_JOB)
        self.assertEqual(latest['id'],self.original()['id']);self.assertEqual(latest['run_attempt'],1)
        self.assertEqual(latest_api['id'],self.alias()['id']);self.assertEqual(latest_api['run_attempt'],2)
    def test_every_alias_must_be_present_in_current_attempt(self):
        for name in [j['name'] for j in self.page(1)['jobs'] if j['conclusion']=='success']:
            self.setUp();page=self.page(2);page['jobs']=[j for j in page['jobs'] if j['name']!=name];page['total_count']-=1
            with self.subTest(name=name),self.assertRaisesRegex(ValueError,'Current attempt'):self.snapshot()
    def test_identity_and_payload_changes_are_rejected(self):
        mutations=['node-empty','node-reused','url','check-url','html-url','created-before-attempt','runner-group','step-change','runner-change','cross-sha','unknown-one-side','unknown-both-sides','missing-field','head-branch','run-url']
        for mutation in mutations:
            self.setUp();alias=self.alias();original=self.original()
            if mutation=='node-empty':alias['node_id']=''
            elif mutation=='node-reused':alias['node_id']=original['node_id']
            elif mutation=='url':alias['url']=original['url']
            elif mutation=='check-url':alias['check_run_url']=original['check_run_url']
            elif mutation=='html-url':alias['html_url']=original['html_url']
            elif mutation=='created-before-attempt':alias['created_at']='2026-11-02T00:00:00Z'
            elif mutation=='runner-group':alias['runner_group_id']=999
            elif mutation=='step-change':alias['steps'][0]['name']='Different setup'
            elif mutation=='runner-change':alias['runner_id']=999
            elif mutation=='cross-sha':alias['head_sha']='f'*40
            elif mutation=='unknown-one-side':alias['unexpected']='same'
            elif mutation=='unknown-both-sides':alias['unexpected']=original['unexpected']='same'
            elif mutation=='missing-field':del alias['labels']
            elif mutation=='head-branch':alias['head_branch']='main'
            else:alias['run_url']='https://evil.example/run'
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):self.snapshot()
    def test_new_actual_cannot_relabel_old_step_times(self):
        alias=self.alias();alias['started_at']='2026-11-02T00:20:00Z';alias['completed_at']='2026-11-02T00:21:00Z'
        with self.assertRaisesRegex(ValueError,'Step outside'):self.snapshot()
    def test_alias_cannot_cross_missing_or_failed_intermediate_attempt(self):
        alias=copy.deepcopy(self.alias());original=self.original();run=copy.deepcopy(self.data['routes'][self.prefix+'/attempts/2'])
        alias['run_attempt']=3;alias['created_at']='2026-11-02T01:00:01Z';run['run_attempt']=3;run['run_started_at']='2026-11-02T01:00:00Z'
        with self.assertRaisesRegex(ValueError,'immediately preceding'):p.resolve_execution(alias,original,{original['id']:original},run)
        failed=copy.deepcopy(original);failed.update(run_attempt=2,conclusion='failure')
        with self.assertRaisesRegex(ValueError,'non-successful'):p.resolve_execution(alias,failed,{original['id']:original},run)
    def test_null_to_null_without_verified_previous_alias_is_not_admitted(self):
        previous=copy.deepcopy(self.alias());alias=copy.deepcopy(previous);alias.update(id=9999,node_id='new-node',run_attempt=3,created_at='2026-11-02T01:00:01Z')
        alias['url']='https://api.github.com/repos/'+p.REPO+'/actions/jobs/9999';alias['check_run_url']='https://api.github.com/repos/'+p.REPO+'/check-runs/9999';alias['html_url']='https://github.com/'+p.REPO+'/actions/runs/'+str(alias['run_id'])+'/job/9999'
        run=copy.deepcopy(self.data['routes'][self.prefix+'/attempts/2']);run.update(run_attempt=3,run_started_at='2026-11-02T01:00:00Z')
        with self.assertRaisesRegex(ValueError,'runner group'):p.resolve_execution(alias,previous,{previous['id']:previous},run)
    def test_every_alias_log_must_be_nonempty_and_byte_identical(self):
        snapshot=self.snapshot()
        for alias in snapshot['job_aliases']:
            for change in ('newline','empty','normalization'):
                data=fixture();api=FakeApi(data);original=api.job_log(alias['execution_job_id'])
                bad=original+b'\n' if change=='newline' else b'' if change=='empty' else original.replace(b'\r\n',b'\n') if b'\r\n' in original else original.replace(b'\n',b'\r\n')
                data['log_overrides']={alias['alias_job_id']:bad}
                with self.subTest(name=alias['job_name'],change=change),self.assertRaisesRegex(ValueError,'raw job logs'):p.verify_alias_logs(api,snapshot)
    def test_missing_log_is_not_replaced_by_metadata_or_receipt(self):
        snapshot=self.snapshot()
        with patch.object(self.api,'job_log',side_effect=ValueError('Authentic log unavailable')),self.assertRaises(ValueError):p.verify_alias_logs(self.api,snapshot)
    def test_fake_alias_log_proof_mapping_cannot_reach_sign(self):
        proof=signed_fixture()['manifest']
        for mutation in ('missing','id','hash','producer-hash'):
            wrong=copy.deepcopy(proof)
            if mutation=='missing':wrong['alias_log_proofs'].pop()
            elif mutation=='id':wrong['alias_log_proofs'][0]['alias_job_id']=999
            elif mutation=='hash':wrong['alias_log_proofs'][0]['log_sha256']='bad'
            else:
                record=next(x for x in wrong['alias_log_proofs'] if x['execution_job_id']==wrong['candidate_producer_job_id']);record['log_sha256']='f'*64
            wrong['alias_log_proofs_sha256']=p.sha256(p.canonical(wrong['alias_log_proofs']))
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):p.check_alias_log_proofs(wrong)
    def test_authenticated_transport_caches_immutable_job_bytes(self):
        error=urllib.error.HTTPError('https://api.github.com/',302,'',{'Location':'https://mock.blob.core.windows.net/job-log'},None)
        with patch.dict('os.environ',{'GITHUB_TOKEN':'PUBLIC-MOCK-TOKEN'}),patch('urllib.request.build_opener') as opener,patch('urllib.request.urlopen',return_value=io.BytesIO(b'PUBLIC\r\nRAW\nBYTES')) as fetch:
            opener.return_value.open.side_effect=error;api=signer.Api()
            first=api.job_log(123);second=api.job_log(123)
            self.assertEqual(first,b'PUBLIC\r\nRAW\nBYTES');self.assertEqual(first,second)
            self.assertEqual(opener.return_value.open.call_count,1);self.assertEqual(fetch.call_count,1)
            self.assertEqual(fetch.call_args.args[0],'https://mock.blob.core.windows.net/job-log')


    def test_observed_three_attempt_chain_resolves_only_to_original(self):
        data=fixture_three_attempts();m=data['manifest'];api=FakeApi(data)
        snapshot=p.collect_snapshot(api,m,signer.JOBS);proofs=p.verify_alias_logs(api,snapshot)
        self.assertEqual(len(snapshot['job_aliases']),28);self.assertEqual(len(proofs),28)
        self.assertEqual(len(snapshot['retry_evidence']),2)
        latest=next(j for j in snapshot['latest_jobs'] if j['name']==p.ANDROID_JOB)
        current=next(j for j in snapshot['latest_api_jobs'] if j['name']==p.ANDROID_JOB)
        self.assertEqual(latest['id'],m['candidate_producer_job_id']);self.assertEqual(latest['run_attempt'],1);self.assertEqual(current['run_attempt'],3)
        chain=[a for a in snapshot['job_aliases'] if a['job_name']==p.ANDROID_JOB]
        self.assertEqual([a['previous_run_attempt'] for a in chain],[1,2]);self.assertEqual({a['execution_job_id'] for a in chain},{m['candidate_producer_job_id']})
        saved=json.loads(Path(__file__).with_name('retry-fixture-attempt3.json').read_text())
        self.assertEqual(saved,signed_fixture(fixture_three_attempts()))
    def test_three_attempt_chain_rejects_missing_middle_failed_middle_and_wrong_root(self):
        for mutation in ('missing-middle','failed-middle','null-original','missing-first-authorization','missing-second-authorization','wrong-root-map'):
            data=fixture_three_attempts();m=data['manifest'];api=FakeApi(data);prefix='/actions/runs/'+str(m['candidate_run_id'])
            one=data['routes'][prefix+'/attempts/1/jobs?per_page=100'];two=data['routes'][prefix+'/attempts/2/jobs?per_page=100'];three=data['routes'][prefix+'/attempts/3/jobs?per_page=100']
            original=next(j for j in one['jobs'] if j['name']==p.ANDROID_JOB);previous=next(j for j in two['jobs'] if j['name']==p.ANDROID_JOB);current=next(j for j in three['jobs'] if j['name']==p.ANDROID_JOB)
            if mutation=='missing-middle':two['jobs'].remove(previous);two['total_count']-=1
            elif mutation=='failed-middle':
                previous.update(conclusion='failure',started_at='2026-11-02T00:20:00Z',completed_at='2026-11-02T00:21:00Z')
                for st in previous['steps']:st.update(started_at='2026-11-02T00:20:01Z',completed_at='2026-11-02T00:20:02Z')
            elif mutation=='null-original':original['runner_group_id']=None
            elif mutation=='missing-first-authorization':m['candidate_retry_authorizations'].pop(0)
            elif mutation=='missing-second-authorization':m['candidate_retry_authorizations'].pop()
            else:
                wrong_root=next(j for j in one['jobs'] if j['name']=='Validate exact source')
                with self.assertRaisesRegex(ValueError,'runner group'):p.resolve_execution(current,previous,{previous['id']:wrong_root},data['routes'][prefix+'/attempts/3'])
                continue
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):p.collect_snapshot(api,m,signer.JOBS)
    def test_three_attempt_every_original_intermediate_or_current_log_change_rejected(self):
        data=fixture_three_attempts();snapshot=p.collect_snapshot(FakeApi(data),data['manifest'],signer.JOBS)
        aliases=[a for a in snapshot['job_aliases'] if a['alias_run_attempt']==3]
        for alias in aliases:
            for role in ('execution_job_id','previous_job_id','alias_job_id'):
                fresh=fixture_three_attempts();api=FakeApi(fresh);job_id=alias[role]
                fresh['log_overrides']={job_id:api.job_log(job_id)+b'\nCHANGED RAW BYTES'}
                with self.subTest(name=alias['job_name'],role=role),self.assertRaisesRegex(ValueError,'raw job logs'):p.verify_alias_logs(api,snapshot)


    def test_nonproducer_multihop_log_proofs_cannot_disagree(self):
        proof=signed_fixture(fixture_three_attempts())['manifest']
        alias=next(a for a in proof['candidate_gates_snapshot']['job_aliases'] if a['job_name']=='Validate exact source' and a['alias_run_attempt']==3)
        log=next(row for row in proof['alias_log_proofs'] if row['alias_job_id']==alias['alias_job_id'])
        log['log_sha256']='f'*64;proof['alias_log_proofs_sha256']=p.sha256(p.canonical(proof['alias_log_proofs']))
        with self.assertRaisesRegex(ValueError,'Conflicting log hashes'):p.check_alias_log_proofs(proof)


    def test_boolean_runner_group_is_not_the_reviewed_integer_zero(self):
        self.original()['runner_group_id']=False
        with self.assertRaisesRegex(ValueError,'runner group'):self.snapshot()


if __name__=='__main__':unittest.main()

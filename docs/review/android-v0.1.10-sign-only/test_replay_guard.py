"""Synthetic REST snapshots only; no network or signing."""
import copy
import unittest
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit
import replay_guard as r

class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.sha='a'*40;self.rid=123
        owner={'login':r.OWNER,'id':r.OWNER_ID}
        repo={'full_name':r.REPO,'owner':owner}
        self.run={'id':self.rid,'workflow_id':r.WORKFLOW_ID,'path':r.WORKFLOW_PATH,'head_sha':self.sha,'head_branch':r.BRANCH,'event':'workflow_dispatch','run_attempt':1,'repository':repo,'head_repository':repo,'actor':owner,'triggering_actor':owner,'status':'in_progress','conclusion':None}
        self.env={'GITHUB_RUN_ID':str(self.rid),'GITHUB_REPOSITORY':r.REPO,'GITHUB_REF':r.REF,'GITHUB_SHA':self.sha,'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_RUN_ATTEMPT':'1'}
    def call(self,listing=None,current=None,final=None):
        api=Mock();api.json.side_effect=[current if current is not None else self.run,listing if listing is not None else {'total_count':1,'workflow_runs':[self.run]}, final if final is not None else self.run]
        result=r.guard(api,operation_sha=self.sha,env=self.env)
        return result,api
    def test_success_exact_query_and_no_mutation(self):
        result,api=self.call();self.assertTrue(result['observed_single_dispatch']);self.assertFalse(result['atomic_consumption_guaranteed'])
        query=api.json.call_args_list[1].args[0]
        self.assertEqual(urlsplit(query).path,'/actions/workflows/399155956/runs')
        self.assertEqual(parse_qs(urlsplit(query).query),{'head_sha':[self.sha],'event':['workflow_dispatch'],'per_page':['100']})
        self.assertEqual(api.method_calls,[unittest.mock.call.json('/actions/runs/123'),unittest.mock.call.json(query),unittest.mock.call.json('/actions/runs/123')])
    def test_every_other_run_blocks_regardless_status(self):
        for status in ('queued','in_progress','completed','waiting','requested','pending'):
            for conclusion in (None,'success','failure','cancelled','skipped','timed_out'):
                other=dict(self.run,id=124,status=status,conclusion=conclusion)
                with self.subTest(status=status,conclusion=conclusion),self.assertRaises(r.ReplayError):
                    self.call({'total_count':2,'workflow_runs':[self.run,other]})
    def test_incomplete_empty_duplicate_and_wrong_listing(self):
        cases=[{}, {'total_count':0,'workflow_runs':[]},{'total_count':2,'workflow_runs':[self.run]}, {'total_count':True,'workflow_runs':[self.run]}, {'total_count':100,'workflow_runs':[self.run]*100}, {'total_count':1,'workflow_runs':[dict(self.run,id=124)]}, {'total_count':2,'workflow_runs':[self.run,self.run]}, {'total_count':1,'workflow_runs':None}]
        for case in cases:
            with self.subTest(case=str(case)[:50]),self.assertRaises(r.ReplayError):self.call(case)
    def test_current_and_listing_identity_tamper(self):
        changes={'id':124,'workflow_id':1,'path':'wrong','head_sha':'b'*40,'head_branch':'main','event':'push','run_attempt':2,'status':'completed','conclusion':'success','repository':{},'head_repository':{},'actor':{},'triggering_actor':{}}
        for key,value in changes.items():
            bad=dict(self.run,**{key:value})
            for placement in ('current','listing','final'):
                with self.subTest(key=key,placement=placement),self.assertRaises(r.ReplayError):
                    if placement=='listing':self.call({'total_count':1,'workflow_runs':[bad]})
                    else:self.call(**{placement:bad})
        for field in ('actor','triggering_actor'):
            for identity in ({'login':r.OWNER,'id':1},{'login':'other','id':r.OWNER_ID},{'login':r.OWNER,'id':str(r.OWNER_ID)}):
                with self.subTest(field=field,identity=identity),self.assertRaises(r.ReplayError):self.call(current=dict(self.run,**{field:identity}))
    def test_env_and_transport_fail_closed(self):
        for key in self.env:
            old=self.env[key];self.env[key]='wrong'
            with self.subTest(key=key),self.assertRaises(r.ReplayError):self.call()
            self.env[key]=old
        for failure_at in range(3):
            api=Mock();seq=[self.run,{'total_count':1,'workflow_runs':[self.run]},self.run];seq[failure_at]=RuntimeError('request failed');api.json.side_effect=seq
            with self.assertRaises(r.ReplayError):r.guard(api,operation_sha=self.sha,env=self.env)

if __name__=='__main__':unittest.main()

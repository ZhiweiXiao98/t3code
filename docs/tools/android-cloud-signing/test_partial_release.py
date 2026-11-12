"""Only the owner's exact AppImage deferral is permitted; all other gates stay mandatory."""
import copy,unittest
import sign_reviewed as S
class PartialReleaseTests(unittest.TestCase):
 def jobs(self):
  return [dict(id=S.DEFERRED_JOB_ID if name==S.DEFERRED_APPIMAGE else i+1,name=name,status='completed',conclusion='failure' if name==S.DEFERRED_APPIMAGE else 'success',run_id=S.CANDIDATE_RUN,run_attempt=1,head_sha=S.SOURCE_SHA) for i,name in enumerate(sorted(S.JOBS))]
 def manifest(self):return dict(candidate_run_id=S.CANDIDATE_RUN,candidate_attempt=1,candidate_source_sha=S.SOURCE_SHA)
 def test_exact21success_and_known_failure(self):S.check_jobs(self.jobs(),self.manifest())
 def test_no_general_failure_exception(self):
  for name in S.JOBS-{S.DEFERRED_APPIMAGE}:
   jobs=self.jobs();next(j for j in jobs if j['name']==name)['conclusion']='failure'
   with self.subTest(name=name),self.assertRaises(ValueError):S.check_jobs(jobs,self.manifest())
 def test_changed_missing_or_rerun_deferred_job(self):
  for field,value in [('id',123),('conclusion','success'),('conclusion','skipped'),('conclusion','cancelled'),('status','in_progress'),('run_attempt',2),('head_sha','a'*40)]:
   jobs=self.jobs();next(j for j in jobs if j['name']==S.DEFERRED_APPIMAGE)[field]=value
   with self.subTest(field=field,value=value),self.assertRaises(ValueError):S.check_jobs(jobs,self.manifest())
  with self.assertRaises(ValueError):S.check_jobs([j for j in self.jobs() if j['name']!=S.DEFERRED_APPIMAGE],self.manifest())
 def test_duplicate_or_additional_job(self):
  jobs=self.jobs()
  for changed in [jobs+[copy.deepcopy(jobs[0])],[*jobs[:-1],copy.deepcopy(jobs[0])]]:
   with self.assertRaises(ValueError):S.check_jobs(changed,self.manifest())
 def test_provenance_does_not_claim_all_pass(self):
  self.assertEqual(S.PARTIAL_RELEASE['passed'],21);self.assertEqual(S.PARTIAL_RELEASE['total'],22);self.assertEqual(S.PARTIAL_RELEASE['deferred_conclusion'],'failure')

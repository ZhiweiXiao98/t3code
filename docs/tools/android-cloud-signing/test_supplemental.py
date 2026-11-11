"""Offline synthetic tests; no credentials, services or real coverage claims."""
import copy
import hashlib
import io
import json
from pathlib import Path
import unittest
import zipfile
import verify_supplemental as verifier


def fixture(transform=None, member="coverage-manifest.json"):
    manifest = json.loads(Path(__file__).with_name('synthetic-coverage-NOT-EVIDENCE.json').read_text())
    if transform: transform(manifest)
    report = json.dumps(manifest).encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z:
        z.writestr(member, report)
    raw = out.getvalue()
    pins = json.loads(Path(__file__).with_name('supplemental-pin.json').read_text())
    pins['source'].update(manifest['source']);pins['workflow']=manifest['workflow']
    pins['artifact'].update(id=123, size=len(raw), sha256=hashlib.sha256(raw).hexdigest(), manifest_sha256=hashlib.sha256(report).hexdigest(), producer_job_id=100+len(pins['required_jobs'])-1)
    w, a = pins['workflow'], pins['artifact']
    run = dict(id=w['run_id'],run_attempt=w['run_attempt'],head_sha=w['sha'],head_branch=w['branch'],path=w['path'],workflow_id=456,status='completed',conclusion='success',event='push',repository={'full_name':verifier.REPO,'private':False},head_repository={'full_name':verifier.REPO})
    jobs=[dict(id=100+i,name=name,run_id=w['run_id'],run_attempt=w['run_attempt'],head_sha=w['sha'],head_branch=w['branch'],status='completed',conclusion='success',started_at='2026-11-10T00:00:00Z',completed_at='2026-11-10T00:10:00Z',steps=[]) for i,name in enumerate(pins['required_jobs'])]
    jobs[-1]['steps']=[dict(name=a['upload_step_name'],status='completed',conclusion='success',started_at='2026-11-10T00:09:00Z',completed_at='2026-11-10T00:09:30Z')]
    artifact=dict(id=a['id'],name=a['name'],size_in_bytes=a['size'],digest='sha256:'+a['sha256'],expired=False,expires_at='2099-01-01T00:00:00Z',created_at='2026-11-10T00:09:15Z',updated_at='2026-11-10T00:09:15Z',workflow_run={'id':w['run_id'],'head_sha':w['sha'],'head_branch':w['branch']})
    data={'run':run,'jobs':jobs,'artifact':artifact,'workflow':{'id':456,'path':w['path']},'source_sha':pins['source']['sha'],'tree':pins['source']['tree'],'operation_sha':w['sha']}
    blobs={123:raw};logs={}
    def upload_log(pin):
        lines=['SHA256 digest of uploaded artifact is '+pin['sha256'],
               'Artifact '+pin['name']+' successfully finalized. Artifact ID '+str(pin['id']),
               'Artifact '+pin['name']+' has been successfully uploaded! Final size is '+str(pin['size'])+' bytes. Artifact ID is '+str(pin['id'])]
        content=''.join('2026-11-10T00:09:15.1234567Z '+line+'\n' for line in lines).encode()
        logs[pin['producer_job_id']]=content
        pin['producer_log_sha256']=hashlib.sha256(content).hexdigest()
    upload_log(pins['artifact'])
    data['raw_artifacts']={};data['reports']={};data['lanes']={lane['lane']:lane for lane in manifest['lanes']}
    for index,lane in enumerate(manifest['lanes']):
        job_index=pins['required_jobs'].index(lane['job_name'])
        reports=[];total=passed=skipped=0
        for file in lane['files']:
            assertions=[{'title':a['title'],'status':a['status'],'failureMessages':[]} for a in file['assertions']]
            reports.append({'name':'/repo/'+file['path'],'status':'passed','message':'','assertionResults':assertions})
            total+=len(assertions);passed+=sum(a['status']=='passed' for a in assertions);skipped+=sum(a['status']=='skipped' for a in assertions)
        report=json.dumps({'success':True,'numFailedTestSuites':0,'numTotalTests':total,'numPassedTests':passed,'numFailedTests':0,'numPendingTests':skipped,'numTodoTests':0,'testResults':reports}).encode()
        data['reports'][lane['lane']]=json.loads(report)
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:z.writestr('coverage-result.json',report)
        content=out.getvalue();ident=200+index
        pin=pins['raw_reports'][lane['lane']]
        pin.update(manifest_sha256=hashlib.sha256(report).hexdigest(),created_at='2026-11-10T00:09:15Z',id=ident,size=len(content),sha256=hashlib.sha256(content).hexdigest(),member_sha256=hashlib.sha256(report).hexdigest(),producer_job_id=100+job_index)
        blobs[ident]=content;upload_log(pin)
        data['raw_artifacts'][ident]={**copy.deepcopy(artifact),'id':ident,'name':pin['name'],'size_in_bytes':len(content),'digest':'sha256:'+pin['sha256']}
        jobs[job_index]['steps']=[{**jobs[-1]['steps'][0],'name':pin['upload_step_name']}]
    class Api:
        def __init__(self):self.reads=0
        def json(self,url):
            if url.endswith('/actions/runs/'+str(w['run_id'])):
                self.reads+=1
                result=copy.deepcopy(data['run'])
                if data.get('race') and self.reads>1:result['run_attempt']+=1
                return result
            if '/compare/' in url:return {'status':'ahead','merge_base_commit':{'sha':pins['source']['sha']},'files':[{'filename':w['path'],'status':'added'}]}
            if '/jobs?' in url:return {'total_count':len(data['jobs']),'jobs':copy.deepcopy(data['jobs'])}
            if '/actions/workflows/' in url:return copy.deepcopy(data['workflow'])
            if '/actions/artifacts/' in url:
                ident=int(url.rsplit('/',1)[-1]);return copy.deepcopy(data['artifact'] if ident==123 else data['raw_artifacts'][ident])
            if '/git/commits/' in url:return {'tree':{'sha':data['tree']}}
            if '/git/ref/heads/maintenance/' in url:return {'object':{'sha':data['source_sha']}}
            if '/git/ref/heads/validation/' in url:return {'object':{'sha':data['operation_sha']}}
            raise AssertionError(url)
        def download(self,ident,path):
            Path(path).write_bytes(blobs[ident] if not data.get('bad_download') else b'wrong')
        def download_log(self,ident,path):
            Path(path).write_bytes(logs[ident] if not data.get('bad_log') else b'wrong')
    return pins, data, Api()


class CoverageTransportTests(unittest.TestCase):
    def test_actual_semantics_through_transport(self):
        pins,data,api=fixture()
        result=verifier.verify(pins,api=api)
        self.assertEqual(result['source'],pins['source'])
        self.assertEqual(api.reads,2)

    def test_metadata_mutations_and_race_rejected(self):
        changes=[lambda d:d['run'].update(run_attempt=2),lambda d:d['run'].update(head_sha='c'*40),lambda d:d['run'].update(conclusion='failure'),lambda d:d['run']['repository'].update(private=True),lambda d:d['jobs'].pop(),lambda d:d['jobs'][0].update(conclusion='skipped'),lambda d:d['jobs'][0].update(run_attempt=2),lambda d:d['jobs'][1].update(name=d['jobs'][0]['name']),lambda d:d['artifact'].update(expired=True),lambda d:d['artifact'].update(expires_at='2020-01-01T00:00:00Z'),lambda d:d['artifact'].update(digest='sha256:'+'c'*64),lambda d:d['artifact'].update(created_at='2026-11-10T00:08:00Z'),lambda d:d['artifact']['workflow_run'].update(head_sha='c'*40),lambda d:d['workflow'].update(path='wrong'),lambda d:d.update(source_sha='c'*40),lambda d:d.update(tree='c'*40),lambda d:d.update(operation_sha='c'*40),lambda d:d.update(race=True),lambda d:d.update(bad_download=True),lambda d:d.update(bad_log=True),lambda d:d['jobs'][-1]['steps'][0].update(conclusion='failure')]
        for i,change in enumerate(changes):
            with self.subTest(i=i):
                pins,data,api=fixture();change(data)
                with self.assertRaises(ValueError):verifier.verify(pins,api=api)

    def test_null_pins_and_duplicate_json_rejected(self):
        pins=json.loads(Path(__file__).with_name('supplemental-pin.json').read_text());pins['artifact']['id']=None
        with self.assertRaises(ValueError):verifier.check_pins(pins)
        with self.assertRaisesRegex(ValueError,'Duplicate'):verifier.strict_json('{"a":1,"a":2}')

    def test_zip_paths_and_named_assertions_rejected(self):
        for member in ('../coverage-manifest.json', '/coverage-manifest.json', 'other.json'):
            pins,data,api=fixture(member=member)
            with self.subTest(member=member), self.assertRaises(ValueError):verifier.verify(pins,api=api)
        changes=[lambda m:m['lanes'][0]['files'][0]['assertions'].pop(),
                 lambda m:m['lanes'][0]['files'][0]['assertions'][0].update(status='skipped'),
                 lambda m:m['lanes'][2]['runtime'].update(platform='linux'),
                 lambda m:m['lanes'][1]['runtime'].update(has_socket_set_type_of_service=False),
                 lambda m:m['lanes'][0]['files'][0].update(sha256='c'*64)]
        for change in changes:
            pins,data,api=fixture(transform=change)
            with self.assertRaises(ValueError):verifier.verify(pins,api=api)

    def test_raw_named_results_cannot_disagree_with_manifest(self):
        pins,data,api=fixture()
        report=data['reports']['linux-node24'];lane=data['lanes']['linux-node24']
        verifier.check_raw_report(report,lane)
        pending=copy.deepcopy(report)
        for a in pending['testResults'][0]['assertionResults']:
            if a['status']=='skipped':a['status']='pending'
        verifier.check_raw_report(pending,lane)
        changes=[lambda r:r.update(numPassedTests=4),lambda r:r.update(success=False),
                 lambda r:r['testResults'][0]['assertionResults'][0].update(status='skipped'),
                 lambda r:r['testResults'][0]['assertionResults'][0].update(title='other'),
                 lambda r:r['testResults'][0]['assertionResults'][0].update(failureMessages=['failure']),
                 lambda r:r['testResults'][0].update(name='/repo/other.ts'),
                 lambda r:r['testResults'].append(r['testResults'][0])]
        for change in changes:
            item=copy.deepcopy(report);change(item)
            with self.assertRaises(ValueError):verifier.check_raw_report(item,lane)

    def test_bad_report_hash_rejected(self):
        pins,data,api=fixture();pins['artifact']['manifest_sha256']='c'*64
        with self.assertRaisesRegex(ValueError,'manifest digest'):verifier.verify(pins,api=api)


if __name__=='__main__':unittest.main()

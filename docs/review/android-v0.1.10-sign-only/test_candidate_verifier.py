"""Synthetic offline fixtures only; never evidence of a candidate or signer pass."""
import copy
import datetime as dt
import hashlib
import io
import json
import pathlib
import stat
import tempfile
import unittest
import warnings
import zipfile
from unittest.mock import patch
import candidate_verifier as v

PINS = json.loads((pathlib.Path(__file__).resolve().parents[1]/'draft/candidate-pins.json').read_text())
NOW = dt.datetime(2026,11,19,tzinfo=dt.timezone.utc)

def snapshot():
    c,a=PINS['candidate'],PINS['artifact']
    jobs=[dict(id=j['id'],name=j['name'],run_id=c['runId'],head_sha=c['sourceSha'],run_attempt=1,status='completed',conclusion='success',started_at=a['producerStartedAt'],completed_at=a['producerCompletedAt']) for j in PINS['requiredJobs']]
    next(j for j in jobs if j['id']==a['producerJobId'])['steps']=[dict(name='Run actions/upload-artifact@v7',status='completed',conclusion='success',started_at='2026-11-18T03:35:06Z',completed_at='2026-11-18T03:35:09Z')]
    return dict(repository=dict(full_name=PINS['repository'],private=False),
        run=dict(id=c['runId'],head_sha=c['sourceSha'],head_branch=c['branch'],workflow_id=c['workflowId'],run_attempt=1,status='completed',conclusion='success',run_started_at=c['runStartedAt'],event='push',path=c['workflowPath'],repository=dict(full_name=PINS['repository']),head_repository=dict(full_name=PINS['repository'])),
        workflow=dict(id=c['workflowId'],path=c['workflowPath']),commit=dict(sha=c['sourceSha'],commit=dict(tree=dict(sha=c['sourceTree']))),workflowFile=dict(path=c['workflowPath'],sha=c['workflowBlobSha'],type='file'),jobs=dict(total_count=25,jobs=jobs),
        artifact=dict(id=a['id'],name=a['name'],digest='sha256:'+a['zipSha256'],size_in_bytes=a['zipBytes'],expired=False,expires_at=a['expiresAt'],created_at='2026-11-18T03:35:09Z',updated_at='2026-11-18T03:35:09Z',workflow_run=dict(id=c['runId'],head_sha=c['sourceSha'],head_branch=c['branch'])))

class Metadata(unittest.TestCase):
    def test_positive(self):
        self.assertEqual(v.verify_snapshot(PINS,snapshot(),now=NOW)['result'],'verified_metadata_only')
    def test_tampering(self):
        cases=[('run','head_sha','0'*40),('run','id',1),('run','run_attempt',2),('run','conclusion','failure'),('run','head_branch','main'),('run','workflow_id',0),('run','run_started_at','2020-01-01T00:00:00Z'),('workflow','path','wrong'),('workflowFile','sha','0'*40),('artifact','id',1),('artifact','expired',True),('artifact','digest','sha256:'+'0'*64),('artifact','size_in_bytes',1),('artifact','created_at','2026-11-18T03:00:00Z'),('artifact','expires_at','2099-01-01T00:00:00Z'),('repository','private',True)]
        for section,key,value in cases:
            with self.subTest(section=section,key=key):
                s=snapshot();s[section][key]=value
                with self.assertRaises(v.VerificationError):v.verify_snapshot(PINS,s,now=NOW)
        for key,value in [('id',0),('name','wrong'),('run_attempt',2),('head_sha','0'*40),('run_id',1),('status','queued'),('conclusion','skipped'),('completed_at','2027-01-01T00:00:00Z')]:
            with self.subTest(job=key):
                s=snapshot();s['jobs']['jobs'][0][key]=value
                with self.assertRaises(v.VerificationError):v.verify_snapshot(PINS,s,now=NOW)
    def test_upload_interval(self):
        for mode in ['missing','duplicate','name','status','conclusion','start','end','created_before','created_after','updated_after','updated_before','updated_after_producer']:
            with self.subTest(mode=mode):
                s=snapshot();j=next(j for j in s['jobs']['jobs'] if j['id']==PINS['artifact']['producerJobId']);u=j['steps'][0]
                if mode=='missing':j['steps']=[]
                elif mode=='duplicate':j['steps'].append(copy.deepcopy(u))
                elif mode=='name':u['name']='Other upload'
                elif mode=='status':u['status']='in_progress'
                elif mode=='conclusion':u['conclusion']='skipped'
                elif mode=='start':u['started_at']='2026-11-18T03:35:05Z'
                elif mode=='end':u['completed_at']='2026-11-18T03:35:10Z'
                elif mode=='created_before':s['artifact']['created_at']='2026-11-18T03:35:05Z'
                elif mode=='created_after':s['artifact']['created_at']='2026-11-18T03:35:10Z'
                elif mode=='updated_after':s['artifact']['updated_at']='2026-11-18T03:35:10Z'
                elif mode=='updated_before':s['artifact']['updated_at']='2026-11-18T03:35:08Z'
                elif mode=='updated_after_producer':s['artifact']['updated_at']='2026-11-18T03:35:13Z'
                with self.assertRaises(v.VerificationError):v.verify_snapshot(PINS,s,now=NOW)

    def test_structural(self):
        for mode in ['missing','duplicate','tree','missing_field','artifact_run','naive','expired','pins']:
            with self.subTest(mode=mode):
                s=snapshot();p=copy.deepcopy(PINS);now=NOW
                if mode=='missing':s['jobs']['jobs'].pop()
                if mode=='duplicate':s['jobs']['jobs'][0]=s['jobs']['jobs'][1]
                if mode=='tree':s['commit']['commit']['tree']['sha']='0'*40
                if mode=='missing_field':del s['jobs']['jobs'][0]['run_attempt']
                if mode=='artifact_run':s['artifact']['workflow_run']['id']=1
                if mode=='naive':now=NOW.replace(tzinfo=None)
                if mode=='expired':now=dt.datetime(2027,1,1,tzinfo=dt.timezone.utc)
                if mode=='pins':p['enabled']=True
                with self.assertRaises(v.VerificationError):v.verify_snapshot(p,s,now=now)

class Archive(unittest.TestCase):
    def fixture(self,mode):
        p=copy.deepcopy(PINS);buf=io.BytesIO();ms=p['artifact']['members']
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
                for index,m in enumerate(ms):
                    b=('SYNTHETIC NOT APK '+m['name']).encode();m['bytes']=len(b);m['sha256']=hashlib.sha256(b).hexdigest();name=m['name']
                    if mode=='missing' and index==1:continue
                    if mode=='traversal' and index==0:name='../'+name
                    entry=zipfile.ZipInfo(name)
                    if mode=='symlink' and index==0:entry.external_attr=(stat.S_IFLNK|0o777)<<16
                    z.writestr(entry,b)
                if mode=='duplicate':z.writestr(ms[0]['name'],b'duplicate')
                if mode=='extra':z.writestr('extra',b'extra')
        raw=buf.getvalue();p['artifact']['zipBytes']=len(raw);p['artifact']['zipSha256']=hashlib.sha256(raw).hexdigest()
        if mode=='zip_hash':raw=raw[:-1]+bytes([raw[-1]^1])
        if mode=='member_hash':ms[0]['sha256']='0'*64
        if mode=='member_size':ms[0]['bytes']+=1
        if mode=='oversize':ms[0]['bytes']=v.MAX_MEMBER+1
        return p,raw
    def test_cases(self):
        for mode in ['positive','zip_hash','member_hash','member_size','duplicate','missing','extra','traversal','symlink','oversize','archive_symlink','pin_mutation']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as d:
                p,raw=self.fixture(mode);file=pathlib.Path(d)/'fixture.zip';file.write_bytes(raw)
                # Only tests replace the pinned canonical digest, for synthetic bytes.
                # Production API offers no caller bypass or synthetic mode.
                with patch.object(v,'PIN_DIGEST',v.canonical_digest(p)):
                    if mode=='archive_symlink':link=pathlib.Path(d)/'link.zip';link.symlink_to(file);file=link
                    if mode=='pin_mutation':p['artifact']['zipBytes']+=1
                    if mode=='positive':
                        r=v.verify_archive(p,file);self.assertEqual(len(r['members']),2);self.assertFalse(r['signingAuthorized'])
                    else:
                        with self.assertRaises(v.VerificationError):v.verify_archive(p,file)

if __name__=='__main__':unittest.main()

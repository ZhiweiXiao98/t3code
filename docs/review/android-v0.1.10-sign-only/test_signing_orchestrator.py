"""Offline mocks and synthetic public identity only; never executes signing."""
import base64
import datetime
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch, Mock
import urllib.error
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import signing_orchestrator as s

class OrchestratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
        cls.public=key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
    def setUp(self):
        self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup);self.root=Path(self.t.name)
        self.sha='a'*40
        self.config={'enabled':True,'recipientSpkiSha256':hashlib.sha256(self.public).hexdigest(),'recipientPublicKeySha256':hashlib.sha256(self.public).hexdigest()}
        self.env={'GITHUB_REPOSITORY':s.REPO,'GITHUB_REF':s.REF,'GITHUB_SHA':self.sha,'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_RUN_ATTEMPT':'1','T3_SIGNING_ENVIRONMENT':'android-signing','GITHUB_RUN_ID':'123'}
    def test_operation_binding(self):
        self.assertEqual(s.operation(self.config,self.public,self.sha,self.env)['operation_sha'],self.sha)
        for field in self.env:
            bad=self.env.copy();bad[field]='wrong'
            with self.subTest(field=field),self.assertRaises(ValueError):s.operation(self.config,self.public,self.sha,bad)
        for field,value in [('enabled',False),('recipientSpkiSha256','0'*64),('recipientPublicKeySha256','0'*64)]:
            bad=self.config.copy();bad[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):s.operation(bad,self.public,self.sha,self.env)
        with self.assertRaises(ValueError):s.operation(self.config,self.public,'',self.env)
    def test_prepare_initial_failure_cleanup(self):
        # Regression: initial API failure must not leave a preparation directory.
        work=self.root/'work'
        with patch.object(s,'snapshot',side_effect=ValueError('offline')):
            with self.assertRaises(ValueError):s.prepare(work,Mock(),{}, {})
        self.assertFalse(work.exists())
    def test_prepare_download_failure_cleanup(self):
        work=self.root/'work';api=Mock();api.download.side_effect=ValueError('download')
        with patch.object(s,'snapshot',return_value={}),patch.object(s,'recovery_metadata',return_value={}):
            with self.assertRaises(ValueError):s.prepare(work,api,{}, {})
        self.assertFalse(work.exists())
    def test_prepare_changed_metadata_cleanup(self):
        work=self.root/'work';api=Mock()
        with patch.object(s,'snapshot',side_effect=[{'a':1},{'a':2}]),patch.object(s,'recovery_metadata',return_value={}),patch.object(s,'recovery_bytes'),patch.object(s,'verify_archive'):
            with self.assertRaises(ValueError):s.prepare(work,api,{'artifact':{'id':1,'zipBytes':5}}, {})
        self.assertFalse(work.exists())
    def api(self,location='https://example.blob.core.windows.net/object?sig=synthetic'):
        api=s.Api('SYNTHETIC-NOT-A-SECRET')
        error=urllib.error.HTTPError(s.BASE,302,'redirect',{'Location':location},None)
        api.opener=Mock();api.opener.open.side_effect=[error,io.BytesIO(b'cipher')]
        return api
    def test_download_no_auth_on_object(self):
        api=self.api();dest=self.root/'download'
        api.download(1,dest,10)
        requests=[c.args[0] for c in api.opener.open.call_args_list]
        self.assertIn('Authorization',requests[0].headers)
        self.assertNotIn('Authorization',requests[1].headers)
        self.assertEqual(dest.read_bytes(),b'cipher')
        self.assertIsNone(s.RejectRedirect().redirect_request(None,None,302,'',{},'https://evil.invalid'))
    def test_download_wrong_hosts_and_size(self):
        for url in ['http://x.blob.core.windows.net/a','https://evil.invalid/a','https://x.blob.core.windows.net.evil.invalid/a','https://user:pw@x.blob.core.windows.net/a','https://x.blob.core.windows.net/a#x']:
            api=self.api(url)
            with self.subTest(url=url),self.assertRaises(ValueError):api.download(1,self.root/'d',10)
            self.assertEqual(api.opener.open.call_count,1)
        api=self.api()
        with self.assertRaises(ValueError):api.download(1,self.root/'d',1)
        self.assertFalse((self.root/'d').exists())
    def test_existing_download_never_deleted(self):
        dest=self.root/'existing';dest.write_bytes(b'owned-by-caller')
        with self.assertRaises(FileExistsError):self.api().download(1,dest,10)
        self.assertTrue(dest.exists(),'Existing destination must survive')
        self.assertEqual(dest.read_bytes(),b'owned-by-caller')
    def test_recovery_report_content(self):
        report={'certificate_sha256':s.CERT,'encrypted_container_sha256':s.CONTAINER,'imported_backup_private_key_recovery_verified':True}
        cases=[({},False),({'certificate_sha256':'0'*64},True),({'encrypted_container_sha256':'0'*64},True),({'imported_backup_private_key_recovery_verified':False},True)]
        for change,reject in cases:
            path=self.root/'recovery.zip'; obj=dict(report,**change)
            with zipfile.ZipFile(path,'w') as z:z.writestr('recovery-report.json',json.dumps(obj))
            with patch.object(s,'RECOVERY_DIGEST',hashlib.sha256(path.read_bytes()).hexdigest()):
                if reject:
                    with self.assertRaises(ValueError):s.recovery_bytes(path)
                else:s.recovery_bytes(path)
        for name in ('../recovery-report.json','wrong.json'):
            with zipfile.ZipFile(path,'w') as z:z.writestr(name,json.dumps(report))
            with patch.object(s,'RECOVERY_DIGEST',hashlib.sha256(path.read_bytes()).hexdigest()):
                with self.assertRaises(ValueError):s.recovery_bytes(path)

    def test_proof_stale_future_binding_and_bytes(self):
        work=self.root/'w';work.mkdir();proof={'binding':{},'candidate':{},'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        def save(): (work/'prepared.json').write_text(json.dumps(proof))
        save()
        with patch.object(s,'verify_snapshot'),patch.object(s,'verify_archive'),patch.object(s,'recovery_bytes'):
            self.assertEqual(s.load_prepared(work,{},{}),proof)
            for seconds in (-601,60):
                proof['preparedAt']=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=seconds)).isoformat();save()
                with self.assertRaises(ValueError):s.load_prepared(work,{}, {})
            proof['preparedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
            with self.assertRaises(ValueError):s.load_prepared(work,{}, {'changed':True})
        # No patching bytes check: a stale/wrong recovery ZIP must fail.
        bad=self.root/'bad.zip';bad.write_bytes(b'wrong')
        with self.assertRaises(ValueError):s.recovery_bytes(bad)

if __name__=='__main__':unittest.main()

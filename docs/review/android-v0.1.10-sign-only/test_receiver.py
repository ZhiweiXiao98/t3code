"""Synthetic transport + mocked SDK only; no real APK certificate acceptance."""
import base64
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import receiver as r
from encrypted_handoff import encrypt_handoff

class ReceiverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537,key_size=3072)
        cls.public = cls.key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
        cls.fp = hashlib.sha256(cls.public).hexdigest()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.keypath = self.root/'recipient.pem'
        self.keypath.write_bytes(self.key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())); self.keypath.chmod(0o600)
        self.env = self.root/'envelope.json'
        encrypt_handoff(b'synthetic non-APK bytes',self.public,self.env,allowed_fingerprints=[self.fp])
        self.raw = self.env.read_bytes(); self.sha = hashlib.sha256(self.raw).hexdigest()
        self.parent = self.root/'private'; self.parent.mkdir(mode=0o700)
        self.sdk = self.root/'sdk'; self.sdk.mkdir()
        self.sdk_pins={}
        for n in r.SDK_PINS:
            p=self.sdk/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('mock only');p.chmod(0o700)
            self.sdk_pins[n]=hashlib.sha256(p.read_bytes()).hexdigest()
        patcher=patch.object(r,'SDK_PINS',self.sdk_pins);patcher.start();self.addCleanup(patcher.stop)

    def receive(self):
        return r.receive_verified(self.env,self.keypath,reviewed_sha256=self.sha,recipient_spki_sha256=self.fp,trusted_sdk=self.sdk,private_parent=self.parent)

    def output(self,args):
        name=Path(args[0]).name
        if name=='apksigner':return 'Signer #1 certificate SHA-256 digest: '+r.CERT+'\n'
        if name=='aapt2':return "package: name='com.zhiweixiao.t3code.zhcn' versionCode='1000418' versionName='0.1.10-zh.1'\nnative-code: 'arm64-v8a'\n"
        return ''

    def test_roundtrip_and_cleanup(self):
        with patch.object(r,'run_tool',side_effect=self.output) as run:
            with self.receive() as apk:
                self.assertEqual(apk.read_bytes(),b'synthetic non-APK bytes')
                self.assertEqual(apk.stat().st_mode & 0o777,0o600)
            self.assertEqual(run.call_count,3)
        self.assertEqual(list(self.parent.iterdir()),[])
        with patch.object(r,'run_tool',side_effect=self.output):
            with self.assertRaises(RuntimeError):
                with self.receive():raise RuntimeError('consumer failed')
        self.assertEqual(list(self.parent.iterdir()),[])

    def test_transport_negatives_no_plaintext(self):
        original=json.loads(self.raw)
        mutations=[lambda x:x.update(extra='x'),lambda x:x.update(algorithm='other'),lambda x:x.update(format='other'),lambda x:x.update(recipientSpkiSha256='0'*64),lambda x:x.update(nonce='!'),lambda x:x.update(nonce=base64.b64encode(b'x').decode()),lambda x:x.update(wrappedKey=base64.b64encode(b'x'*384).decode()),lambda x:x.update(ciphertext=base64.b64encode(b'x'*40).decode()),lambda x:x.update(ciphertext=[])]
        raws=[]
        for mutate in mutations:
            obj=original.copy();mutate(obj);raws.append(json.dumps(obj).encode())
        raws.extend([b'{"format":"a","format":"b"}',b'[]',b'notjson'])
        for raw in raws:
            with self.subTest(raw=raw[:30]):
                self.env.write_bytes(raw);self.sha=hashlib.sha256(raw).hexdigest()
                with patch.object(r,'verify_apk') as sdk:
                    with self.assertRaises(ValueError):
                        with self.receive():self.fail('must not yield')
                    sdk.assert_not_called()
                self.assertEqual(list(self.parent.iterdir()),[])
        self.env.write_bytes(self.raw);self.sha='0'*64
        with self.assertRaises(ValueError):
            with self.receive():self.fail()

    def test_private_key_permissions_symlink_and_wrong_recipient(self):
        for mode in (0o644,0o400,0o666):
            self.keypath.chmod(mode)
            with self.assertRaises(ValueError):
                with self.receive():self.fail()
        self.keypath.chmod(0o600)
        other=rsa.generate_private_key(public_exponent=65537,key_size=3072)
        self.keypath.write_bytes(other.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
        with self.assertRaises(ValueError):
            with self.receive():self.fail()
        self.keypath.unlink();self.keypath.symlink_to(self.env)
        with self.assertRaises(OSError):
            with self.receive():self.fail()
        self.assertEqual(list(self.parent.iterdir()),[])

    def test_jar_tamper_rejected_before_execution(self):
        (self.sdk/'lib/apksigner.jar').write_text('tampered')
        with patch.object(r,'run_tool') as runner:
            with self.assertRaises(ValueError):
                with self.receive():self.fail()
            runner.assert_not_called()
        self.assertEqual(list(self.parent.iterdir()),[])

    def test_sdk_failures_remove_plaintext(self):
        cases=['certificate','package','abi','alignment','duplicate-cert','duplicate-package']
        for case in cases:
            def output(args):
                value=self.output(args);name=Path(args[0]).name
                if name=='apksigner' and case=='certificate':return value.replace(r.CERT,'0'*64)
                if name=='apksigner' and case=='duplicate-cert':return value+value
                if name=='aapt2' and case=='package':return value.replace('1000418','1000417')
                if name=='aapt2' and case=='abi':return value.replace("'arm64-v8a'","'arm64-v8a' 'x86_64'")
                if name=='aapt2' and case=='duplicate-package':return value+value
                if name=='zipalign' and case=='alignment':raise r.ReceiverError('tool failure')
                return value
            with self.subTest(case=case),patch.object(r,'run_tool',side_effect=output):
                with self.assertRaises(ValueError):
                    with self.receive():self.fail()
                self.assertEqual(list(self.parent.iterdir()),[])

if __name__=='__main__':unittest.main()

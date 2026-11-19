"""Synthetic in-memory recipient keys only; no community identity or APK used."""
import base64
import hashlib
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa,padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import encrypted_handoff as h

class Handoff(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private=[rsa.generate_private_key(public_exponent=65537,key_size=3072) for _ in range(2)]
        cls.der=[k.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo) for k in cls.private]
        cls.pem=[k.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo) for k in cls.private]
        cls.fingerprints=[hashlib.sha256(d).hexdigest() for d in cls.der]
    def decrypt_synthetic(self,data,key):
        # Test-only consumer: authenticate entirely before returning any plaintext.
        e=json.loads(data);self.assertEqual(set(e),{'format','algorithm','recipientSpkiSha256','wrappedKey','nonce','ciphertext'})
        self.assertEqual(e['format'],h.MAGIC);self.assertEqual(e['algorithm'],h.ALGORITHM)
        aad=h.canonical({k:e[k] for k in ('format','algorithm','recipientSpkiSha256')})
        content_key=key.decrypt(base64.b64decode(e['wrappedKey'],validate=True),padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=aad))
        return AESGCM(content_key).decrypt(base64.b64decode(e['nonce'],validate=True),base64.b64decode(e['ciphertext'],validate=True),aad)
    def test_roundtrip_and_integrity(self):
        payload=b'SYNTHETIC ONLY NOT APK\x00\xff'*100
        for public in (self.pem[0],self.der[0]):
            with tempfile.TemporaryDirectory() as d:
                dest=pathlib.Path(d)/'cipher.json';r=h.encrypt_handoff(payload,public,dest,allowed_fingerprints=[self.fingerprints[0]])
                raw=dest.read_bytes();self.assertFalse(r['senderAuthenticated']);self.assertNotIn(payload,raw)
                self.assertEqual(self.decrypt_synthetic(raw,self.private[0]),payload)
                with self.assertRaises(ValueError):self.decrypt_synthetic(raw,self.private[1])
                for field in ('ciphertext','nonce','wrappedKey','recipientSpkiSha256'):
                    e=json.loads(raw)
                    if field=='recipientSpkiSha256':e[field]=self.fingerprints[1]
                    else:
                        b=bytearray(base64.b64decode(e[field]));b[-1]^=1;e[field]=base64.b64encode(b).decode()
                    with self.assertRaises((ValueError,InvalidTag)):self.decrypt_synthetic(json.dumps(e).encode(),self.private[0])
                self.assertEqual(dest.stat().st_mode&0o777,0o600)
                self.assertEqual([p.name for p in pathlib.Path(d).iterdir()],['cipher.json'])
    def test_rejections(self):
        for case in ['wrong','multi_allow','multi_pem','multi_der','short','private_pem','private_der','empty','existing','symlink']:
            with self.subTest(case=case),tempfile.TemporaryDirectory() as d:
                dest=pathlib.Path(d)/'cipher';key=self.pem[0];allow=[self.fingerprints[0]];payload=b'synthetic'
                if case=='wrong':allow=[self.fingerprints[1]]
                elif case=='multi_allow':allow=self.fingerprints
                elif case=='multi_pem':key=b''.join(self.pem)
                elif case=='multi_der':key=b''.join(self.der)
                elif case=='short':allow=[self.fingerprints[0][-16:]]
                elif case.startswith('private_'):key=self.private[0].private_bytes(serialization.Encoding.PEM if case.endswith('pem') else serialization.Encoding.DER,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
                elif case=='empty':payload=b''
                elif case=='existing':dest.write_bytes(b'preserve')
                elif case=='symlink':dest.symlink_to(pathlib.Path(d)/'absent')
                with self.assertRaises(h.HandoffError):h.encrypt_handoff(payload,key,dest,allowed_fingerprints=allow)
                if case=='existing':self.assertEqual(dest.read_bytes(),b'preserve')
                elif case=='symlink':self.assertTrue(dest.is_symlink())
                else:self.assertEqual(list(pathlib.Path(d).iterdir()),[])
    def test_failure_cleanup_and_race(self):
        for case in ('encrypt','fsync','link','race'):
            with self.subTest(case=case),tempfile.TemporaryDirectory() as d:
                dest=pathlib.Path(d)/'cipher';original=h.os.link
                def race(src,dst):
                    pathlib.Path(dst).symlink_to(pathlib.Path(d)/'absent');return original(src,dst)
                if case=='encrypt':mock=patch.object(h.AESGCM,'encrypt',side_effect=RuntimeError('injected'))
                elif case=='fsync':mock=patch.object(h.os,'fsync',side_effect=OSError('injected'))
                else:mock=patch.object(h.os,'link',side_effect=race if case=='race' else OSError('injected'))
                with mock,self.assertRaises((RuntimeError,OSError)):
                    h.encrypt_handoff(b'synthetic',self.pem[0],dest,allowed_fingerprints=[self.fingerprints[0]])
                if case=='race':self.assertTrue(dest.is_symlink());dest.unlink()
                self.assertEqual(list(pathlib.Path(d).iterdir()),[])

if __name__=='__main__':unittest.main()

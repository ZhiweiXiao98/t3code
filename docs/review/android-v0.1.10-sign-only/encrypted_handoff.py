"""Recipient-only encrypted envelope. No signer, decryptor, network or publication.
Uses installed cryptography: RSA-OAEP/SHA256 wrapping + AES-256-GCM.
Fingerprint = SHA256 of canonical DER SubjectPublicKeyInfo (NOT OpenPGP).
Caller must authenticate the sole allowlisted recipient out of band.
"""
import base64
import hashlib
import json
import os
import pathlib
import re
import tempfile
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAX_PAYLOAD=128*1024*1024
MAX_PUBLIC_KEY=32*1024
MAGIC='t3-recipient-envelope-v1'
ALGORITHM='RSA-OAEP-SHA256+AES-256-GCM'

class HandoffError(ValueError):
    pass

def need(ok,message):
    if not ok:raise HandoffError(message)

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':')).encode('ascii')

def recipient_key(public_key,fingerprint):
    need(type(public_key) is bytes and 0<len(public_key)<=MAX_PUBLIC_KEY,'Public key size/type')
    need(isinstance(fingerprint,str) and re.fullmatch('[a-fA-F0-9]{64}',fingerprint) is not None,'Full SPKI SHA256 required')
    # Accept exactly ONE canonical SPKI PEM/DER public key; reject concatenated,
    # private, certificate, PKCS1 or trailing material before use.
    if public_key.startswith(b'-----'):
        match=re.fullmatch(rb'-----BEGIN PUBLIC KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END PUBLIC KEY-----\r?\n?',public_key)
        need(match is not None,'Exactly one SPKI public key required')
        try:der=base64.b64decode(re.sub(rb'\s',b'',match[1]),validate=True)
        except ValueError:raise HandoffError('Invalid public key encoding') from None
    else:der=public_key
    try:key=serialization.load_der_public_key(der)
    except (ValueError,TypeError):raise HandoffError('Invalid public key; private material not accepted') from None
    need(isinstance(key,rsa.RSAPublicKey) and key.key_size>=3072,'RSA >=3072-bit public recipient required')
    canonical_der=key.public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
    need(der==canonical_der,'Noncanonical or additional key material')
    actual=hashlib.sha256(canonical_der).hexdigest()
    need(actual==fingerprint.lower(),'Recipient fingerprint mismatch')
    return key,actual

def encrypt_handoff(payload,public_key,destination,*,allowed_fingerprints):
    """Only emits ciphertext; never writes/copies plaintext or private keys.
    Single reviewed recipient allowlist required; caller-owned bytes/memory cannot
    be reliably erased by Python. A successful output is NOT sender-authenticated.
    Caller must use a trusted, private destination directory. Existing destination
    (including symlinks) is never overwritten; partial temp output is cleaned.
    """
    need(type(payload) is bytes and 0<len(payload)<=MAX_PAYLOAD,'Payload size/type')
    need(isinstance(allowed_fingerprints,(list,tuple)) and len(allowed_fingerprints)==1,'Exactly one approved recipient required')
    key,fingerprint=recipient_key(public_key,allowed_fingerprints[0])
    dest=pathlib.Path(destination)
    need(dest.parent.is_dir() and not dest.exists() and not dest.is_symlink(),'New ciphertext destination required')
    header={'format':MAGIC,'algorithm':ALGORITHM,'recipientSpkiSha256':fingerprint}
    aad=canonical(header);content_key=os.urandom(32);nonce=os.urandom(12)
    wrapped=key.encrypt(content_key,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=aad))
    cipher=AESGCM(content_key).encrypt(nonce,payload,aad)
    envelope=canonical(dict(header,wrappedKey=base64.b64encode(wrapped).decode('ascii'),
                            nonce=base64.b64encode(nonce).decode('ascii'),
                            ciphertext=base64.b64encode(cipher).decode('ascii')))+b'\n'
    temporary=None
    try:
        fd,temporary=tempfile.mkstemp(prefix='.t3-encrypted-',dir=dest.parent)
        with os.fdopen(fd,'wb') as stream:
            os.fchmod(stream.fileno(),0o600);stream.write(envelope);stream.flush();os.fsync(stream.fileno())
        # Exclusive creation: a racing file/symlink is an error, never overwritten.
        os.link(temporary,dest)
    finally:
        if temporary is not None:pathlib.Path(temporary).unlink(missing_ok=True)
    return {'encrypted':True,'recipientSpkiSha256':fingerprint,'algorithm':ALGORITHM,
            'plaintextSha256':hashlib.sha256(payload).hexdigest(),
            'ciphertextSha256':hashlib.sha256(envelope).hexdigest(),'ciphertextBytes':len(envelope),
            'integrity':'AES-GCM authentication tag; recipient-bound OAEP label/AAD',
            'senderAuthenticated':False,'publicationPerformed':False}

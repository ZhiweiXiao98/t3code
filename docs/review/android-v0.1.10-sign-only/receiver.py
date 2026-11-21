"""Offline recipient API. No install/upload/network or original Android key handling.
Reviewed envelope digest and recipient fingerprint MUST arrive via a trusted channel.
SDK directory (including apksigner JAR/JRE) MUST be independently verified and immutable.
Only synthetic/mock tests have run; this is not real APK/device acceptance.
"""
import base64
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import subprocess
import tempfile
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from encrypted_handoff import ALGORITHM, MAGIC, MAX_PAYLOAD, canonical
from signer_adapter import SDK_PINS

CERT = '82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88'
MAX_ENVELOPE = (MAX_PAYLOAD + 16) * 4 // 3 + 16384

class ReceiverError(ValueError):
    pass

def require(ok, message):
    if not ok:
        raise ReceiverError(message)

def read_regular(path, limit, private=False):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= limit, 'File type/size')
        if private:
            require(stat.S_IMODE(info.st_mode) == 0o600 and info.st_uid == os.getuid(), 'Private key must be owned by caller and mode 0600')
        data = stream.read(limit + 1)
        require(0 < len(data) <= limit and len(data) == info.st_size, 'File size changed')
        return data

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate envelope field')
        result[key] = value
    return result

def decrypt(envelope, key_path, *, reviewed_sha256, recipient_spki_sha256):
    for digest in (reviewed_sha256, recipient_spki_sha256):
        require(type(digest) is str and re.fullmatch('[0-9a-f]{64}', digest), 'Full lowercase SHA256 required')
    require(type(envelope) is bytes and 0 < len(envelope) <= MAX_ENVELOPE, 'Envelope size/type')
    require(hashlib.sha256(envelope).hexdigest() == reviewed_sha256, 'Reviewed ciphertext digest mismatch')
    try:
        obj = json.loads(envelope.decode('ascii'), object_pairs_hook=unique_object)
    except (ValueError, UnicodeError):
        raise ReceiverError('Invalid JSON envelope') from None
    require(type(obj) is dict and set(obj) == {'format','algorithm','recipientSpkiSha256','wrappedKey','nonce','ciphertext'}, 'Exact envelope schema required')
    require(all(type(v) is str for v in obj.values()), 'String fields required')
    require(obj['format'] == MAGIC and obj['algorithm'] == ALGORITHM and obj['recipientSpkiSha256'] == recipient_spki_sha256, 'Envelope identity mismatch')
    decoded = {}
    for name in ('wrappedKey', 'nonce', 'ciphertext'):
        try:
            value = base64.b64decode(obj[name], validate=True)
        except ValueError:
            raise ReceiverError('Invalid base64') from None
        require(base64.b64encode(value).decode('ascii') == obj[name], 'Noncanonical base64')
        decoded[name] = value
    require(len(decoded['nonce']) == 12 and 16 < len(decoded['ciphertext']) <= MAX_PAYLOAD + 16, 'Cipher sizes')
    raw_key = read_regular(key_path, 32768, private=True)
    try:
        key = serialization.load_pem_private_key(raw_key, password=None)
    except (ValueError, TypeError):
        raise ReceiverError('Expected local unencrypted PKCS8 PEM recipient key') from None
    require(isinstance(key, rsa.RSAPrivateKey) and key.key_size >= 3072, 'RSA >=3072 required')
    require(raw_key == key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()), 'Exactly one canonical PKCS8 recipient key required')
    public = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    require(hashlib.sha256(public).hexdigest() == recipient_spki_sha256, 'Wrong recipient key')
    require(len(decoded['wrappedKey']) == key.key_size // 8, 'Wrapped key size')
    aad = canonical({k:obj[k] for k in ('format','algorithm','recipientSpkiSha256')})
    try:
        content_key = key.decrypt(decoded['wrappedKey'], padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=aad))
        require(len(content_key) == 32, 'Content key size')
        return AESGCM(content_key).decrypt(decoded['nonce'], decoded['ciphertext'], aad)
    except Exception:
        raise ReceiverError('Envelope authentication failed') from None

def run_tool(args):
    # No shell or inherited credentials. SDK/JRE must be trusted, not candidate code.
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True,
                            timeout=180, env={'PATH':'/usr/bin:/bin', 'LANG':'C.UTF-8'})
    require(result.returncode == 0, 'SDK verification failed; output withheld')
    return result.stdout + result.stderr

def verify_apk(apk, sdk):
    require(sys.platform == 'linux', 'Only the reviewed Linux SDK is supported')
    sdk = Path(sdk).resolve(strict=True)
    for name, expected in SDK_PINS.items():
        tool = sdk / name
        require(not any(p.is_symlink() for p in [tool, *list(tool.parents)[:len(Path(name).parts)-1]]), 'SDK symlink rejected')
        fd = os.open(tool, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as stream:
            require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), 'SDK regular file required')
            digest = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        require(digest.hexdigest() == expected, 'Fixed Linux SDK hash mismatch')
    require(not (sdk/'apksigner.jar').exists() and not (sdk/'apksigner.jar').is_symlink(), 'Alternate signer JAR rejected')
    for name in ('apksigner','aapt2','zipalign'):
        tool = sdk / name
        require(tool.is_file() and not tool.is_symlink() and os.access(tool, os.X_OK), 'Trusted SDK executable required')
    output = run_tool([sdk/'apksigner', 'verify', '--verbose', '--print-certs', apk])
    certs = re.findall(r'^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})\s*$', output, re.M)
    require([c.lower() for c in certs] == [CERT], 'Expected sole community signing certificate')
    text = run_tool([sdk/'aapt2', 'dump', 'badging', apk])
    packages = re.findall(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'(?: .*)?$", text, re.M)
    require(packages == [('com.zhiweixiao.t3code.zhcn','1000418','0.1.10-zh.1')], 'Package/version mismatch')
    require(re.findall(r'^native-code:\s*(.*)$', text, re.M) == ["'arm64-v8a'"], 'ABI mismatch')
    run_tool([sdk/'zipalign', '-c', '-P', '16', '4', apk])

@contextlib.contextmanager
def receive_verified(envelope_path, key_path, *, reviewed_sha256, recipient_spki_sha256, trusted_sdk, private_parent):
    """Yield verified temporary APK path; remove on exit/error. Never installs.
    Trusted private parent must be caller-owned 0700, not shared/adversarial.
    Caller must not retain/upload yielded plaintext. Memory wiping not guaranteed.
    """
    parent = Path(private_parent)
    info = parent.lstat()
    require(stat.S_ISDIR(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o700 and info.st_uid == os.getuid(), 'Private parent must be owned mode 0700 directory')
    plaintext = decrypt(read_regular(envelope_path, MAX_ENVELOPE), key_path, reviewed_sha256=reviewed_sha256, recipient_spki_sha256=recipient_spki_sha256)
    with tempfile.TemporaryDirectory(prefix='.t3-receiver-', dir=parent) as work:
        apk = Path(work)/'candidate.apk'
        fd = os.open(apk, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(plaintext)
        verify_apk(apk, trusted_sdk)
        yield apk

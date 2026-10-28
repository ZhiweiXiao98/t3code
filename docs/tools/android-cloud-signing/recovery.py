"""Recover the fixed owner-imported encrypted identity; never generate a key."""
import base64
import binascii
import datetime as dt
import hashlib
import json
import os
from pathlib import Path

import crypto

KEYSTORE_ENV = 'ANDROID_KEYSTORE_BASE64'
CONTAINER_SHA256 = '7e4922f7de02c1c739e627eb3ef87fa1fb639329ed27613dff8b4f0fdad2d397'
CERTIFICATE_SHA256 = '82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88'


def _write_private(path, data):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(data)


def recover(directory, runner=None):
    """Only the returned/written public report may become an artifact.

    The environment values originate from owner-configured GitHub Secrets.
    This verifies their recoverability, not direct download from an inbox.
    """
    if runner is None:
        runner = crypto.run_private
    password = os.environ.get(crypto.PASSWORD_ENV, '')
    encoded = os.environ.get(KEYSTORE_ENV, '').strip()
    if not 32 <= len(password) <= 256 or '\n' in password or '\r' in password:
        raise ValueError('Required recovery password is missing or invalid; no replacement allowed')
    if not encoded or len(encoded) > 48000:
        raise ValueError('Required encrypted-container Secret is missing or invalid')
    try:
        container = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError('Encrypted-container Secret is not valid base64') from None
    if hashlib.sha256(container).hexdigest() != CONTAINER_SHA256:
        raise ValueError('Encrypted-container digest mismatch; stop without generating a replacement')

    out = Path(directory)
    out.mkdir(mode=0o700, parents=False, exist_ok=False)
    key = out / 'recovery-only.p12'
    cert = out / 'recovery-public.der'
    csr = out / 'recovery-proof.csr'
    try:
        _write_private(key, container)
        # -noout prevents any private-key or certificate PEM extraction.
        info = runner(['openssl', 'pkcs12', '-in', str(key), '-passin',
                       'env:' + crypto.PASSWORD_ENV, '-info', '-noout'])
        crypto.validate_profile(info)
        runner(['keytool', '-exportcert', '-storetype', 'PKCS12', '-keystore', str(key),
                '-alias', 't3code-release', '-storepass:env', crypto.PASSWORD_ENV,
                '-file', str(cert)])
        if hashlib.sha256(cert.read_bytes()).hexdigest() != CERTIFICATE_SHA256:
            raise ValueError('Recovered public certificate mismatch; stop without replacing identity')
        # CSR creation proves the imported encrypted private key can be used.
        # It is never submitted to a CA or uploaded and is deleted below.
        runner(['keytool', '-certreq', '-storetype', 'PKCS12', '-keystore', str(key),
                '-alias', 't3code-release', '-storepass:env', crypto.PASSWORD_ENV,
                '-keypass:env', crypto.PASSWORD_ENV, '-file', str(csr)])
        if not csr.is_file() or csr.stat().st_size == 0:
            raise ValueError('Recovery proof output missing')
        report = {
            'schema': 1,
            'source': 'owner-imported-mail-attachment',
            'source_evidence': 'Owner-imported GitHub Secrets; mailbox download not independently verified',
            'package_name': 'com.zhiweixiao.t3code.zhcn',
            'alias': 't3code-release',
            'encrypted_container_sha256': CONTAINER_SHA256,
            'certificate_sha256': CERTIFICATE_SHA256,
            'encryption_profile_verified': True,
            'imported_backup_private_key_recovery_verified': True,
            'apk_signature_verified': False,
            'verified_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
            'method': 'Fixed container digest, PKCS12 profile, certificate digest, private-key CSR operation',
        }
        _write_private(out / 'recovery-report.json',
                       (json.dumps(report, indent=2) + '\n').encode('utf-8'))
        return report
    finally:
        # Only these newly created local temporary files are removed.
        # No uploads, Secret writes, or identity/key generation occur here.
        for path in (key, cert, csr):
            path.unlink(missing_ok=True)


if __name__ == '__main__':
    import sys
    if len(sys.argv) != 2:
        raise SystemExit('Supply one new private recovery output directory')
    try:
        recover(sys.argv[1])
    except Exception:
        # Never interpolate tool output, environment values, or file contents.
        raise SystemExit('Recovery failed; preserve existing identity. No replacement generated.') from None
    print('Owner-imported backup private-key recovery verified; only public report retained. APK signing remains pending.')

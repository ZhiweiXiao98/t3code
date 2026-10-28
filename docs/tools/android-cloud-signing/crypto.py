"""Reviewed cloud bootstrap crypto operations. Importing this module performs no work."""
import base64
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ITERATIONS = 600000
PASSWORD_ENV = 'ANDROID_KEYSTORE_PASSWORD'

def keytool_command(destination):
    return ['keytool',
        '-J-Dkeystore.pkcs12.keyProtectionAlgorithm=PBEWithHmacSHA256AndAES_256',
        '-J-Dkeystore.pkcs12.certProtectionAlgorithm=PBEWithHmacSHA256AndAES_256',
        '-J-Dkeystore.pkcs12.macAlgorithm=HmacPBESHA256',
        f'-J-Dkeystore.pkcs12.keyPbeIterationCount={ITERATIONS}',
        f'-J-Dkeystore.pkcs12.certPbeIterationCount={ITERATIONS}',
        f'-J-Dkeystore.pkcs12.macIterationCount={ITERATIONS}',
        '-genkeypair', '-storetype', 'PKCS12', '-keystore', str(destination),
        '-alias', 't3code-release', '-keyalg', 'RSA', '-keysize', '3072',
        '-sigalg', 'SHA256withRSA', '-validity', '10000',
        '-dname', 'CN=T3 Code Community Android',
        '-storepass:env', PASSWORD_ENV, '-keypass:env', PASSWORD_ENV]

def validate_profile(info):
    """OpenSSL -info -noout reports encryption metadata, never private-key PEM."""
    lines = [line.strip() for line in info.splitlines()]
    mac = f'MAC: sha256, Iteration {ITERATIONS}'
    profile = (f'PBES2, PBKDF2, AES-256-CBC, Iteration {ITERATIONS}, '
               'PRF hmacWithSHA256')
    if mac not in lines:
        raise ValueError('PKCS12 integrity profile mismatch')
    for prefix in ('PKCS7 Encrypted data: ', 'Shrouded Keybag: '):
        if prefix + profile not in lines:
            raise ValueError('PKCS12 encryption profile mismatch')
    if any(re.search(r'\b(NONE|RC2|3DES|DES-EDE|SHA1)\b', line, re.I) for line in lines):
        raise ValueError('Legacy/unprotected PKCS12 content rejected')

def run_private(command):
    # Output is intentionally captured and not included in exceptions or logs.
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError('Cryptographic operation failed; no automatic replacement is allowed')
    return result.stdout + '\n' + result.stderr

def generate(directory, runner=run_private):
    password = os.environ.get(PASSWORD_ENV, '')
    # This is only a minimum-length guard; randomness must come from the user's
    # cryptographically secure generator, not be inferred from composition.
    if len(password) < 32 or len(password) > 256 or '\n' in password or '\r' in password:
        raise ValueError('Use an independently saved CSPRNG passphrase of 32-256 characters')
    out = Path(directory)
    out.mkdir(mode=0o700, parents=False, exist_ok=False)
    key = out / 't3code-release.p12'
    runner(keytool_command(key))
    info = runner(['openssl', 'pkcs12', '-in', str(key), '-passin',
                   'env:' + PASSWORD_ENV, '-info', '-noout'])
    validate_profile(info)
    cert = out / 'public-certificate.der'
    runner(['keytool', '-exportcert', '-storetype', 'PKCS12', '-keystore', str(key),
            '-alias', 't3code-release', '-storepass:env', PASSWORD_ENV, '-file', str(cert)])
    # A separate private-key operation verifies decryptability before handoff.
    csr = out / 'local-verification.csr'
    runner(['keytool', '-certreq', '-storetype', 'PKCS12', '-keystore', str(key),
            '-alias', 't3code-release', '-storepass:env', PASSWORD_ENV,
            '-keypass:env', PASSWORD_ENV, '-file', str(csr)])
    encoded = base64.b64encode(key.read_bytes())
    if len(encoded) > 48000:
        raise ValueError('Encrypted keystore exceeds conservative GitHub Secret size bound')
    (out / 'encrypted-keystore-base64.txt').write_bytes(encoded + b'\n')
    manifest = {
        'package_name': 'com.zhiweixiao.t3code.zhcn',
        'alias': 't3code-release',
        'certificate_sha256': hashlib.sha256(cert.read_bytes()).hexdigest(),
        'encrypted_container_sha256': hashlib.sha256(key.read_bytes()).hexdigest(),
        'encryption': 'PBES2/PBKDF2-HMAC-SHA256/AES-256-CBC',
        'encryption_iterations': ITERATIONS,
        'integrity': 'PKCS12 HmacPBESHA256',
        'integrity_iterations': ITERATIONS,
        'backup_recovery_verified': False,
        'apk_signature_verified': False,
    }
    (out / 'public-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest

if __name__ == '__main__':
    import sys
    if len(sys.argv) != 2:
        raise SystemExit('Supply one new private output directory')
    generate(sys.argv[1])
    print('Encrypted container profile and local private-key operation verified. Backup recovery remains pending.')

import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('crypto_helper', Path(__file__).with_name('crypto.py'))
crypto = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crypto)
INFO = ('MAC: sha256, Iteration 600000\n'
        'PKCS7 Encrypted data: PBES2, PBKDF2, AES-256-CBC, Iteration 600000, PRF hmacWithSHA256\n'
        'Shrouded Keybag: PBES2, PBKDF2, AES-256-CBC, Iteration 600000, PRF hmacWithSHA256\n')

class CryptoPlanTests(unittest.TestCase):
    def test_explicit_profile_and_env_password(self):
        c = crypto.keytool_command('NEW-PATH.p12')
        self.assertNotIn('-storepass', c)
        self.assertNotIn('-keypass', c)
        self.assertEqual(c.count('ANDROID_KEYSTORE_PASSWORD'), 2)
        for prop in ['keyPbeIterationCount', 'certPbeIterationCount', 'macIterationCount']:
            self.assertIn('-J-Dkeystore.pkcs12.' + prop + '=600000', c)
    def test_actual_profile_validation(self):
        crypto.validate_profile(INFO)
        for bad in [INFO.replace('600000', '10000', 1), INFO.replace('AES-256-CBC', 'AES-128-CBC'),
                    INFO.replace('hmacWithSHA256', 'hmacWithSHA1'), INFO.replace('Shrouded Keybag', 'Key bag')]:
            with self.assertRaises(ValueError): crypto.validate_profile(bad)
    def test_mock_generation_never_executes_programs(self):
        commands = []
        def fake(command):
            commands.append(command)
            if '-genkeypair' in command:
                Path(command[command.index('-keystore') + 1]).write_bytes(b'NOT-A-KEY PUBLIC MOCK')
            if '-file' in command:
                Path(command[command.index('-file') + 1]).write_bytes(b'PUBLIC MOCK OUTPUT')
            return INFO if '-info' in command else ''
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {crypto.PASSWORD_ENV: 'PUBLIC-MOCK-NOT-A-SECRET-' * 2}), patch.object(crypto.subprocess, 'run', side_effect=AssertionError('Real process forbidden')):
            out = Path(folder) / 'new'
            manifest = crypto.generate(out, runner=fake)
            self.assertFalse(manifest['backup_recovery_verified'])
            self.assertFalse(manifest['apk_signature_verified'])
            self.assertEqual(len(commands), 4)
            self.assertNotIn(os.environ[crypto.PASSWORD_ENV], repr(commands))
            self.assertTrue((out / 'encrypted-keystore-base64.txt').exists())
            with self.assertRaises(FileExistsError): crypto.generate(out, runner=fake)
    def test_missing_password_fail_closed(self):
        with patch.dict(os.environ, {crypto.PASSWORD_ENV: ''}):
            with self.assertRaises(ValueError): crypto.generate('unused', runner=lambda _: self.fail('called'))

if __name__ == '__main__': unittest.main()

"""Offline recovery tests with public text fixtures; no keys or subprocesses."""
import base64
import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import crypto
import recovery

INFO = ('MAC: sha256, Iteration 600000\n'
        'PKCS7 Encrypted data: PBES2, PBKDF2, AES-256-CBC, Iteration 600000, PRF hmacWithSHA256\n'
        'Shrouded Keybag: PBES2, PBKDF2, AES-256-CBC, Iteration 600000, PRF hmacWithSHA256\n')
CONTAINER = b'PUBLIC MOCK TEXT - NOT AN ENCRYPTED KEY'
CERT = b'PUBLIC MOCK CERTIFICATE TEXT'
PASSWORD = 'PUBLIC-MOCK-NOT-A-SECRET-' * 2


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.commands = []
        self.fail_csr = False
        self.info = INFO
        self.cert = CERT
        self.contexts = [
            patch.dict(os.environ, {recovery.KEYSTORE_ENV: base64.b64encode(CONTAINER).decode(),
                                    crypto.PASSWORD_ENV: PASSWORD}),
            patch.object(recovery, 'CONTAINER_SHA256', hashlib.sha256(CONTAINER).hexdigest()),
            patch.object(recovery, 'CERTIFICATE_SHA256', hashlib.sha256(CERT).hexdigest()),
            patch.object(crypto.subprocess, 'run', side_effect=AssertionError('Real programs forbidden')),
        ]
        for context in self.contexts:
            context.start()
            self.addCleanup(context.stop)

    def fake(self, command):
        self.commands.append(command)
        self.assertNotIn('-genkeypair', command)
        self.assertNotIn(PASSWORD, repr(command))
        self.assertNotIn('-storepass', command)
        self.assertNotIn('-keypass', command)
        if command[0] == 'openssl':
            self.assertIn('-noout', command)
            return self.info
        if '-exportcert' in command:
            Path(command[command.index('-file') + 1]).write_bytes(self.cert)
        elif '-certreq' in command:
            if self.fail_csr:
                raise RuntimeError('MOCK private-key operation failed')
            Path(command[command.index('-file') + 1]).write_bytes(b'PUBLIC MOCK CSR')
        else:
            raise AssertionError('Unexpected command')
        return ''

    def test_valid_mock_retains_only_public_report(self):
        with tempfile.TemporaryDirectory() as root:
            out = Path(root) / 'private-new'
            report = recovery.recover(out, runner=self.fake)
            self.assertEqual(report['source'], 'owner-imported-mail-attachment')
            self.assertTrue(report['imported_backup_private_key_recovery_verified'])
            self.assertFalse(report['apk_signature_verified'])
            self.assertEqual([p.name for p in out.iterdir()], ['recovery-report.json'])
            self.assertEqual(len(self.commands), 3)
            text = (out / 'recovery-report.json').read_text()
            self.assertNotIn(PASSWORD, text)
            self.assertNotIn(base64.b64encode(CONTAINER).decode(), text)
            if os.name != 'nt':
                self.assertEqual(out.stat().st_mode & 0o777, 0o700)
                self.assertEqual((out / 'recovery-report.json').stat().st_mode & 0o777, 0o600)

    def test_existing_directory_never_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(FileExistsError):
                recovery.recover(root, runner=self.fake)
            self.assertEqual(self.commands, [])

    def test_missing_or_invalid_secrets_stop_without_files_or_commands(self):
        for variable, value in [(crypto.PASSWORD_ENV, ''), (recovery.KEYSTORE_ENV, ''),
                                (recovery.KEYSTORE_ENV, 'invalid base64 !'),
                                (recovery.KEYSTORE_ENV, base64.b64encode(b'WRONG MOCK').decode())]:
            with self.subTest(variable=variable, value=value), tempfile.TemporaryDirectory() as root:
                out = Path(root) / 'new'
                with patch.dict(os.environ, {variable: value}), self.assertRaises(ValueError):
                    recovery.recover(out, runner=self.fake)
                self.assertFalse(out.exists())
                self.assertEqual(self.commands, [])

    def test_wrong_certificate_cleans_files_and_no_report(self):
        self.cert = b'WRONG PUBLIC MOCK CERT'
        with tempfile.TemporaryDirectory() as root:
            out = Path(root) / 'new'
            with self.assertRaisesRegex(ValueError, 'certificate mismatch'):
                recovery.recover(out, runner=self.fake)
            self.assertEqual(list(out.iterdir()), [])
            self.assertFalse(any('-certreq' in x for x in self.commands))

    def test_invalid_profile_cleans_files(self):
        self.info = INFO.replace('600000', '10000')
        with tempfile.TemporaryDirectory() as root:
            out = Path(root) / 'new'
            with self.assertRaises(ValueError):
                recovery.recover(out, runner=self.fake)
            self.assertEqual(list(out.iterdir()), [])

    def test_private_key_failure_cleans_files_and_no_report(self):
        self.fail_csr = True
        with tempfile.TemporaryDirectory() as root:
            out = Path(root) / 'new'
            with self.assertRaises(RuntimeError):
                recovery.recover(out, runner=self.fake)
            self.assertEqual(list(out.iterdir()), [])


if __name__ == '__main__':
    unittest.main()

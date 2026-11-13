"""DEB-only provenance must not depend on a disabled AppImage artifact."""
import copy
import pathlib
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import common
import prepare_live
import test_native_contract


class DebOnlyInputs(unittest.TestCase):
    def test_archive_allowlist(self):
        expected = (('.deb', 'deb'),)
        good = [zipfile.ZipInfo('T3.deb')]
        proof = {'release/T3.deb': 'e' * 64}
        prepare_live.validate_installer_entries(good, proof, expected)
        for names, checks in [
            (['T3.deb', 'T3.AppImage'], proof),
            (['T3.AppImage'], proof),
            (['T3.deb', 'T3.deb'], proof),
            ([], proof),
            (['../T3.deb'], proof),
            (['T3.deb'], {'../T3.deb': 'e' * 64}),
            (['T3.deb'], {**proof, 'release/T3.AppImage': 'd' * 64}),
            (['T3.deb'], {'release/T3.deb': 'bad'}),
            (['Other.deb'], proof),
        ]:
            with self.subTest(names=names, checks=checks), self.assertRaises(ValueError):
                prepare_live.validate_installer_entries([zipfile.ZipInfo(n) for n in names], checks, expected)

    def test_manifest_identity_and_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest, _ = test_native_contract.Native().fixture(pathlib.Path(directory))
            self.assertFalse(any(key.startswith('appimage') for key in manifest))
            common.validate_manifest(manifest)
            for key, value in [('debSha256', 'd' * 64), ('debZipPath', '../T3.deb'), ('debProofPath', '/release/T3.deb'), ('debZipPath', 'T3.AppImage')]:
                candidate = copy.deepcopy(manifest)
                candidate[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    common.validate_manifest(candidate)

    def test_native_status_binds_deb_installer(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            manifest, values = test_native_contract.Native().fixture(root)
            common.validate_results(root, manifest)
            values['status.json']['installerSha256'] = 'd' * 64
            (root / 'status.json').write_text(json.dumps(values['status.json']))
            with self.assertRaises(ValueError):
                common.validate_results(root, manifest)


if __name__ == '__main__':
    unittest.main(verbosity=2)

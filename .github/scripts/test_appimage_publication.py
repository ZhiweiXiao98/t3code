"""Offline regression checks for the community fork's DEB-only release policy."""
import ast
import json
import pathlib
import re
import subprocess
import textwrap
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class AppImagePublication(unittest.TestCase):
    def test_build_and_acceptance_exclude_appimage(self):
        workflow = (ROOT / '.github/workflows/client-release.yml').read_text()
        self.assertNotRegex(workflow.lower().replace('test_appimage_publication.py', ''), r'appimage|qemu|genisoimage')
        self.assertIn('--platform linux --target deb', workflow)
        self.assertIn('path: release/*.deb', workflow)
        self.assertIn('sha256sum release/*.deb', workflow)
        self.assertIn('dpkg-deb --extract', workflow)
        self.assertIn('native_deb.py', workflow)
        self.assertIn('community-wsl-runtime', workflow)
        package = json.loads((ROOT / 'package.json').read_text())
        self.assertIn('--target deb', package['scripts']['dist:desktop:linux'])

    def test_both_publication_allowlists_reject_appimage(self):
        workflow = (ROOT / '.github/workflows/publish-client-candidate.yml').read_text()
        python = textwrap.dedent(workflow.split("python3 <<'PY'\n", 1)[1].split('\n          PY', 1)[0])
        nodes = ast.parse(python).body
        scope = {}
        for node in nodes:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in {'prefix', 'specifications', 'required_jobs'} for t in node.targets):
                exec(compile(ast.Module(body=[node], type_ignores=[]), '<publisher>', 'exec'), {}, scope)
        specs = scope['specifications']
        self.assertEqual(set(specs), {'client-linux-x64', 'client-win-x64', 'client-mac-arm64', 'client-mac-x64'})
        self.assertEqual(specs['client-linux-x64'], ({scope['prefix'] + 'amd64.deb'}, set()))
        self.assertEqual(len(scope['required_jobs']), 21)
        self.assertIn('Clean desktop deb first start', scope['required_jobs'])
        self.assertFalse(any('appimage' in name.lower() for name in scope['required_jobs']))
        mandatory = re.search(r'const mandatory = (\[.*?\]);', workflow, re.S).group(1)
        actual = json.loads(subprocess.check_output(['node', '-e', 'process.stdout.write(JSON.stringify(' + mandatory + '))'], text=True))
        expected = set().union(*(required for required, _ in specs.values()))
        self.assertEqual(set(actual), expected)
        self.assertEqual(len(actual), 8)
        self.assertFalse(any('appimage' in name.lower() for name in actual))
        self.assertIn("required <= set(names) <= required | optional", python)
        self.assertIn('names.every(n => allowed.has(n))', workflow)
        self.assertIn("Existing release/tag; refusing replacement", workflow)


if __name__ == '__main__':
    unittest.main(verbosity=2)

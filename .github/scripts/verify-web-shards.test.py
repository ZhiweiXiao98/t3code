#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('gate', Path(__file__).with_name('verify-web-shards.py'))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class GateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = self.root / 'manifest.json'
        files = {}
        for i in range(1, 5):
            a = [{'fullName': f'case {i}', 'status': 'passed', 'failureMessages': []}]
            files[f'src/{i}.test.ts'] = {'tests': 1, 'names_sha256': gate.signature(a)}
        self.write(self.manifest, {'files': files, 'tests': 4})
        for i in range(1, 5):
            d = self.root / f'web-validation-shard-{i}-123-1'
            d.mkdir()
            output = '/tmp/shard-results.json'
            command = ['vp', 'run', '--filter', '@t3tools/web', 'test', '--shard', f'{i}/4', '--reporter=default', '--reporter=json', '--outputFile.json=' + output]
            self.write(d/'metadata.json', {'environment': {'GITHUB_SHA': 'workflow', 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1'}, 'source': {'exit_code': 0, 'stdout': 'abc\n'}, 'hashes': {'pnpm-lock.yaml': 'lock'}, 'command': command})
            self.write(d/'experiment.json', {'source': 'abc', 'shard': f'{i}/4', 'command': command, 'output': output})
            self.write(d/'outcome.json', {'test_exit_code': 0})
            self.write(d/'all-files.json', [{'file': '/repo/apps/web/' + name} for name in files])
            self.write(d/'shard-results.json', {'success': True, 'numTotalTests': 1, 'numPassedTests': 1, 'testResults': [{'name': f'/repo/apps/web/src/{i}.test.ts', 'status': 'passed', 'assertionResults': [{'fullName': f'case {i}', 'status': 'passed', 'failureMessages': []}]}]})
        self.first = self.root / 'web-validation-shard-1-123-1'

    def write(self, path, value):
        path.write_text(json.dumps(value))

    def change(self, filename, fn):
        path = self.first / filename
        data = json.loads(path.read_text())
        fn(data)
        self.write(path, data)

    def verify(self):
        return gate.verify(self.root, self.manifest, 'abc', '123', '1', 'lock', 'workflow')

    def test_complete(self):
        self.assertEqual(self.verify()['passed'], 4)

    def test_rejections(self):
        changes = [
            ('outcome.json', lambda d: d.update(test_exit_code=1)),
            ('metadata.json', lambda d: d['source'].update(stdout='wrong')),
            ('metadata.json', lambda d: d['environment'].update(GITHUB_RUN_ID='other')),
            ('metadata.json', lambda d: d['environment'].update(GITHUB_SHA='other')),
            ('metadata.json', lambda d: d['environment'].update(GITHUB_RUN_ATTEMPT='2')),
            ('metadata.json', lambda d: d['hashes'].update({'pnpm-lock.yaml': 'wrong'})),
            ('experiment.json', lambda d: d.update(shard='2/4')),
            ('all-files.json', lambda d: d.pop()),
            ('all-files.json', lambda d: d.append(d[0])),
            ('shard-results.json', lambda d: d.update(success=False)),
            ('shard-results.json', lambda d: d.update(numFailedTests=1)),
            ('shard-results.json', lambda d: d.update(numPendingTests=1)),
            ('shard-results.json', lambda d: d.update(numRuntimeErrorTestSuites=1)),
            ('shard-results.json', lambda d: d['testResults'][0].update(assertionResults=[])),
            ('shard-results.json', lambda d: d['testResults'][0].update(name='/repo/apps/web/src/2.test.ts')),
            ('shard-results.json', lambda d: d['testResults'].append(d['testResults'][0])),
            ('shard-results.json', lambda d: d['testResults'][0]['assertionResults'][0].update(fullName='different')),
            ('shard-results.json', lambda d: d['testResults'][0]['assertionResults'][0].update(status='skipped')),
            ('shard-results.json', lambda d: d['testResults'][0]['assertionResults'][0].update(failureMessages=['error'])),
            ('shard-results.json', lambda d: d.update(numTotalTests=2)),
        ]
        for filename, fn in changes:
            with self.subTest(filename=filename, change=str(fn)):
                original = (self.first/filename).read_text()
                self.change(filename, fn)
                with self.assertRaises(AssertionError):
                    self.verify()
                (self.first/filename).write_text(original)

    def test_missing_artifact(self):
        self.first.rename(self.root/'missing')
        with self.assertRaises(AssertionError):
            self.verify()


if __name__ == '__main__':
    unittest.main()

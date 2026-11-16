#!/usr/bin/env python3
"""Fail closed on incomplete Web execution, including Vitest's passed placeholders."""
import argparse
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text())


def norm(name):
    assert '/apps/web/' in name, 'Unexpected test path'
    return name.split('/apps/web/', 1)[1]


def signature(assertions):
    names = sorted(a['fullName'] for a in assertions)
    return hashlib.sha256(json.dumps(names, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def verify(root, manifest, source, run_id, attempt, lock_hash, workflow_sha):
    expected = read(manifest)
    dirs = sorted(Path(root).glob('web-validation-shard-*'))
    assert len(dirs) == 4, 'Require exactly four own-run artifacts'
    seen = set()
    indices = set()
    total = 0
    for directory in dirs:
        metadata = read(directory / 'metadata.json')
        experiment = read(directory / 'experiment.json')
        outcome = read(directory / 'outcome.json')
        result = read(directory / 'shard-results.json')
        env = metadata['environment']
        assert env['GITHUB_SHA'] == workflow_sha
        assert env['GITHUB_RUN_ID'] == str(run_id) and env['GITHUB_RUN_ATTEMPT'] == str(attempt)
        assert metadata['source']['exit_code'] == 0 and metadata['source']['stdout'].strip() == source
        assert metadata['hashes']['pnpm-lock.yaml'] == lock_hash
        assert experiment['source'] == source and experiment['shard'] in ['1/4', '2/4', '3/4', '4/4']
        shard = experiment['shard']
        assert shard not in indices
        indices.add(shard)
        assert directory.name == f'web-validation-shard-{shard[0]}-{run_id}-{attempt}'
        command = experiment['command']
        assert command == ['vp', 'run', '--filter', '@t3tools/web', 'test', '--shard', shard, '--reporter=default', '--reporter=json', '--outputFile.json=' + experiment['output']]
        assert metadata['command'] == command
        assert outcome['test_exit_code'] == 0 and result['success'] is True
        for key in ['numFailedTests', 'numFailedTestSuites', 'numRuntimeErrorTestSuites', 'numPendingTests', 'numTodoTests']:
            assert result.get(key, 0) == 0, key
        inventory = [norm(x['file']) for x in read(directory / 'all-files.json')]
        assert len(inventory) == len(set(inventory)) and set(inventory) == set(expected['files'])
        shard_total = 0
        assert result['testResults'], 'Empty shard'
        for file in result['testResults']:
            name = norm(file['name'])
            assert name in expected['files'] and name not in seen, ('Unknown or repeated file', name)
            seen.add(name)
            assertions = file['assertionResults']
            assert file['status'] == 'passed' and assertions, ('Unexecuted/failed file', name)
            assert all(a['status'] == 'passed' and not a['failureMessages'] for a in assertions)
            contract = expected['files'][name]
            assert len(assertions) == contract['tests'] and signature(assertions) == contract['names_sha256'], ('Changed assertion inventory', name)
            shard_total += len(assertions)
        assert shard_total == result['numTotalTests'] == result['numPassedTests']
        total += shard_total
    assert seen == set(expected['files']) and total == expected['tests']
    return {'source': source, 'files': len(seen), 'passed': total, 'shards': 4, 'coverage_complete': True, 'execution': 'sharded; not original unsharded command', 'root_cause_established': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for arg in ['root', 'manifest', 'source', 'run-id', 'attempt', 'lock-hash', 'workflow-sha']:
        parser.add_argument('--' + arg, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.root, args.manifest, args.source, args.run_id, args.attempt, args.lock_hash, args.workflow_sha), indent=2))

#!/usr/bin/env python3
"""Run one complete partition with the existing bounded observer; never retry."""
import json
import os
from pathlib import Path
import subprocess
import sys

shard = os.environ['WEB_SHARD']
assert shard in ['1', '2', '3', '4']
source_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
assert source_sha == os.environ['SOURCE_SHA']
out = Path(os.environ['RUNNER_TEMP']) / 'web-browser-diagnostics'
out.mkdir(parents=True, exist_ok=True)
subprocess.run(['vp', 'test', 'list', '--project', 'unit', '--project', 'browser', '--filesOnly', '--json=' + str(out / 'all-files.json')], cwd='apps/web', check=True)
output = str(out / 'shard-results.json')
command = ['vp', 'run', '--filter', '@t3tools/web', 'test', '--shard', shard + '/4', '--reporter=default', '--reporter=json', '--outputFile.json=' + output]
observer = Path('.github/scripts/observe-web-tests.py').read_text()
old = 'COMMAND = ["vp", "run", "--filter", "@t3tools/web", "test"]'
assert observer.count(old) == 1
script = Path(os.environ['RUNNER_TEMP']) / 'observe-web-shard.py'
script.write_text(observer.replace(old, 'COMMAND = ' + repr(command)))
(out / 'experiment.json').write_text(json.dumps({'source': source_sha, 'shard': shard + '/4', 'command': command, 'output': output}, indent=2))
sys.exit(subprocess.run([sys.executable, str(script)]).returncode)

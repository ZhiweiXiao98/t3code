import hashlib
import json
import pathlib
import re
import sys
import argparse
import os
import shutil
import shlex
import subprocess
import tempfile

MIRRORS = ['https://archive.ubuntu.com/ubuntu', 'https://security.ubuntu.com/ubuntu', 'https://ftp.osuosl.org/pub/ubuntu']
MIRROR = 'mirror+file:/etc/apt/apt-mirrors.txt'
OFFICIAL = {'https://archive.ubuntu.com/ubuntu', 'https://security.ubuntu.com/ubuntu'}
DIRECT = {'http://azure.archive.ubuntu.com/ubuntu', 'http://archive.ubuntu.com/ubuntu', 'http://security.ubuntu.com/ubuntu', *OFFICIAL}

def rewrite(text, suffix, mirror_uri):
    def uri(value):
        value = value.rstrip('/')
        if value == MIRROR:
            return mirror_uri
        if value in DIRECT:
            return mirror_uri
        raise ValueError('Unrecognized Ubuntu source URI')
    if suffix == '.list':
        output = []
        for line in text.splitlines():
            match = re.match(r'^(\s*deb(?:-src)?\s+(?:\[[^\]]*\]\s+)?)(\S+)(\s+.*)$', line)
            if not match or match[2].rstrip('/') not in DIRECT | {MIRROR}:
                continue
            assert not re.search(r'(?:trusted|allow-insecure|allow-weak|allow-downgrade-to-insecure)\s*=\s*yes', line, re.I)
            output.append(match[1] + uri(match[2]) + match[3])
        return '\n'.join(output) + '\n' if output else ''
    output = []
    for block in re.split(r'\n\s*\n', text.strip()):
        match = re.search(r'^URIs:\s*(.+)$', block, re.M | re.I)
        if not match:
            continue
        values = match[1].split()
        if not any(x.rstrip('/') in DIRECT | {MIRROR} for x in values):
            continue
        assert all(x.rstrip('/') in DIRECT | {MIRROR} for x in values), 'Mixed Ubuntu and unknown URI stanza'
        assert not re.search(r'^(?:Trusted|Allow-Insecure|Allow-Weak|Allow-Downgrade-To-Insecure):\s*yes\s*$', block, re.M | re.I)
        assert not re.match(r'\n[ \t]+\S', block[match.end():]), 'Multiline URIs unsupported'
        output.append(block[:match.start()] + 'URIs: ' + ' '.join(uri(x) for x in values) + block[match.end():])
    return '\n\n'.join(output) + '\n' if output else ''

def prepare(root, output):
    root, output = pathlib.Path(root), pathlib.Path(output)
    output.mkdir(exist_ok=True)
    parts = output / 'sources.list.d'
    parts.mkdir()
    paths = [root / 'sources.list'] + sorted((root / 'sources.list.d').glob('*.list')) + sorted((root / 'sources.list.d').glob('*.sources'))
    mirror = root / 'apt-mirrors.txt'
    urls = []
    if mirror.exists():
        urls = [line.split()[0].rstrip('/') for line in mirror.read_text().splitlines() if line.strip() and not line.lstrip().startswith('#')]
        urls = list(dict.fromkeys(x for x in urls if x in OFFICIAL))
    urls = MIRRORS
    copied = output / 'official-mirrors.txt'
    copied.write_text('\n'.join(urls) + '\n')
    sources = []
    before = {str(mirror): hashlib.sha256(mirror.read_bytes()).hexdigest()} if mirror.exists() else {}
    for path in paths:
        if not path.exists():
            continue
        raw = path.read_bytes()
        before[str(path)] = hashlib.sha256(raw).hexdigest()
        converted = rewrite(raw.decode(), path.suffix, 'mirror+file:' + str(copied))
        if converted.strip():
            if MIRROR in raw.decode():
                assert urls, 'No existing official HTTPS fallback mirror'
            target = output / 'sources.list' if path.name == 'sources.list' else parts / path.name
            target.write_text(converted)
            sources.append(str(target))
    assert sources, 'No recognized Ubuntu sources'
    (output / 'sources.list').touch(exist_ok=True)
    assert before == {path: hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest() for path in before}
    (output / 'source-inventory.json').write_text(json.dumps({'original_sha256': before, 'copied_sources': sources, 'official_mirrors': urls, 'mirror_evidence': ['https://packages.ubuntu.com/jammy/amd64/global/download', 'https://ftp.osuosl.org/pub/ubuntu/']}, indent=2))
    return before


def node_interpreter():
    shim = shutil.which('node')
    assert shim, 'Node is not on PATH'
    expression = 'JSON.stringify({execPath:process.execPath,version:process.version,release:process.release.name})'
    environment = {key: value for key, value in os.environ.items() if key not in {'NODE_OPTIONS', 'NODE_PATH'}}
    # Preserve the shim basename: vp multiplexes node by argv[0].
    info = json.loads(subprocess.check_output([shim, '-p', expression], env=environment, text=True, timeout=15))
    assert info.get('release') == 'node' and re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+', info.get('version', '')), 'Unexpected Node runtime'
    executable = pathlib.Path(info['execPath'])
    assert executable.is_absolute() and executable.is_file() and os.access(executable, os.X_OK), 'Node reported an invalid executable'
    executable = executable.resolve(strict=True)
    verified = json.loads(subprocess.check_output([str(executable), '-p', expression], env=environment, text=True, timeout=15))
    assert verified == info, 'Resolved interpreter does not match the selected Node runtime'
    return executable


def command_plan(mode, values, config, no_recommends=False):
    if mode == 'packages':
        assert values and all(re.fullmatch(r'[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?', value) for value in values), 'Expected Debian package names only'
        prefix = ['sudo', 'env', 'APT_CONFIG=' + str(config), 'apt-get']
        return [prefix + ['update'], prefix + ['install', '-y'] + (['--no-install-recommends'] if no_recommends else []) + values]
    assert mode == 'playwright' and len(values) == 1 and not no_recommends
    cli = pathlib.Path(values[0]).resolve(strict=True)
    assert cli.name == 'cli.js'
    package = json.loads(cli.with_name('package.json').read_text())
    assert package['name'] in {'playwright', 'playwright-core'} and package['version'] == '1.64.1', 'Unexpected browser dependency installer'
    node = node_interpreter()
    return [['sudo', 'env', 'APT_CONFIG=' + str(config), 'NODE_OPTIONS=', 'NODE_PATH=', str(node), str(cli), 'install-deps', 'chromium']]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['packages', 'playwright'])
    parser.add_argument('--no-install-recommends', action='store_true')
    parser.add_argument('values', nargs='+')
    args = parser.parse_args()
    assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_OS') == 'Linux', 'GitHub Linux runner only'
    info = dict(line.split('=', 1) for line in pathlib.Path('/etc/os-release').read_text().splitlines() if '=' in line)
    assert info.get('ID', '').strip('"') == 'ubuntu' and info.get('VERSION_ID', '').strip('"') in {'22.04', '24.04'}, 'Unsupported runner distribution'
    root = pathlib.Path(tempfile.mkdtemp(prefix='t3-ubuntu-apt-', dir='/tmp'))
    root.chmod(0o755)
    sources = root / 'sources'
    before = prepare('/etc/apt', sources)
    for directory in [root/'lists/partial', root/'cache/archives/partial']:
        directory.mkdir(parents=True)
        subprocess.run(['sudo', 'chown', '_apt:root', str(directory)], check=True)
    config = root / 'apt.conf'
    config.write_text('\n'.join([
        f'Dir::Etc::sourcelist "{sources}/sources.list";',
        f'Dir::Etc::sourceparts "{sources}/sources.list.d";',
        f'Dir::State::lists "{root}/lists";',
        f'Dir::Cache "{root}/cache";',
        'Acquire::Retries "1";',
        'Acquire::http::Timeout "20";',
        'Acquire::https::Timeout "20";',
        'APT::Update::Error-Mode "any";',
    ]) + '\n')
    expected = {'SOURCES': str(sources / 'sources.list'), 'PARTS': str(sources / 'sources.list.d'), 'LISTS': str(root / 'lists'), 'CACHE': str(root / 'cache')}
    actual = subprocess.check_output(['sudo', 'env', 'APT_CONFIG=' + str(config), 'apt-config', 'shell', 'SOURCES', 'Dir::Etc::sourcelist', 'PARTS', 'Dir::Etc::sourceparts', 'LISTS', 'Dir::State::lists', 'CACHE', 'Dir::Cache'], text=True)
    assert dict(item.split('=', 1) for item in shlex.split(actual)) == expected, 'Scoped APT configuration did not take effect'
    try:
        for command in command_plan(args.mode, args.values, config, args.no_install_recommends):
            subprocess.run(['timeout', '--kill-after=15s', '480s', *command], check=True)
    finally:
        assert before == {name: hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest() for name in before}, 'Original APT sources changed'
        print('Ubuntu dependency operation used only command-scoped temporary sources and the existing archive keyring.')

if __name__ == '__main__':
    main()

"""Pure supplemental manifest validation. Does not execute application code.

validate_manifest(manifest, pins) returns manifest after strict validation.
Pins must contain source and workflow objects identical to reviewed manifest;
all their members are mandatory. Transport/run/job/artifact verification belongs
to the calling publisher, which must pin this module to its operation commit.
"""
import re

SOURCE_SHA = '98ac4dc26fa013c008c3c5afd8012a60cb1d9135'
SOURCE_TREE = 'acdf2b80d00fb3404432f314be0a4a9e4904330f'
HTML = 'apps/server/src/htmlRender/HtmlRender.test.ts'
HTTP = 'apps/server/src/outboundHttp.test.ts'
UNINSTALL = 'apps/server/src/cli/uninstall.test.ts'
SHELL = 'packages/shared/src/shell.test.ts'
POLICY = 'packages/shared/src/managedPolicyFile.test.ts'
HTTP2 = 'moves the built-in fetch off HTTP/2'
EINVAL = 'keeps built-in fetch working when setTypeOfService throws EINVAL'

def require(condition, reason):
    if not condition:
        raise ValueError('Supplemental coverage rejected: ' + reason)

def shape(obj, fields):
    require(type(obj) is dict and set(obj) == set(fields.split()), 'unexpected or missing fields: ' + fields)

def positive_integer(value):
    return type(value) is int and value > 0

def digest(value, length):
    return type(value) is str and re.fullmatch('[0-9a-f]{'+str(length)+'}', value) is not None

def validate_manifest(manifest, pins):
    shape(manifest, 'schema_version evidence_type repository passed source workflow lanes')
    require(type(manifest['schema_version']) is int and manifest['schema_version'] == 2, 'schema version')
    require(manifest['evidence_type'] == 'supplemental-test-coverage' and manifest['repository'] == 'ZhiweiXiao98/t3code', 'manifest identity')
    require(manifest['passed'] is True, 'not passed')
    source, workflow = manifest['source'], manifest['workflow']
    shape(source, 'sha tree branch')
    shape(workflow, 'path branch sha run_id run_attempt')
    require(source == {k:pins['source'][k] for k in ['sha','tree','branch']} and workflow == pins['workflow'], 'immutable source/workflow pins')
    require(source['sha'] == SOURCE_SHA and source['tree'] == SOURCE_TREE, 'candidate')
    require(source['branch'] == 'maintenance/v0.1.7-zh-cloud', 'candidate branch')
    require(workflow['path'] == '.github/workflows/client-coverage.yml', 'workflow path')
    require(workflow['branch'] == 'validation/v0.1.7-coverage-98ac4dc26fa0', 'workflow branch')
    require(digest(workflow['sha'],40) and workflow['sha'] != source['sha'], 'operation SHA')
    for value in (workflow['run_id'],workflow['run_attempt']):
        require(positive_integer(value),'run identity')
    require(type(manifest['lanes']) is list and len(manifest['lanes']) == 5, 'five lanes required')
    expected = {
        'linux-node26': ('Supplemental Linux Node 26','ubuntu-22.04','v26.12.1','linux','8.12.2',{HTML,HTTP}),
        'linux-node24': ('Supplemental Linux Node 24','ubuntu-22.04','v24.22.2','linux','7.30.1',{HTTP}),
        'windows-uninstall': ('Supplemental Windows uninstall','windows-2025','v26.12.1','win32','8.12.2',{UNINSTALL}),
        'linux-nushell': ('Supplemental Linux Nushell','ubuntu-22.04','v26.12.1','linux','8.12.2',{SHELL}),
        'windows-shared': ('Supplemental Windows shared','windows-2025','v26.12.1','win32','8.12.2',{SHELL,POLICY}),
    }
    for lane in manifest['lanes']:
        shape(lane,'lane job_name runner_label runtime source_unchanged test_exit_code files')
        name=lane['lane']; require(type(name) is str and name in expected,'duplicate or unexpected lane')
        job,runner,node,platform,undici,files=expected.pop(name)
        require(lane['job_name']==job and lane['runner_label']==runner,'job or runner')
        require(lane['source_unchanged'] is True,'modified source')
        require(type(lane['test_exit_code']) is int and lane['test_exit_code']==0,'test exit code')
        rt=lane['runtime'];shape(rt,'node_version bundled_undici platform arch has_socket_set_type_of_service browser nushell')
        require((rt['node_version'],rt['bundled_undici'],rt['platform'],rt['arch'])==(node,undici,platform,'x64'),'actual runtime')
        require(type(rt['has_socket_set_type_of_service']) is bool,'socket runtime field')
        if name=='linux-node24':require(rt['has_socket_set_type_of_service'] is True,'Node24 conditional inactive')
        browser=rt['browser']
        if name=='linux-node26':
            shape(browser,'playwright_version revision version executable_sha256 test_headless_shell sandbox_disabled')
            require(browser['playwright_version']=='1.60.0' and browser['revision']=='1223','browser package/revision')
            require(type(browser['version']) is str and re.search(r'\b148\.0\.7778\.96\b',browser['version']) is not None,'actual Chromium version')
            require(digest(browser['executable_sha256'],64),'browser executable digest')
            require(type(browser['test_headless_shell']) is str and bool(browser['test_headless_shell']),'browser executable missing')
            require(browser['sandbox_disabled'] is False,'browser sandbox disabled')
        else:require(browser is None,'unexpected browser')
        nu=rt['nushell']
        if name=='linux-nushell':
            shape(nu,'version executable executable_sha256 archive_sha256 download_url')
            require(nu['version']=='0.116.0','Nushell version')
            require(type(nu['executable']) is str and bool(nu['executable']),'Nushell executable')
            require(digest(nu['executable_sha256'],64),'Nushell executable digest')
            require(nu['archive_sha256']=='9f73a6913f9515a621bd916dc91d7f3e0494e488161c2d686f6b98ffa0555945','Nushell archive digest')
            require(nu['download_url']=='https://github.com/nushell/nushell/releases/download/0.116.0/nu-0.116.0-x86_64-unknown-linux-gnu.tar.gz','Nushell official source')
        else:require(nu is None,'unexpected Nushell runtime')
        require(type(lane['files']) is list and len(lane['files'])==len(files),'file count')
        for file in lane['files']:
            shape(file,'path git_blob_sha sha256 counts assertions')
            path=file['path'];require(type(path) is str and path in files,'unexpected or duplicate file');files.remove(path)
            require(file['git_blob_sha']==FILE_PINS[path]['blob'] and file['sha256']==FILE_PINS[path]['sha256'],'file source hashes')
            assertions=file['assertions'];require(type(assertions) is list and len(assertions)==len(TITLES[path]),'assertion count')
            titles=set(TITLES[path])
            skips={
                'linux-node26':{EINVAL:'requires built-in undici 7 and Socket.setTypeOfService'},
                'linux-node24':{HTTP2:'requires built-in undici >= 8'},
                'windows-uninstall':{},
                'linux-nushell':{'runs the executable behind an npm shim directly when asked':'requires native Windows'},
                'windows-shared':{'captures Nushell PATH and multiline values without external tools':'requires T3_TEST_NU_PATH; covered on Linux'},
            }[name]
            nskip=0
            for assertion in assertions:
                shape(assertion,'title status skip_reason')
                title=assertion['title'];require(type(title) is str and title in titles,'missing/duplicate/unexpected title');titles.remove(title)
                if title in skips:
                    reason=skips[title]
                    require(assertion['status']=='skipped' and assertion['skip_reason']==reason,'incorrect conditional skip');nskip+=1
                else:require(assertion['status']=='passed' and assertion['skip_reason'] is None,'required assertion did not pass')
            require(not titles,'missing named assertion')
            counts=file['counts'];shape(counts,'total passed failed skipped todo')
            require(all(type(x) is int for x in counts.values()),'non-integer count')
            require(counts=={'total':len(assertions),'passed':len(assertions)-nskip,'failed':0,'skipped':nskip,'todo':0},'count/assertion disagreement')
        require(not files,'missing file')
    require(not expected,'missing lane')
    return manifest

FILE_PINS = {'apps/server/src/outboundHttp.test.ts': {'blob': 'ed3b09abaa5e649e07cfe97b540f347a8e174837', 'sha256': '8f600beae2c4a80091876f3f5164042e9a9c91eccea93f3e3f0c9b000c45a11a'}, 'apps/server/src/cli/uninstall.test.ts': {'blob': 'd2ad673408d40ff8fa5be3ccba2bf99fb139918c', 'sha256': '06f4afac0719d82c9a3a7cfbd9ecbaeac476176c8d45374a52f4290d8dd851f0'}, 'apps/server/src/htmlRender/HtmlRender.test.ts': {'blob': '645f863a16b470776aeb2e086854dedd680302c3', 'sha256': '7e1b97162b88145183515980aecc802c07baea0a3061f1ebfe0738ff92d8b6d7'}, 'packages/shared/src/shell.test.ts': {'blob': 'e3af0855ebfacbd5765d913555f2f7d01ddafbd8', 'sha256': '2ae9c7ca409916c31ad4e2e3044cd2a2616ac4e3cca60f4ade24157ebb4a0490'}, 'packages/shared/src/managedPolicyFile.test.ts': {'blob': '2ab3ea710e3ecdd0a580638b37f057cf00d6ff6a', 'sha256': 'bc98e7f88db35af4cd44031f7b2aeb08f970c3462e77ba96e6f0d464dd3e03bc'}}
TITLES = {'apps/server/src/outboundHttp.test.ts': ['makes the global dispatcher negotiate HTTP/1.1 and keeps the env proxy agent', 'moves the built-in fetch off HTTP/2', 'swallows only an Error with code EINVAL on macOS', 'keeps built-in fetch working when setTypeOfService throws EINVAL'], 'apps/server/src/cli/uninstall.test.ts': ["claims only a launcher that points into this home's runtime tree", 't3 uninstall has cmd.exe remove the runtime directory, preserving spaces and literal environment-variable syntax'], 'apps/server/src/htmlRender/HtmlRender.test.ts': ['inlines local images by absolute path and leaves URLs and relative paths alone', 'rejects viewport height units, which make the fitted frame grow without end', 'inlines an SVG behind processing instructions and a doctype subset', 'lists every local image it cannot read', 'publishes the prepared page as an html thread attachment', 'removes the page when publishing is interrupted', 'reports a typed preview error', 'asks the browser to close when the preview finishes instead of signalling it', "names this server's home in the browser setup command", 'matches preview media queries and text colors to the requested appearance', 'keeps every local file but the page itself out of the browser', "keeps the page off this machine's local network"], 'packages/shared/src/shell.test.ts': ['extracts multiple environment variables from a login shell command', 'omits environment variables that are missing or empty', 'preserves multiline values and surrounding whitespace', 'returns env shell, user shell, then the platform fallback without duplicates', 'prefers login-shell PATH entries and keeps inherited extras', 'yields while the native shell probe is pending', 'tries both shells and preserves baseline PATH repair', 'returns an empty environment after both shell candidates fail', 'does not launch a shell when no variables are requested', 'kills the native probe child on interruption without trying the next shell', 'gives up on a shell that survives the kill and holds stdout open', 'extracts environment variables from a PowerShell command', 'strips CRLF delimiters from captured PowerShell values', 'omits -NoProfile when loadProfile is enabled', 'falls back to Windows PowerShell when pwsh.exe is unavailable', 'sanitizes and dedupes Windows entries while preserving preferred order', 'removes stray quotes from Windows entries', 'dedupes case-sensitively on POSIX', 'still visits a PATH entry that differs only in case', 'probes only listed PATH names and relists a directory that changes', "runs the git.exe Git for Windows' launcher would start", 'keeps the launcher when MSYSTEM is set', 'leaves other gits and other launchers alone', "finds the executable npm's shim runs", 'keeps a shim that does more than run the executable', 'keeps a shim CMD would read differently', 'keeps the shim when its executable is missing or it is not a .cmd', 'runs Windows executables directly without a shell', 'builds one escaped cmd.exe line for Windows command shims', 'resolves against the effective environment when extending host env', 'runs the git behind the xcrun shim and looks it up once', 'keeps git when PATH has another git or the host is not macOS', 'keeps git when xcrun fails or names a missing file', 'looks again when the resolved git disappears', 'does not fall back to a shell for unresolved Windows commands', 'uses known CLI directories as a fallback without changing shell PATH priority', 'probes node with one PATH key when inherited environment records have mixed casing', 'loads the PowerShell profile when baseline env cannot resolve node', 'keeps the baseline env when profiled probe still does not resolve node', 'captures Nushell PATH and multiline values without external tools', 'runs the executable behind an npm shim directly when asked', 'resolves lowercase executable files for audit-command in a case-sensitive Windows PATH directory', 'resolves lowercase executable files for audit-command.CMD in a case-sensitive Windows PATH directory', 'applies shell updates with win32 PATH semantics', 'applies shell updates with linux PATH semantics', 'applies shell updates with darwin PATH semantics'], 'packages/shared/src/managedPolicyFile.test.ts': ['reads a macOS configuration profile, and refuses one beside a policy file', 'reads a Policy value of JSON from the registry, and treats only an absent key as none', 'builds the policy from the values the Group Policy template writes', 'lists registry values and subkeys through the Win32 API']}

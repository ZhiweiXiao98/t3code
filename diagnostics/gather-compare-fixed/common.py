"""Strict synthetic receipts and owned-process bounds; no application imports."""
import hashlib, json, os, pathlib, platform, re, signal, subprocess, tempfile, time
from run_probe import CASES, EXPECTED_CHECKS, validate, unique_object, invalid_constant
HERE = pathlib.Path(__file__).resolve().parent
PARENT = '58ee32779c5dc5576ecdf5f007da1402839dfd50'
PROBE_MANIFEST = '0455fcad09baf86495629978e39d3ac549cff013bc98a9c1141dc40e247aa335'
VERSION = '1:8.2.2+ds-0ubuntu1.18'
PACKAGES = ('qemu-system-x86', 'qemu-system-common', 'qemu-system-data', 'qemu-utils')
IMAGE_URL = 'https://cloud.debian.org/cdimage/cloud/trixie/20261001-2618/debian-13-genericcloud-amd64-20261001-2618.qcow2'
IMAGE_SHA = 'f46f0671a6e5bdec5291ab8972bae2f10e5408c2f64a74078f11efc2f06a436a9d0313ed50e0472542eeabf780e9f7c792ac0a314c6c20507fcd9fd81b468c3d'
LIMITS = dict(native=150, boot=300, guestSuite=150, lifecycle=600, outerVm=750, jobMinutes=20)
PURPOSE = 'synthetic ISA discriminator; never application acceptance'
ERRORS = {'timeout', 'invalid_result', 'unexpected_output', 'environment', 'binary_identity', 'setup', 'cancelled', 'boot_timeout', 'lifecycle_timeout', 'transport', 'package_version', 'image', 'source_identity'}
C_ERRORS = {'requires_4096_byte_pages', 'mmap', 'mprotect_write', 'mprotect_read', 'core_limit', 'signal_setup', 'avx2_unavailable', 'usage', 'missing_expected_fault', 'get_affinity', 'two_cpus_unavailable', 'barrier_init', 'thread_create', 'thread_join', 'unknown_mode'}
STAGES = {'complete', 'oracle_bounds', 'gather_all_active_value', 'gather_masked_value', 'clamp_index', 'thread_affinity_or_barrier'}
class BoundError(Exception):
    pass

def require(value, code='invalid_result'):
    if not value:
        raise BoundError(code)

def sha(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def loads(data):
    require(len(data) <= 16384)
    return json.loads(data, object_pairs_hook=unique_object, parse_constant=invalid_constant)

def integer(value, low, high):
    return type(value) is int and low <= value <= high

def digest(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None

def stop(process):
    if process is None:
        return
    blocked = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM, signal.SIGINT, signal.SIGALRM})
    try:
        # Reap the captured session before any deferred cancellation is delivered.
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=2)
    finally:
        signal.pthread_sigmask(signal.SIG_SETMASK, blocked)

def spawn(argv, **kwargs):
    # Caller assigns the owned child before restoring its signal mask.
    blocked = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM, signal.SIGALRM})
    try:
        process = subprocess.Popen(argv, start_new_session=True, preexec_fn=lambda: signal.pthread_sigmask(signal.SIG_SETMASK, blocked), **kwargs)
    except BaseException:
        signal.pthread_sigmask(signal.SIG_SETMASK, blocked)
        raise
    return process, blocked

def run(argv, seconds, limit=16384, cwd=None):
    process = None
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            process, blocked = spawn(argv, stdout=out, stderr=err, cwd=cwd)
            signal.pthread_sigmask(signal.SIG_SETMASK, blocked)
            end = time.monotonic() + seconds
            while process.poll() is None:
                require(time.monotonic() < end, 'timeout')
                require(os.fstat(out.fileno()).st_size <= limit and os.fstat(err.fileno()).st_size <= limit, 'unexpected_output')
                time.sleep(0.02)
            require(os.fstat(out.fileno()).st_size <= limit and os.fstat(err.fileno()).st_size <= limit, 'unexpected_output')
            out.seek(0); err.seek(0)
            return process.returncode, out.read(), err.read()
        finally:
            stop(process)

def cancellation(signum, frame):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    raise BoundError('cancelled')

def install_handlers():
    signal.signal(signal.SIGTERM, cancellation)
    signal.signal(signal.SIGINT, cancellation)

def environment():
    release = {}
    for line in pathlib.Path('/etc/os-release').read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep:
            release[key] = value.strip('"')
    cpus = pathlib.Path('/proc/cpuinfo').read_text().split('\n\n')
    flags = [set(line.partition(':')[2].split()) for cpu in cpus for line in cpu.splitlines() if line.startswith('flags\t')]
    memory = re.search(r'^MemTotal:\s+(\d+) kB$', pathlib.Path('/proc/meminfo').read_text(), re.M)
    return dict(osId=release.get('ID'), osVersion=release.get('VERSION_ID'), machine=platform.machine(), kernel=platform.release(), onlineCpuCount=os.cpu_count(), allowedCpuCount=len(os.sched_getaffinity(0)), pageSize=os.sysconf('SC_PAGESIZE'), avx2=bool(flags) and all('avx2' in f for f in flags), memoryKiB=int(memory[1]) if memory else 0)

def check_environment(env, guest):
    require(type(env) is dict and set(env) == {'osId','osVersion','machine','kernel','onlineCpuCount','allowedCpuCount','pageSize','avx2','memoryKiB'}, 'environment')
    require(env['osId'] == ('debian' if guest else 'ubuntu') and env['osVersion'] == ('13' if guest else '24.04'), 'environment')
    require(env['machine'] == 'x86_64' and type(env['kernel']) is str and re.fullmatch(r'[A-Za-z0-9.+_-]{1,128}', env['kernel']), 'environment')
    require(integer(env['onlineCpuCount'],2,4096) and integer(env['allowedCpuCount'],2,env['onlineCpuCount']) and env['avx2'] is True and type(env['pageSize']) is int and env['pageSize'] == 4096, 'environment')
    require(integer(env['memoryKiB'],1,2**44), 'environment')
    if guest:
        require(env['onlineCpuCount'] == env['allowedCpuCount'] == 2 and 3500000 <= env['memoryKiB'] <= 4194304, 'environment')

def check_data(case, rc, data):
    require(type(data) is dict)
    if set(data) == {'error'}:
        require(type(data['error']) is str and data['error'] in C_ERRORS and rc in (2,77))
    elif set(data) == {'signal','gatherSite'}:
        require(data['signal'] in ('SIGSEGV','SIGILL','SIGBUS') and data['gatherSite'] in ('all_active','masked','other'))
        require(rc == {'SIGSEGV':139,'SIGILL':132,'SIGBUS':135}[data['signal']])
    else:
        parallel = case == 'parallel'
        require(set(data) == ({'mode','threads','distinctCpuAffinity','stage','checks','checksum','rounds'} if parallel else {'mode','stage','checks','checksum','rounds'}))
        require(data['mode'] == case and type(data['rounds']) is int and data['rounds'] == 4096 and rc in (0,1))
        if parallel:
            require(type(data['threads']) is int and data['threads'] == 2 and type(data['distinctCpuAffinity']) is bool)
            require(all(type(data[k]) is list and len(data[k]) == 2 for k in ('stage','checks','checksum')))
        for stage, count, checksum in zip(data['stage'] if parallel else [data['stage']], data['checks'] if parallel else [data['checks']], data['checksum'] if parallel else [data['checksum']]):
            require(type(stage) is str and stage in STAGES and integer(count,0,EXPECTED_CHECKS) and integer(checksum,0,0xffffffff))

def check_suite(suite, label, binary_hash):
    require(type(suite) is dict and set(suite) == {'schemaVersion','label','purpose','binarySha256','complete','results'})
    require(type(suite['schemaVersion']) is int and suite['schemaVersion'] == 1 and suite['label'] == label and suite['purpose'] == PURPOSE and suite['binarySha256'] == binary_hash and type(suite['complete']) is bool)
    rows = suite['results']; require(type(rows) is list and 1 <= len(rows) <= 5)
    for i, row in enumerate(rows):
        require(type(row) is dict and row.get('case') == CASES[i] and type(row.get('passed')) is bool and integer(row.get('elapsedMs'),0,31000))
        if 'error' in row:
            require(set(row) == {'case','error','passed','elapsedMs'} and row['error'] in ('timeout','invalid_result') and row['passed'] is False)
        else:
            require(set(row) == {'case','returnCode','data','passed','elapsedMs'} and integer(row['returnCode'],-128,255))
            check_data(row['case'], row['returnCode'], row['data'])
            require(row['passed'] == validate(row['case'],row['returnCode'],row['data']))
        require(row['passed'] or i == len(rows)-1)
    complete = len(rows) == 5 and all(r['passed'] for r in rows)
    if complete:
        complete = rows[3]['data']['checksum'] == rows[4]['data']['checksum'][0]
    require(suite['complete'] == complete)
    return complete

def check_cell(cell, guest, binary_hash):
    require(type(cell) is dict and set(cell) == {'environment','binarySha256','elapsedMs','error','suite'})
    require(cell['binarySha256'] == binary_hash and digest(binary_hash) and integer(cell['elapsedMs'],0,150000))
    require(cell['error'] is None or type(cell['error']) is str and cell['error'] in ERRORS)
    if cell['error'] is not None:
        # Error cells never retain unchecked environment or subprocess output.
        require(cell['environment'] is None and cell['suite'] is None)
        return False
    check_environment(cell['environment'], guest)
    return check_suite(cell['suite'], 'same-tcg-multi' if guest else 'actions-native', binary_hash)

def cell(binary, binary_hash, guest):
    start = time.monotonic()
    result = dict(environment=None, binarySha256=binary_hash, elapsedMs=0, error=None, suite=None)
    try:
        require(sha(binary) == binary_hash, 'binary_identity')
        env = environment(); check_environment(env, guest)
        rc, out, err = run(['python3',str(HERE/'run_probe.py'),'--binary',str(binary),'--label','same-tcg-multi' if guest else 'actions-native'],145)
        require(not err)
        suite = loads(out); complete = check_suite(suite,suite.get('label'),binary_hash)
        require(rc == (0 if complete else 1))
        require(sha(binary) == binary_hash, 'binary_identity')
        result.update(environment=env,suite=suite)
    except (BoundError,ValueError,KeyError,TypeError,OSError) as error:
        result['error'] = str(error) if isinstance(error,BoundError) and str(error) in ERRORS else 'invalid_result'
    result['elapsedMs'] = round((time.monotonic()-start)*1000)
    check_cell(result,guest,binary_hash)
    return result

def classify(native, guest, binary_hash):
    if not check_cell(native,False,binary_hash):
        require(guest is None)
        return 'native_incomplete_stop'
    if guest is None:
        return 'guest_not_completed_stop'
    complete = check_cell(guest,True,binary_hash)
    if complete:
        a=native['suite']['results']; b=guest['suite']['results']
        return 'non_reproduction_stop' if all(x['data']==y['data'] for x,y in zip(a,b)) else 'checksum_divergence_stop'
    if guest['suite'] is None:
        return 'guest_inconclusive_stop'
    rows=guest['suite']['results']; last=rows[-1]
    if len(rows)<=3:
        return 'guest_control_failure_stop'
    data=last.get('data',{})
    stages=data.get('stage',[]); stages=stages if type(stages) is list else [stages]
    if 'clamp_index' in stages:
        return 'synthetic_index_discrepancy_stop'
    if 'gather_all_active_value' in stages or data.get('gatherSite')=='all_active':
        return 'synthetic_all_active_discrepancy_stop'
    if 'gather_masked_value' in stages or data.get('gatherSite')=='masked':
        return 'synthetic_masked_discrepancy_stop'
    return 'guest_inconclusive_stop'

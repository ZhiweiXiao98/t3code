import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


"""Local synthetic/negative tests only: no network, package install, VM, or app."""
import base64,copy,gzip,hashlib,io,json,pathlib,subprocess,sys,tarfile,tempfile,unittest
from unittest.mock import patch,Mock
import common,host,guest,decode_serial,collect_evidence

def manifest():
    return dict(schemaVersion=1,repository='ZhiweiXiao98/t3code',sourceSha='a'*40,sourceTree='b'*40,workflowSha='a'*40,installerBytes=100,kind='appimage',mode='same-full-run-debian13-v1',installerSha256='d'*64,executableSha256='d'*64,appimageSha256='d'*64,artifactZipSha256='e'*64,proofZipSha256='1'*64,producerLogSha256='2'*64,playwrightTreeSha256='f'*64,cjkDriverSha256=common.CJK_SHA,cleanDriverSha256=common.CLEAN_SHA,producerRunId=11,producerRunAttempt=2,producerJobId=12,artifactId=13,proofArtifactId=15,packageUploadStepNumber=10,proofUploadStepNumber=11,playwrightVersion='1.60.0',playwrightSize=2814257,playwrightIntegrity='sha512-9bW6zvX/m0lEbgTKJ6YppOKx8H3VOPBMOCFh2irXFOT4BbHgrx5hPjwJYLT40Lu+4qtD36qKc/Hn56StUW57IA==',privacyClauses=copy.deepcopy(common.PRIVACY_CLAUSES),imageUrl=common.IMAGE_URL,imageSha512=common.IMAGE_SHA,appimageZipPath='dist/T3.AppImage',appimageProofPath='release/T3.AppImage')

def archive_bytes(entries):
    b=io.BytesIO()
    with tarfile.open(fileobj=b,mode='w:gz') as t:
        for name,kind,data in entries:
            i=tarfile.TarInfo(name)
            if kind=='link':i.type=tarfile.SYMTYPE;i.linkname='/tmp/escape';t.addfile(i)
            elif kind=='dir':i.type=tarfile.DIRTYPE;t.addfile(i)
            elif kind=='device':i.type=tarfile.CHRTYPE;t.addfile(i)
            else:i.size=len(data);t.addfile(i,io.BytesIO(data))
    return b.getvalue()

def envelope(entries=None):
    data=archive_bytes(entries or [('status.json','file',b'{}')])
    return f'T3_RESULT_BEGIN {len(data)} {hashlib.sha256(data).hexdigest()}\n'.encode()+base64.encodebytes(data)+b'\nT3_RESULT_END\n'

class Transport(unittest.TestCase):
    def decode(self,data,okay=False):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);(p/'log').write_bytes(data)
            if okay:decode_serial.decode(p/'log',p/'out');self.assertTrue((p/'out/status.json').is_file())
            else:
                with self.assertRaises((ValueError,tarfile.TarError)):decode_serial.decode(p/'log',p/'out')
                self.assertFalse((p/'out').exists())
    def test_valid(self):self.decode(envelope(),True)
    def test_crlf(self):self.decode(envelope().replace(b'\n',b'\r\n'),True)
    def test_duplicate(self):self.decode(envelope()+envelope())
    def test_truncated(self):self.decode(envelope()[:-20])
    def test_hash(self):
        e=envelope();head,rest=e.split(b'\n',1);head=head.rsplit(b' ',1)[0]+b' '+b'0'*64;self.decode(head+b'\n'+rest)
    def test_unsafe_members(self):
        for name,kind in [('../bad','file'),('/absolute','file'),('status.json','link'),('status.json','device'),('a\\b','file')]:
            with self.subTest(name=name,kind=kind):self.decode(envelope([(name,kind,b'{}')]))
    def test_normalized_duplicate(self):self.decode(envelope([('status.json','file',b'{}'),('./status.json','file',b'{}')]))
    def test_parent_conflict(self):self.decode(envelope([('status.json','file',b'{}'),('a','file',b'x'),('a/b','file',b'x')]))
    def test_missing_status(self):self.decode(envelope([('other','file',b'x')]))
    def test_unpack_tar_safety(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)
            for name,kind in [('../bad','file'),('a','link'),('a','device')]:
                (p/'a.tgz').write_bytes(archive_bytes([(name,kind,b'x')]))
                with self.assertRaises(ValueError):common.unpack_tar(p/'a.tgz',p/'out')
                self.assertFalse((p/'out').exists())
    def test_size_limit(self):
        with patch.object(decode_serial,'MAX_COMPRESSED',1):self.decode(envelope())

    def test_gnu_sparse_logical_expansion_rejected(self):
        header=bytearray(tarfile.TarInfo('status.json').tobuf(format=tarfile.GNU_FORMAT))
        header[156:157]=tarfile.GNUTYPE_SPARSE
        header[483:495]=('%011o'%32768).encode()+b'\0'
        header[148:156]=b'        '
        header[148:156]=('%06o'%sum(header)).encode()+b'\0 '
        raw=bytes(header)+b'\0'*2048;packed=gzip.compress(raw)
        frame=f'T3_RESULT_BEGIN {len(packed)} {hashlib.sha256(packed).hexdigest()}\n'.encode()+base64.encodebytes(packed)+b'\nT3_RESULT_END\n'
        with patch.object(decode_serial,'MAX_UNPACKED',8192):self.decode(frame)
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/'sparse.tgz').write_bytes(packed)
            with self.assertRaises(ValueError):common.unpack_tar(root/'sparse.tgz',root/'out',max_size=8192)

class Execution(unittest.TestCase):
    def test_subprocess_success(self):common.run([sys.executable,'-c','pass'],2)
    def test_subprocess_failure(self):
        with self.assertRaises(subprocess.CalledProcessError):common.run([sys.executable,'-c','raise SystemExit(7)'],2)
    def test_subprocess_timeout(self):
        with self.assertRaises(TimeoutError):common.run([sys.executable,'-c','import time;time.sleep(60)'],.05)
    def test_guest_timeout(self):
        with tempfile.TemporaryDirectory() as d:
            process=Mock();process.poll.return_value=None
            with patch('host.time.monotonic',side_effect=[0,2]),self.assertRaises(TimeoutError):host.await_frame(process,pathlib.Path(d)/'absent',1)
    def test_guest_early_exit(self):
        with tempfile.TemporaryDirectory() as d:
            process=Mock();process.poll.return_value=1
            with self.assertRaises(RuntimeError):host.await_frame(process,pathlib.Path(d)/'absent',1)
    def test_complete_frame(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'log';p.write_bytes(envelope());host.await_frame(Mock(),p,1)
    def test_seed_no_credentials(self):
        config=host.seed_config({'guest.py':'a'*64})
        self.assertEqual(config['users'],[]);self.assertEqual(config['ssh_genkeytypes'],[]);self.assertFalse(config['allow_public_ssh_keys']);self.assertFalse(config['ssh_publish_hostkeys']['enabled'])
        for key in ['password','chpasswd','ssh_keys','ssh_authorized_keys','ssh_import_id']:self.assertNotIn(key,config)
        compile(config['write_files'][0]['content'],'seed-entry.py','exec')
        self.assertEqual(config['runcmd'],[['python3','/run/t3-entry.py']])
    def test_seed_missing_virtio_port_still_powers_off(self):
        code=host.seed_config({})['write_files'][0]['content'];stderr=io.StringIO()
        with patch('pathlib.Path.mkdir'),patch('subprocess.run') as run_mock,patch('guest.main',side_effect=FileNotFoundError('virtio port absent')),patch('builtins.open',side_effect=FileNotFoundError('virtio port absent')) as open_mock,patch.object(sys,'path',sys.path.copy()),patch.object(sys,'stderr',stderr):
            with self.assertRaises(SystemExit) as stopped:exec(compile(code,'generated-seed.py','exec'),{})
            self.assertEqual(stopped.exception.code,1)
            self.assertIn(unittest.mock.call(['systemctl','poweroff'],check=True,timeout=15),run_mock.call_args_list)
            open_mock.assert_called_once_with('/dev/virtio-ports/org.t3.result','wb',buffering=0)
        self.assertLess(len(stderr.getvalue()),10000)
        self.assertIn('failure frame unavailable',stderr.getvalue())
        self.assertNotIn('T3_RESULT_BEGIN',stderr.getvalue())
        self.assertNotIn('"result": "passed"',stderr.getvalue())
    def test_nonroot_and_isolation_static(self):
        text=pathlib.Path(guest.__file__).read_text()
        self.assertIn("prefix=['runuser','-u','nobody'",text)
        self.assertEqual(text.count("run(prefix+['dbus-run-session'"),2)
        self.assertNotIn('dpkg -i',text);self.assertNotIn('apt-get install ./',text)
        self.assertNotIn('sysctl -w',text);self.assertNotIn('chmod 4755',text)
        hosttext=pathlib.Path(host.__file__).read_text();self.assertIn("'user,model=virtio-net-pci'",hosttext);self.assertNotIn('hostfwd=',hosttext)

    def test_host_log_cap(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/'console').write_bytes(b'123')
            with self.assertRaises(ValueError):host.await_frame(Mock(),root/'serial',1,[(root/'console',2)])
    def test_safe_always_collector(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);work=root/'work';work.mkdir();(work/'results').mkdir()
            (work/'results/status.json').write_text('{}');(work/'base.qcow2').write_text('never upload');(work/'seed.iso').write_text('never upload')
            (work/'results/link.log').symlink_to(work/'base.qcow2')
            report=collect_evidence.collect(work,root/'out')
            self.assertEqual(report['copied'],['results/status.json'])
            self.assertFalse((root/'out/base.qcow2').exists());self.assertFalse((root/'out/results/link.log').exists())

class Results(unittest.TestCase):
    def fixture(self,root,variant=0):
        import struct,zlib
        m=manifest();privacy_source=list(m['privacyClauses'])[variant];privacy_translation=m['privacyClauses'][privacy_source];(root/'clean').mkdir();(root/'cjk').mkdir()
        def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
        png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\xff\x00\x00'))+chunk(b'IEND',b'')
        renderer={'processType':'renderer','sandboxed':True,'contextIsolated':True}
        probe={'method':'CDP existing preload lexical scope','reloadSameFreshProfile':True,'preloadScripts':['/tmp/.mount_test/preload.cjs'],'preloadSha256':'1'*64,'breakpoint':{'lineNumber':1,'columnNumber':0}}
        executable='/var/tmp/t3-validation/work/app.AppImage';home='/tmp/t3-clean-first-start-synthetic';chome='/tmp/t3-cjk-check-synthetic'
        session={'backendSignalExits':[],'effectiveSandbox':{'renderer':renderer,'preferences':{'sandbox':True,'contextIsolation':True,'nodeIntegration':False},'switches':{'no-sandbox':False,'disable-setuid-sandbox':False,'disable-seccomp-filter-sandbox':False,'disable-gpu-sandbox':False}},'privacy_clause':{'source':privacy_source,'expected':privacy_translation,'visible':True},'rendered_chinese_fonts':{'text':'欢迎使用 T3 Code','fonts':[{'familyName':'Noto Sans CJK SC','glyphCount':6}]},'rendererProbe':probe,'requested_chromium_sandbox':True,'spawn_args':[executable,'--user-data-dir='+chome+'/electron-profile'],'packaged':{'isPackaged':True,'noSandbox':False,'userData':chome+'/config/app'},'locale':'zh-CN','page_errors':[],'console_errors':[],'url':'t3code://app/#/welcome','body_text':'欢迎使用 T3 Code 暂不配置 Agent，直接开始 启动 '+privacy_translation}
        names=['01-fonts-installed-english.png','02-chinese-selected.png','03-chinese-after-restart.png']
        screenshots=[]
        for name in names:
            (root/'cjk'/name).write_bytes(png);screenshots.append({'name':name,'size':len(png),'sha256':hashlib.sha256(png).hexdigest()})
        for name in ('clean-first-render.png','clean-first-start.png'):(root/'clean'/name).write_bytes(png)
        values={'security-defaults.json':{'kernel/unprivileged_userns_clone':'1','kernel/apparmor_restrict_unprivileged_userns':None,'user/max_user_namespaces':'100','apparmor_enabled':'Y'},'status.json':{'execution':{'id':'debian','versionId':'13','glibc':'glibc 2.41','architecture':'x86_64','securityDefaultsMember':'results/security-defaults.json','uid':65534,'executableSha256':m['executableSha256']},'result':'passed','exitCode':0,'sourceSha':m['sourceSha'],'appimageSha256':m['appimageSha256'],'cleanDriverSha256':common.CLEAN_SHA,'cjkDriverSha256':common.CJK_SHA},'clean/clean-first-start.json':{'backendSignalExits':[],'result':'passed','schemaVersion':2,'fixtureData':False,'requestedChromiumSandbox':True,'cliSandboxOverride':False,'profileIsolation':'unique temporary directory','testHome':home,'executable':executable,'spawnArgs':[executable,'--user-data-dir='+home+'/electron-profile'],'packaged':{'isPackaged':True,'userData':home+'/config/app'},'rendererProbe':probe,'firstRender':{'bodyText':'Synthetic only','windowUrl':'t3code://app/#/welcome','screenshot':'clean-first-render.png'},'bodyText':'Synthetic only','windowTitle':'Synthetic','windowUrl':'t3code://app/#/welcome','effectiveSandbox':{'renderer':renderer,'preferences':{'sandbox':True,'contextIsolation':True,'nodeIntegration':False},'switches':{'noSandbox':False,'disableSetuidSandbox':False,'disableSeccompFilterSandbox':False,'disableGpuSandbox':False}}},'cjk/linux-chinese-ui.json':{'kind':m['kind'],'evidence_type':m['mode'],'executable':{'path':executable,'sha256':m['executableSha256']},'schema_version':2,'passed':True,'persisted_restart':True,'source':{'sha':m['sourceSha'],'tree':m['sourceTree']},'producer':{'run_id':m['producerRunId'],'run_attempt':m['producerRunAttempt'],'artifact_id':m['artifactId']},'asset':{'sha256':m['appimageSha256'],'size':100},'driver_sha256':common.CJK_SHA,'playwright_version':'1.60.0','environment':{'distro':{'ID':'debian','VERSION_ID':'13'},'uid':65534,'kernel':'synthetic-kernel'},'profile':{'home':chome,'t3Home':chome+'/t3','initially_empty':True,'restart_reuses_same_profile':True},'language_selection':'actual combobox and option clicks','privacy_observation':{'source_clause':privacy_source,'expected_translation':privacy_translation,'observed_before_language_selection':True,'visible':True,'english_paragraph':privacy_source+' privacy policy.'},'sessions':[session,copy.deepcopy(session)],'screenshots':screenshots},'fuse.json':{'observed':True,'artifactSha256':m['appimageSha256'],'uid':65534,'exe':'/tmp/.mount_synthetic/app','mountinfo':['synthetic fuse record']}}
        fonts={'distro':'ID=debian\nVERSION_ID=\"13\"\n','font_match':'Noto Sans CJK SC','noto_package':'fonts-noto-cjk synthetic'}
        values['cjk/font-evidence.json']=fonts;values['cjk/linux-chinese-ui.json']['font_environment']=fonts
        for name,v in values.items():(root/name).write_text(json.dumps(v))
        return m,values
    def test_pass(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);m,_=self.fixture(root);common.validate_results(root,m)
    def test_failure_cannot_pass(self):
        for filename,key,value in [('status.json','exitCode',1),('status.json','result','failed'),('clean/clean-first-start.json','result','failed'),('clean/clean-first-start.json','backendSignalExits',[{'pid':4865,'signal':'SIGSEGV'}]),('clean/clean-first-start.json','backendSignalExits',None),('cjk/linux-chinese-ui.json','persisted_restart',False),('fuse.json','observed',False)]:
            with self.subTest(filename=filename,key=key),tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);m,values=self.fixture(root);values[filename][key]=value;(root/filename).write_text(json.dumps(values[filename]))
                with self.assertRaises(ValueError):common.validate_results(root,m)
    def test_second_privacy_clause_required(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);m,v=self.fixture(root);v['cjk/linux-chinese-ui.json']['sessions'][1]['privacy_clause']['visible']=False;(root/'cjk/linux-chinese-ui.json').write_text(json.dumps(v['cjk/linux-chinese-ui.json']))
            with self.assertRaises(ValueError):common.validate_results(root,m)
    def test_png_is_required(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);m,_=self.fixture(root);(root/'clean/clean-first-render.png').unlink()
            with self.assertRaises((ValueError,FileNotFoundError)):common.validate_results(root,m)
    def test_schema_and_identity_are_required(self):
        for filename,key,value in [('clean/clean-first-start.json','schemaVersion',1),('clean/clean-first-start.json','firstRender',{}),('clean/clean-first-start.json','fixtureData',True),('cjk/linux-chinese-ui.json','driver_sha256','0'*64),('cjk/linux-chinese-ui.json','screenshots',[])]:
            with self.subTest(key=key),tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);m,v=self.fixture(root);v[filename][key]=value;(root/filename).write_text(json.dumps(v[filename]))
                with self.assertRaises(ValueError):common.validate_results(root,m)
    def test_real_glyphs_and_png_hashes_required(self):
        for fault in ('glyphs','pnghash','locale','backendSignal','missingBackendSignal'):
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);m,v=self.fixture(root);c=v['cjk/linux-chinese-ui.json']
                if fault=='glyphs':c['sessions'][1]['rendered_chinese_fonts']['fonts'][0]['glyphCount']=0
                elif fault=='pnghash':c['screenshots'][1]['sha256']='0'*64
                elif fault=='backendSignal':c['sessions'][1]['backendSignalExits']=[{'pid':4865,'signal':'SIGSEGV'}]
                elif fault=='missingBackendSignal':del c['sessions'][1]['backendSignalExits']
                else:c['sessions'][1]['locale']='en'
                (root/'cjk/linux-chinese-ui.json').write_text(json.dumps(c))
                with self.assertRaises(ValueError):common.validate_results(root,m)
    def test_truncated_png_header_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);m,_=self.fixture(root);f=root/'clean/clean-first-render.png';f.write_bytes(f.read_bytes()[:33]+b'x')
            with self.assertRaises(ValueError):common.validate_results(root,m)
    def test_boolean_shaped_numbers_rejected(self):
        for location in ('sandbox','privacy'):
            with self.subTest(location=location),tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);m,v=self.fixture(root);c=v['cjk/linux-chinese-ui.json']
                if location=='sandbox':c['sessions'][1]['effectiveSandbox']['renderer']['sandboxed']=1
                else:c['sessions'][1]['privacy_clause']['visible']=1
                (root/'cjk/linux-chinese-ui.json').write_text(json.dumps(c))
                with self.assertRaises(ValueError):common.validate_results(root,m)
    def test_profile_traversal_and_duplicate_profile_args(self):
        for fault in ('traversal','duplicate'):
            with self.subTest(fault=fault),tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);m,v=self.fixture(root);c=v['clean/clean-first-start.json']
                if fault=='traversal':c['packaged']['userData']=c['testHome']+'/../outside'
                else:c['spawnArgs'].append('--user-data-dir=/tmp/other')
                (root/'clean/clean-first-start.json').write_text(json.dumps(c))
                with self.assertRaises(ValueError):common.validate_results(root,m)
    def test_both_observed_privacy_variants_pass(self):
        for variant in (0,1):
            with self.subTest(variant=variant),tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);m,_=self.fixture(root,variant);common.validate_results(root,m)
    def test_wrong_privacy_variant_and_restart_switch_rejected(self):
        for original in (0,1):
            for fault in ('wrong_translation','restart_switch','untranslated_managed','untranslated_optional','ambiguous_observation'):
                with self.subTest(original=original,fault=fault),tempfile.TemporaryDirectory() as d:
                    root=pathlib.Path(d);m,v=self.fixture(root,original);c=v['cjk/linux-chinese-ui.json'];sources=list(common.PRIVACY_CLAUSES);expected=common.PRIVACY_CLAUSES[sources[original]];other=common.PRIVACY_CLAUSES[sources[1-original]]
                    if fault=='wrong_translation':c['privacy_observation']['expected_translation']=other
                    elif fault=='restart_switch':
                        c['sessions'][1]['privacy_clause']={'source':sources[1-original],'expected':other,'visible':True}
                        c['sessions'][1]['body_text']=c['sessions'][1]['body_text'].replace(expected,other)
                    elif fault=='ambiguous_observation':c['privacy_observation']['english_paragraph']+=' '+sources[1-original]
                    else:c['sessions'][1]['body_text']+=' '+sources[0 if fault=='untranslated_managed' else 1]
                    (root/'cjk/linux-chinese-ui.json').write_text(json.dumps(c))
                    with self.assertRaises(ValueError):common.validate_results(root,m)

if __name__=="__main__":unittest.main(verbosity=2)

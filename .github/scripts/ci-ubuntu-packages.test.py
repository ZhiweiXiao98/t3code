import importlib.util,json,os,pathlib,shlex,shutil,subprocess,tempfile,unittest
from unittest import mock
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('helper', ROOT/'.github/scripts/ci-ubuntu-packages.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
CLI=ROOT/'apps/server/node_modules/playwright-core/cli.js'
CAPTURE="// Unit instrumentation only: records the real CLI's apt simulation request without running it.\nconst fs = require('node:fs');\nconst cp = require('node:child_process');\ncp.spawn = (command, args) => {\n  if (command !== 'apt-get' || JSON.stringify(args.slice(0, 3)) !== JSON.stringify(['install', '-s', '--no-install-recommends'])) throw new Error('Unexpected subprocess');\n  fs.writeFileSync(process.env.CAPTURE_FILE, JSON.stringify({command, args}));\n  throw new Error('TEST_ONLY_CAPTURE_COMPLETE');\n};\n"
class HelperTests(unittest.TestCase):
 def test_packages(self):
  result=helper.command_plan('packages',['libsecret-1-dev','xvfb'],'/tmp/test.conf',True)
  self.assertEqual(result[0],['sudo','env','APT_CONFIG=/tmp/test.conf','apt-get','update'])
  self.assertEqual(result[1][-5:],['install','-y','--no-install-recommends','libsecret-1-dev','xvfb'])
 def test_no_argument_injection(self):
  for arg in ['--allow-unauthenticated','foo;true','foo=1','$(whoami)','../foo']:
   with self.assertRaises(AssertionError):helper.command_plan('packages',[arg],'/tmp/test.conf')
 def test_official_installer_only(self):
  plan=helper.command_plan('playwright',[str(CLI)],'/tmp/test.conf')
  self.assertEqual(len(plan),1);self.assertEqual(plan[0][-2:],['install-deps','chromium'])
  self.assertIn('APT_CONFIG=/tmp/test.conf',plan[0]);self.assertIn('NODE_OPTIONS=',plan[0]);self.assertIn('NODE_PATH=',plan[0])
  self.assertNotIn('--with-deps',plan[0]);self.assertNotIn('test',plan[0])
 def test_wrong_installer_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'cli.js';p.write_text('');p.with_name('package.json').write_text('{"name":"other","version":"1.64.1"}')
   with self.assertRaises(AssertionError):helper.command_plan('playwright',[str(p)],'/tmp/test.conf')
 def test_node_multiplexer_uses_actual_interpreter(self):
  clean={k:v for k,v in os.environ.items() if k not in {'NODE_OPTIONS','NODE_PATH'}}
  real_node=pathlib.Path(subprocess.check_output(['node','-p','process.execPath'],env=clean,text=True).strip()).resolve()
  self.assertTrue(real_node.is_absolute() and os.access(real_node,os.X_OK))
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);mux=root/'vp';shim=root/'node'
   mux.write_text('#!/bin/sh\ncase "${0##*/}" in node) exec '+shlex.quote(str(real_node))+' "$@" ;; *) echo "vp: unknown command" >&2; exit 2 ;; esac\n');mux.chmod(0o755);shim.symlink_to(mux)
   env={'PATH':str(root)+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--require /missing-must-not-load','NODE_PATH':'/missing-must-not-load'}
   with mock.patch.dict(os.environ,env):
    plan=helper.command_plan('playwright',[str(CLI)],'/tmp/test.conf')
   actual=pathlib.Path(plan[0][-4]);self.assertEqual(actual,real_node)
   executed=json.loads(subprocess.check_output([str(actual),'-p','JSON.stringify({execPath:process.execPath,release:process.release.name})'],text=True))
   self.assertEqual(executed['release'],'node');self.assertEqual(pathlib.Path(executed['execPath']).resolve(),actual)
 def test_node_discovery_rejects_bad_metadata(self):
  for info in [{'execPath':'relative/node','release':'node','version':'v26.12.1'},{'execPath':'/missing/node','release':'node','version':'v26.12.1'},{'execPath':'/bin/sh','release':'python','version':'v26.12.1'},{'execPath':'/bin/sh','release':'node','version':'not-semver'}]:
   with mock.patch.object(helper.subprocess,'check_output',return_value=json.dumps(info)):
    with self.assertRaises(AssertionError):helper.node_interpreter()
 def test_node_discovery_rejects_nonexecutable(self):
  with tempfile.TemporaryDirectory() as d:
   executable=pathlib.Path(d)/'node';executable.write_text('not executable');executable.chmod(0o644)
   info={'execPath':str(executable),'release':'node','version':'v26.12.1'}
   with mock.patch.object(helper.subprocess,'check_output',return_value=json.dumps(info)):
    with self.assertRaises(AssertionError):helper.node_interpreter()
 def test_node_discovery_rejects_runtime_mismatch(self):
  executable=helper.node_interpreter();first={'execPath':str(executable),'release':'node','version':'v26.12.1'};second=dict(first,version='v24.22.2')
  with mock.patch.object(helper.subprocess,'check_output',side_effect=[json.dumps(first),json.dumps(second)]):
   with self.assertRaises(AssertionError):helper.node_interpreter()
 def test_actual_pinned_cli_dryrun_capture(self):
  for platform in ['ubuntu22.04-x64','ubuntu24.04-x64']:
   with tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d)/'capture.json';env=dict(os.environ,PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=platform,CAPTURE_FILE=str(p));env.pop('NODE_OPTIONS',None)
    instrument=pathlib.Path(d)/'capture.cjs';instrument.write_text(CAPTURE)
    result=subprocess.run(['node','--require',str(instrument),str(CLI),'install-deps','chromium','--dry-run'],env=env,capture_output=True,text=True)
    self.assertEqual(result.returncode,1);self.assertIn('TEST_ONLY_CAPTURE_COMPLETE',result.stdout+result.stderr)
    capture=json.loads(p.read_text());args=capture['args'];self.assertEqual(args[:3],['install','-s','--no-install-recommends'])
    for name in ['fonts-wqy-zenhei','fonts-ipafont-gothic','xfonts-scalable','fonts-freefont-ttf','xvfb']:self.assertIn(name,args)
    self.assertEqual(len(set(args[3:])),len(args[3:]))



class SourcesTest(unittest.TestCase):
 def test_jammy(self):
  text='# comment\ndeb [arch=amd64 signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] mirror+file:/etc/apt/apt-mirrors.txt jammy main universe\ndeb https://packages.microsoft.com/repos/azure-cli/ jammy main\n'
  actual=helper.rewrite(text,'.list','mirror+file:/tmp/probe/mirrors.txt')
  self.assertEqual(actual,'deb [arch=amd64 signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] mirror+file:/tmp/probe/mirrors.txt jammy main universe\n')
 def test_noble(self):
  text='Types: deb deb-src\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-backports noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n'
  self.assertEqual(helper.rewrite(text,'.sources','mirror+file:/tmp/probe/mirrors.txt'),text.replace('mirror+file:/etc/apt/apt-mirrors.txt','mirror+file:/tmp/probe/mirrors.txt'))
 def test_direct(self):
  self.assertEqual(helper.rewrite('deb http://azure.archive.ubuntu.com/ubuntu/ jammy main\n','.list','unused'),'deb https://mirrors.kernel.org/ubuntu jammy main\n')
 def test_security(self):
  self.assertEqual(helper.rewrite('deb http://security.ubuntu.com/ubuntu jammy-security main\n','.list','unused'),'deb https://mirrors.kernel.org/ubuntu jammy-security main\n')
 def test_trust_rejected(self):
  for text,suffix in [('deb [trusted=yes] http://archive.ubuntu.com/ubuntu jammy main','.list'),('Types: deb\nURIs: https://archive.ubuntu.com/ubuntu\nTrusted: yes\nSuites: noble\nComponents: main','.sources')]:
   with self.assertRaises(AssertionError): helper.rewrite(text,suffix,'unused')
 def test_mixed_rejected(self):
  with self.assertRaises(AssertionError):helper.rewrite('Types: deb\nURIs: https://archive.ubuntu.com/ubuntu https://evil.example\nSuites: noble','.sources','unused')
 def test_multiline_rejected(self):
  with self.assertRaises(AssertionError):helper.rewrite('Types: deb\nURIs: https://archive.ubuntu.com/ubuntu\n https://evil.example\nSuites: noble','.sources','unused')
 def test_unknown_omitted(self):
  self.assertEqual(helper.rewrite('Types: deb\nURIs: https://packages.microsoft.com/repos/code\nSuites: stable\nComponents: main','.sources','unused'),'')
 def test_prepare_immutable(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d)/'etc-apt';root.mkdir();(root/'sources.list.d').mkdir();(root/'sources.list').write_text('deb mirror+file:/etc/apt/apt-mirrors.txt jammy main universe\n');(root/'apt-mirrors.txt').write_text('http://azure.archive.ubuntu.com/ubuntu priority:1\nhttps://archive.ubuntu.com/ubuntu priority:2\nhttps://security.ubuntu.com/ubuntu priority:3\n')
   original={str(x):x.read_bytes() for x in root.rglob('*') if x.is_file()};output=pathlib.Path(d)/'copy';helper.prepare(root,output)
   self.assertEqual(original,{str(x):x.read_bytes() for x in root.rglob('*') if x.is_file()});self.assertEqual((output/'official-mirrors.txt').read_text(),'https://mirrors.kernel.org/ubuntu\n')
 def test_no_network_security_changes(self):
  text='Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n'
  result=helper.rewrite(text,'.sources','mirror+file:/tmp/copy')
  self.assertEqual(result.replace('mirror+file:/tmp/copy','mirror+file:/etc/apt/apt-mirrors.txt'),text)



unittest.main()

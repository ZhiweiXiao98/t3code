"""Bounded synthetic diagnostics only; no guest, app, journal or VM execution."""
import json,pathlib,sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import collect_evidence,guest,native_deb

class Diagnostics(unittest.TestCase):
    def test_command_byte_cap_and_timeout(self):
        result=guest.diagnostic_command([sys.executable,'-c','import sys;sys.stdout.write("x"*1000000)'],limit=127)
        self.assertEqual(result['status'],'truncated');self.assertEqual(result['text'],'x'*127)
        result=guest.diagnostic_command([sys.executable,'-c','import time;time.sleep(60)'],timeout=.1)
        self.assertEqual(result['status'],'timeout');self.assertIsNotNone(result['exitCode'])

    def test_command_exit_and_missing_tool(self):
        result=guest.diagnostic_command([sys.executable,'-c','import sys;print("synthetic");sys.exit(3)'])
        self.assertEqual(result,{'status':'complete','exitCode':3,'text':'synthetic\n'})
        with patch.object(guest.subprocess,'Popen',side_effect=FileNotFoundError()):
            self.assertEqual(guest.diagnostic_command(['absent']),{'status':'unavailable','errorType':'FileNotFoundError'})

    def test_files_signals_and_collector_preserve_diagnostics(self):
        with tempfile.TemporaryDirectory() as directory:
            work=pathlib.Path(directory);root=work/'results';root.mkdir();proc=work/'proc';proc.mkdir()
            (proc/'cpuinfo').write_text('vendor_id : TestVendor\nflags : sse2 avx\nSerial : PRIVATE\n\nflags : second_cpu\n')
            log=root/'clean/logs/server-child.log';log.parent.mkdir(parents=True)
            event={'timestamp':'2026-11-11T08:28:22Z','annotations':{'phase':'END','details':'pid=4865 killed by SIGSEGV'},'other':'PRIVATE'}
            log.write_text('\n'.join(['not json','null',json.dumps({'annotations':None}),json.dumps(event)]))
            with patch.object(guest,'diagnostic_command',return_value={'status':'complete','text':'bounded'}) as run:
                report=guest.collect_diagnostics(root,proc)
            self.assertEqual(run.call_count,3)
            self.assertEqual(report['backendSignals'],[{'member':'clean/logs/server-child.log','pid':4865,'signal':'SIGSEGV','timestamp':'2026-11-11T08:28:22Z'}])
            self.assertEqual(report['corePattern']['status'],'unavailable')
            self.assertNotIn('PRIVATE',json.dumps(report));self.assertNotIn('second_cpu',report['cpu']['text'])
            for call in run.call_args_list:
                self.assertNotIn('dump',call.args[0]);self.assertNotIn('info',call.args[0])
            collection=collect_evidence.collect(work,work/'export')
            self.assertIn('results/diagnostics.json',collection['copied'])
            self.assertEqual(json.loads((work/'export/results/diagnostics.json').read_text()),report)

    def test_file_cap_and_symlink_omission(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);source=root/'large';source.write_bytes(b'x'*100)
            self.assertEqual(guest.diagnostic_file(source,8),{'status':'truncated','text':'xxxxxxxx'})
            (root/'clean').symlink_to(root,target_is_directory=True)
            with patch.object(guest,'diagnostic_command',return_value={'status':'unavailable'}):
                report=guest.collect_diagnostics(root,root/'missing-proc')
            self.assertEqual(report['backendLogs'][0]['directoryStatus'],'symlink-omitted');self.assertEqual(report['backendSignals'],[])

    def test_both_lanes_rotations_and_caps(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            event=json.dumps({'timestamp':'now','annotations':{'phase':'END','details':'pid=7 killed by SIGSEGV'}})
            for lane in ('clean','cjk'):
                logs=root/lane/'logs';logs.mkdir(parents=True)
                (logs/'server-child.log').write_text(event)
                for number in range(1,10):(logs/f'server-child.log.{number}').write_text(event)
                (logs/'server-child.log.secrets').write_text('PRIVATE')
            with patch.object(guest,'diagnostic_command',return_value={'status':'unavailable'}):
                report=guest.collect_diagnostics(root,root/'missing-proc')
            self.assertEqual(len(report['backendSignals']),16)
            self.assertTrue(all(item['fileLimitReached'] for item in report['backendLogs'] if 'lane' in item))
            self.assertTrue(any(item['member']=='cjk/logs/server-child.log.1' for item in report['backendSignals']))
            self.assertNotIn('PRIVATE',json.dumps(report))

    def test_native_finally_on_success_and_failure(self):
        import ast
        tree=ast.parse(pathlib.Path(native_deb.__file__).read_text())
        main=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='main')
        final=next(node for node in main.body if isinstance(node,ast.Try)).finalbody
        for failed,collection_failed in ((False,False),(True,False),(False,True),(True,True)):
            with self.subTest(failed=failed,collection_failed=collection_failed),tempfile.TemporaryDirectory() as directory:
                results=pathlib.Path(directory);status={'result':'failed' if failed else 'passed'}
                def collector(root):
                    if collection_failed:raise OSError('synthetic diagnostics unavailable')
                    (root/'diagnostics.json').write_text('{}')
                # Execute only the real finally block around a synthetic body; no native lane operations.
                scope={'results':results,'status':status,'collect_diagnostics':collector,'json':json}
                code='try:\n    '+('raise ValueError("synthetic")' if failed else 'pass')+'\nfinally:\n'
                code+='\n'.join('    '+line for node in final for line in ast.unparse(node).splitlines())
                if failed:
                    with self.assertRaises(ValueError):exec(code,scope)
                else:exec(code,scope)
                self.assertTrue((results/'diagnostics.json').exists())
                self.assertEqual(json.loads((results/'status.json').read_text()),status)
                if collection_failed:self.assertEqual(json.loads((results/'diagnostics.json').read_text())['status'],'collection-failed')

    def test_imports_do_not_launch_processes(self):
        import importlib
        with patch.object(guest.subprocess,'Popen',side_effect=AssertionError('unexpected process')):
            importlib.reload(guest);importlib.reload(native_deb)

    def test_collection_is_in_finally_before_transport(self):
        import ast
        tree=ast.parse(pathlib.Path(guest.__file__).read_text())
        main=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='main')
        final=next(node for node in main.body if isinstance(node,ast.Try)).finalbody
        calls=[node.func.id for statement in final for node in ast.walk(statement)
               if isinstance(node,ast.Call) and isinstance(node.func,ast.Name)]
        self.assertLess(calls.index('collect_diagnostics'),calls.index('emit'))

if __name__=='__main__':unittest.main(verbosity=2)

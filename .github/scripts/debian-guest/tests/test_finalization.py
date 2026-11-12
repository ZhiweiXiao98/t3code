"""Exercise real writer shutdown without a VM, network, or app execution."""
import ast
import inspect
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import collect_evidence
import host
import native_deb
import test_receipt
import validate_receipt


class Finalization(unittest.TestCase):
    def fixture(self, root):
        test_receipt.Receipt().fixture(root)
        work = root / 'work'
        shutil.rmtree(work / 'provenance-stage')
        (work / 'provenance.json').unlink()
        return work

    def test_shutdown_log_is_in_final_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            work = self.fixture(root)
            ready = root / 'ready'
            child = '''import os,pathlib,signal,sys,time
signal.signal(signal.SIGTERM, lambda *args: (print('QEMU shutdown diagnostic', flush=True), sys.exit(0)))
pathlib.Path(sys.argv[1]).touch()
while True: time.sleep(.01)
'''
            processes = []
            popen = subprocess.Popen
            def spawn(*args, **kwargs):
                process = popen(*args, **kwargs)
                processes.append(process)
                return process
            def await_ready(*args, **kwargs):
                deadline = time.monotonic() + 5
                while not ready.exists():
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Fixture writer did not start')
                    time.sleep(.01)
            original = pathlib.Path.read_text
            def read_text(path, *args, **kwargs):
                if str(path) == '/etc/os-release':
                    return 'ID=ubuntu\nVERSION_ID="24.04"\n'
                return original(path, *args, **kwargs)
            manifest = json.loads((work / 'manifest.json').read_text())
            evidence = json.loads((work / 'github-evidence.json').read_text())
            # Run the production lifecycle tail, excluding image/network setup.
            body = ast.parse(inspect.getsource(host.main_impl)).body[0].body
            start = next(i for i, node in enumerate(body) if isinstance(node, ast.Assign)
                         and any(isinstance(target, ast.Name) and target.id == 'process' for target in node.targets))
            code = compile(ast.Module(body=body[start:], type_ignores=[]), host.__file__, 'exec')
            scope = dict(vars(host), work=work, m=manifest, evidence=evidence, ctx=None,
                         job_log='unused', args=types.SimpleNamespace(source_checkout=root),
                         command=[sys.executable, '-c', child, str(ready)],
                         OPERATION_DEADLINE=time.monotonic()+30)
            scope.update(await_frame=await_ready, decode=lambda *args: None,
                         validate_source=lambda *args: None,
                         snapshot=lambda *args: (evidence, 'unused'),
                         validate_pair=lambda *args: None)
            try:
                with patch.object(pathlib.Path, 'read_text', read_text), patch.object(subprocess, 'Popen', spawn):
                    exec(code, scope)
                self.assertTrue(processes and all(process.poll() is not None for process in processes))
                self.assertEqual((work / 'qemu.log').read_text(), 'QEMU shutdown diagnostic\n')
                destination = root / 'upload'
                collect_evidence.collect(work, destination)
                validate_receipt.validate(destination)
            finally:
                for process in processes:
                    if process.poll() is None:
                        os.killpg(process.pid, 9)
                        process.wait(timeout=5)

    def test_native_diagnostics_finalized_before_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            test_receipt.Receipt().fixture(root, 'deb')
            work = root / 'work'
            shutil.rmtree(work / 'provenance-stage')
            (work / 'provenance.json').unlink()
            # Retain production try/finally and provenance calls, replacing only
            # app execution/setup with the already validated native fixture.
            body = ast.parse(inspect.getsource(native_deb.main)).body[0].body
            start = next(i for i, node in enumerate(body) if isinstance(node, ast.Try))
            tail = body[start:]
            tail[0].body = [ast.Pass()] + [node for node in tail[0].body
                if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
                and isinstance(node.value.func, ast.Name) and node.value.func.id == 'emit_provenance']
            code = compile(ast.fix_missing_locations(ast.Module(body=tail, type_ignores=[])), native_deb.__file__, 'exec')
            def diagnostics(results):
                (results / 'diagnostics.json').write_text('{"status":"finalized"}')
            original = pathlib.Path.read_text
            def read_text(path, *args, **kwargs):
                return 'ID=ubuntu\nVERSION_ID="24.04"\n' if str(path) == '/etc/os-release' else original(path, *args, **kwargs)
            scope = dict(vars(native_deb), work=work, results=work / 'results',
                         m=json.loads((work / 'manifest.json').read_text()),
                         before=json.loads((work / 'github-evidence.json').read_text()),
                         status=json.loads((work / 'results/status.json').read_text()),
                         collect_diagnostics=diagnostics)
            with patch.object(pathlib.Path, 'read_text', read_text):
                exec(code, scope)
            collect_evidence.collect(work, root / 'upload')
            validate_receipt.validate(root / 'upload')

    def test_upload_accepts_final_receipts(self):
        for kind in ('appimage', 'deb'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                test_receipt.Receipt().fixture(root, kind)
                result = subprocess.run([sys.executable, str(pathlib.Path(collect_evidence.__file__)),
                                         '--workdir', str(root / 'work'), '--out', str(root / 'upload')],
                                        capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stderr)
                validate_receipt.validate(root / 'upload')

    def test_upload_rejects_post_inventory_log_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            test_receipt.Receipt().fixture(root)
            work = root / 'work'
            (work / 'qemu.log').write_text('late shutdown diagnostic\n')
            result = subprocess.run([sys.executable, str(pathlib.Path(collect_evidence.__file__)),
                                     '--workdir', str(work), '--out', str(root / 'upload')],
                                    capture_output=True, text=True, timeout=15)
            self.assertNotEqual(result.returncode, 0, 'Upload collector accepted evidence after its inventory changed')
            self.assertTrue((root / 'upload' / 'qemu.log').exists(), 'Failure diagnostics must remain available')


if __name__ == '__main__':
    unittest.main(verbosity=2)

import base64, copy, json, os, pathlib, signal, subprocess, tempfile, unittest
from unittest.mock import patch
import common, host, prepare
H='a'*64

def fixture(guest=False):
    rows=[]
    for case in common.CASES:
        if case.startswith('negative'):
            data={'signal':'SIGSEGV','gatherSite':'other' if case=='negative-scalar' else 'all_active'}; rc=139
        elif case=='parallel':
            data=dict(mode=case,threads=2,distinctCpuAffinity=True,stage=['complete','complete'],checks=[98336,98336],checksum=[3254521887,2295199211],rounds=4096); rc=0
        else:
            data=dict(mode=case,stage='complete' if case=='single' else 'gather_all_active_value',checks=98336 if case=='single' else 0,checksum=3254521887 if case=='single' else 0,rounds=4096); rc=0 if case=='single' else 1
        rows.append(dict(case=case,returnCode=rc,data=data,passed=True,elapsedMs=1))
    env=dict(osId='debian' if guest else 'ubuntu',osVersion='13' if guest else '24.04',machine='x86_64',kernel='6.12.0',onlineCpuCount=2,allowedCpuCount=2,pageSize=4096,avx2=True,memoryKiB=4000000)
    suite=dict(schemaVersion=1,label='same-tcg-multi' if guest else 'actions-native',purpose=common.PURPOSE,binarySha256=H,complete=True,results=rows)
    return dict(environment=env,binarySha256=H,elapsedMs=10,error=None,suite=suite)

class Wrapper(unittest.TestCase):
    def test_complete(self):
        self.assertEqual(common.classify(fixture(),fixture(True),H),'non_reproduction_stop')
    def test_second_reader_divergence(self):
        guest=fixture(True); guest['suite']['results'][4]['data']['checksum'][1]^=1
        self.assertEqual(common.classify(fixture(),guest,H),'checksum_divergence_stop')
    def test_actual_environments_required(self):
        for key,value in [('osId','ubuntu'),('osVersion','24.04'),('onlineCpuCount',3),('allowedCpuCount',1),('pageSize',True),('avx2',False),('kernel','private\ntext'),('memoryKiB',1)]:
            with self.subTest(key=key),self.assertRaises(common.BoundError):
                guest=fixture(True);guest['environment'][key]=value;common.check_cell(guest,True,H)
    def test_bad_shape_types_counts(self):
        changes=[('binarySha256','b'*64),('elapsedMs',True),('error','secret')]
        for key,value in changes:
            with self.subTest(key=key),self.assertRaises(common.BoundError):
                guest=fixture(True);guest[key]=value;common.check_cell(guest,True,H)
        for value in (True,1.0,98335):
            with self.subTest(value=value),self.assertRaises(common.BoundError):
                guest=fixture(True);guest['suite']['results'][4]['data']['checks'][1]=value;common.check_cell(guest,True,H)
    def test_no_later_results_after_failure(self):
        guest=fixture(True);guest['suite']['results'][0]['passed']=False
        with self.assertRaises(common.BoundError):common.check_cell(guest,True,H)
    def test_fault_attribution(self):
        for site,expected in [('all_active','synthetic_all_active_discrepancy_stop'),('masked','synthetic_masked_discrepancy_stop'),('other','guest_inconclusive_stop')]:
            guest=fixture(True);guest['suite']['complete']=False;guest['suite']['results']=guest['suite']['results'][:4]
            guest['suite']['results'][3].update(returnCode=139,data={'signal':'SIGSEGV','gatherSite':site},passed=False)
            self.assertEqual(common.classify(fixture(),guest,H),expected)
    def test_native_failure_disallows_guest(self):
        native=fixture();native.update(environment=None,error='timeout',suite=None)
        self.assertEqual(common.classify(native,None,H),'native_incomplete_stop')
        with self.assertRaises(common.BoundError):common.classify(native,fixture(True),H)
    def test_error_does_not_retain_unchecked_output(self):
        guest=fixture(True);guest['error']='invalid_result'
        with self.assertRaises(common.BoundError):common.check_cell(guest,True,H)
    def test_json_rejects_duplicates_nonfinite(self):
        for text in ('{"x":1,"x":2}','{"x":NaN}','{"x":Infinity}'):
            with self.assertRaises(ValueError):common.loads(text)
    def test_serial_complete_partial_rejects(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/'serial'; encoded=base64.b64encode(json.dumps(fixture(True)).encode())
            self.assertEqual(host.read_frame(p,H),(False,None))
            for data,ready in [(b'T3_GAT',False),(b'T3_GATHER_READY\n',True),(b'T3_GATHER_READY\nT3_GATHER_RES',True)]:
                p.write_bytes(data);self.assertEqual(host.read_frame(p,H),(ready,None))
            frame=b'T3_GATHER_READY\nT3_GATHER_RESULT '+encoded+b'\n';p.write_bytes(frame)
            self.assertEqual(host.read_frame(p,H),(True,fixture(True)))
            for bad in (frame+b'private',frame+b'\n',b'unknown\n',b'x'*32769,b'T3_GATHER_READY\nT3_GATHER_RESULT ???\n'):
                p.write_bytes(bad)
                with self.assertRaises((common.BoundError,ValueError)):host.read_frame(p,H)
    def test_argv_exact(self):
        work=pathlib.Path('/fixed');cmd=host.command(work,'/usr/bin/qemu-system-x86_64')
        self.assertIn('tcg,thread=multi',host.normalized(cmd,work,cmd[0]))
        cmd[2]='kvm'
        with self.assertRaises(common.BoundError):host.normalized(cmd,work,cmd[0])
    def test_process_timeout_and_reap(self):
        seen=[]; original=common.spawn
        def capture(*args,**kwargs):
            result=original(*args,**kwargs);seen.append(result[0]);return result
        with patch.object(common,'spawn',capture),self.assertRaises(common.BoundError):
            common.run(['python3','-c','import time; time.sleep(20)'],0.1)
        self.assertIsNotNone(seen[0].poll())
    def test_output_budget(self):
        with self.assertRaises(common.BoundError):
            common.run(['python3','-c','print("x"*20000)'],2)
    def test_cleanup_defers_sigterm_until_child_reaped(self):
        old={sig:signal.getsignal(sig) for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM)}
        child=None; sender=None
        try:
            child=subprocess.Popen(['python3','-u','-c','import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print("ready"); time.sleep(20)'],stdout=subprocess.PIPE,start_new_session=True)
            self.assertEqual(child.stdout.readline(),b'ready\n')
            signal.signal(signal.SIGTERM,common.cancellation)
            sender=subprocess.Popen(['python3','-c',f'import os,signal,time;time.sleep(0.1);os.kill({os.getpid()},signal.SIGTERM)'],start_new_session=True)
            with self.assertRaises(common.BoundError):
                common.stop(child)
            self.assertIsNotNone(child.poll(), 'cleanup was interrupted before reaping')
        finally:
            for sig,handler in old.items():signal.signal(sig,handler)
            for process in (child,sender):
                if process is not None:
                    try:os.killpg(process.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                    process.wait(timeout=2)
            if child is not None:child.stdout.close()
    def test_spawn_defers_alarm_until_owner_assignment(self):
        seen=[]; original=subprocess.Popen; old=signal.getsignal(signal.SIGALRM)
        def alarm(signum,frame):raise common.BoundError('timeout')
        def create(*args,**kwargs):
            process=original(*args,**kwargs);seen.append(process)
            os.kill(os.getpid(),signal.SIGALRM)
            return process
        try:
            signal.signal(signal.SIGALRM,alarm)
            with patch.object(common.subprocess,'Popen',side_effect=create),self.assertRaises(common.BoundError):
                common.run(['python3','-c','import time;time.sleep(20)'],2)
            self.assertIsNotNone(seen[0].poll(), 'alarm interrupted ownership assignment')
        finally:
            signal.signal(signal.SIGALRM,old)
            for process in seen:
                try:os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                process.wait(timeout=2)
    def test_root_apt_watchdog_inside_original_caps(self):
        for cap in (60,30,150):
            with patch.object(prepare,'run',return_value=(0,b'',b'')) as mocked:
                prepare.apt(['-o','Acquire::Retries=0'],['update'],cap)
            argv,outer,limit=mocked.call_args.args
            self.assertEqual(argv[:6],['sudo','timeout','--signal=TERM','--kill-after=2s',str(cap-4)+'s','apt-get'])
            self.assertEqual(outer,cap)
            self.assertLess(int(argv[4][:-1])+2,cap)
    def test_ready_observed_at_boot_deadline_is_rejected(self):
        host.boot_deadline(None,299.999,0)
        for now in (300,300.001):
            with self.assertRaises(common.BoundError):host.boot_deadline(None,now,0)
        host.boot_deadline(299,450,0)
    def test_source_files_exact(self):
        self.assertEqual(set(host.verify_sources()),set(host.FILES))

if __name__=='__main__':unittest.main()

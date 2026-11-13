"""Build only frozen synthetic source. Export enums/numbers, never raw diagnostics."""
import hashlib, json, os, pathlib, re, signal, subprocess, sys, tempfile
SOURCE_HASHES={'probe.c':'6f5f4a3aa5c19d65c19ace09ae0563ebe39b685b1f70bdd24609661e78116a1a','probe.S':'25f0d4bad6689a253cc87b3c4763f437306872d7ea2a452e4bafb3fbded6fe3f'}
REASONS={'unused-result':'ignored_result','implicit-function-declaration':'implicit_declaration','maybe-uninitialized':'maybe_uninitialized','uninitialized':'uninitialized','array-bounds':'array_bounds','stringop-overflow':'string_overflow','format':'format_error'}
def diagnostic_codes(raw):
    # Only known warning switches and fixed categories leave this function.
    codes=set()
    for option,code in REASONS.items():
        if re.search(rb'\[-W(?:error=)?'+option.encode()+rb'\]',raw):codes.add(code)
    for text,code in [(b'cannot find -l','missing_library'),(b'No such file or directory','missing_file'),(b'undefined reference','undefined_reference'),(b' unrecognized command-line option','unsupported_option')]:
        if text in raw:codes.add(code)
    return sorted(codes) or (['unclassified_diagnostic'] if raw else [])
class Cancelled(Exception):pass
def cancelled(signum, frame):raise Cancelled()
def run(argv, cwd):
    import resource
    def limits():
        signal.pthread_sigmask(signal.SIG_SETMASK, oldmask)
        resource.setrlimit(resource.RLIMIT_FSIZE,(8*1024*1024,8*1024*1024))
    p=None
    with tempfile.TemporaryFile() as out,tempfile.TemporaryFile() as err:
        try:
            oldmask=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
            try:
                p=subprocess.Popen(argv,cwd=cwd,env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},stdout=out,stderr=err,start_new_session=True,preexec_fn=limits)
            finally:signal.pthread_sigmask(signal.SIG_SETMASK,oldmask)
            p.wait(timeout=30)
            status='passed' if p.returncode==0 else 'command_failed';rc=p.returncode
        except subprocess.TimeoutExpired:status='timeout';rc=None
        except OSError:status='launch_failed';rc=None
        finally:
            mask=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
            try:
                if p is not None:
                    try:os.killpg(p.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                    p.wait(timeout=1)
            finally:signal.pthread_sigmask(signal.SIG_SETMASK,mask)
        out.seek(0);err.seek(0)
        return status,rc,out.read(1024*1024),err.read(1024*1024)
def main(source, output):
    source=pathlib.Path(source).resolve();output=pathlib.Path(output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
    receipt={'schemaVersion':1,'purpose':'synthetic_build_only','applicationAcceptance':False,'probeExecuted':False,'vmStarted':False,'sourceVerified':False,'stages':[],'complete':False}
    def save():
        temp=output.with_suffix('.tmp');temp.write_text(json.dumps(receipt,indent=2)+'\n');temp.replace(output)
    def row(name,status,rc=None,codes=None):
        entry={'stage':name,'status':status,'returnCode':rc,'diagnosticCodes':codes or []}
        if receipt['stages'] and receipt['stages'][-1]['stage']==name:receipt['stages'][-1]=entry
        else:receipt['stages'].append(entry)
        save()
        return status=='passed'
    save()
    try:
        if any(hashlib.sha256((source/n).read_bytes()).hexdigest()!=h for n,h in SOURCE_HASHES.items()):
            row('source_identity','failed');return 1
        receipt['sourceVerified']=True;save()
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            for n in SOURCE_HASHES:(root/n).write_bytes((source/n).read_bytes())
            args=['gcc','-std=c11','-O2','-Wall','-Wextra','-Werror','-fno-tree-vectorize','-fno-tree-slp-vectorize','-static','-pthread','-Wl,--build-id=sha1','probe.c','probe.S','-o','probe']
            row('compile_link','running')
            s,rc,out,err=run(args,root)
            if not row('compile_link',s,rc,diagnostic_codes(err)):return 1
            dis={}
            for symbol in ['gather_exact','gather_all_exact','clamp_indices']:
                row('disassemble_'+symbol,'running')
                s,rc,out,err=run(['objdump','-d','--disassemble='+symbol,'probe'],root)
                if not row('disassemble_'+symbol,s,rc,diagnostic_codes(err)):return 1
                dis[symbol]=out
            match=bool(re.search(rb'c4 62 45 90 04 a1\s+vpgatherdd\s+%ymm7,\(%rcx,%ymm4,4\),%ymm8',dis['gather_exact']))
            if not row('gather_operand_assertion','passed' if match else 'failed'):return 1
            count=(root/'probe').read_bytes().count(bytes.fromhex('c5c576ffc4413857c0c462459004a1'))
            if not row('all_active_bytes_assertion','passed' if count==1 else 'failed'):return 1
            row('elf_read','running')
            s,rc,out,err=run(['readelf','-l','probe'],root)
            if not row('elf_read',s,rc,diagnostic_codes(err)):return 1
            if not row('static_elf_assertion','passed' if b'INTERP' not in out else 'failed'):return 1
            receipt['complete']=True;save();return 0
    except Cancelled:
        row('controller','cancelled');return 1
    except Exception:
        # Never serialize exception messages, paths or tracebacks.
        row('controller','internal_error');return 1
if __name__=='__main__':
    signal.signal(signal.SIGTERM,cancelled);signal.signal(signal.SIGINT,cancelled)
    rc=main(sys.argv[1],sys.argv[2])
    print(pathlib.Path(sys.argv[2]).read_text())
    sys.exit(rc)

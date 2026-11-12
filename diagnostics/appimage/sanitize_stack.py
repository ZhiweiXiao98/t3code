"""Allowlist-only export from private stackwalker JSON. No raw diagnostics on error."""
import json,pathlib,re,sys
HEX=re.compile(r'0x[0-9a-fA-F]{1,16}')
BASE=re.compile(r'[A-Za-z0-9_.+-]{1,100}')
FUNCTION=re.compile(r"[A-Za-z0-9_~:<>, ()*&.\[\]{}=$+?!`'\-]{1,512}")
IDENTIFIER=re.compile(r'[A-Fa-f0-9-]{8,80}')
SIGNALS={'SIGSEGV','SIGABRT','SIGBUS','SIGILL','SIGFPE','SIGTRAP'}
def sanitize(raw, trusted_modules):
    if not isinstance(raw,dict) or not trusted_modules:raise ValueError('Invalid schema or missing trusted symbol identities')
    signal=raw['crash_info']['type'].split(' / ')[0]
    if signal not in SIGNALS:raise ValueError('Unexpected signal')
    frames=raw['crashing_thread']['frames']
    if not isinstance(frames,list) or not frames:raise ValueError('No crashed frames')
    modules={}
    for item in raw['modules']:
        name=item['filename']
        if not isinstance(name,str):continue
        debug=item.get('debug_id')
        if isinstance(debug,str) and IDENTIFIER.fullmatch(debug):
            identity=debug.replace('-','').upper()
            if identity in trusted_modules:
                canonical=trusted_modules[identity]
                if not BASE.fullmatch(canonical):raise ValueError('Invalid trusted symbol module')
                if name in modules:raise ValueError('Ambiguous raw module')
                modules[name]=(identity,canonical)
    result=[]
    for frame in frames[:32]:
        name=frame.get('module');offset=frame.get('module_offset');fn=frame.get('function')
        if name not in modules or not isinstance(offset,str) or not HEX.fullmatch(offset):
            result.append({'unresolved':True});continue
        identity,canonical=modules[name]
        # Raw function/module strings are attacker/data-controlled. Emit only a
        # canonical module name from verified official symbol headers. Functions
        # are deliberately omitted until reconstructed from trusted symbol ranges.
        out={'module':canonical,'debugId':identity,'moduleOffset':offset}
        result.append(out)
    return {'schemaVersion':1,'diagnosticOnly':True,'signal':signal,'frames':result}
def main(source,out,trusted_file):
    p=pathlib.Path(source)
    if p.is_symlink() or p.stat().st_size>32*1024**2:raise ValueError('Invalid input')
    output=pathlib.Path(out)
    if output.exists():raise ValueError('Output exists')
    text=json.dumps(sanitize(json.loads(p.read_text()),json.loads(pathlib.Path(trusted_file).read_text())),sort_keys=True)+'\n'
    if len(text.encode())>65536:raise ValueError('Oversized output')
    output.write_text(text)
if __name__=='__main__':
    try:main(*sys.argv[1:])
    except Exception:raise SystemExit('Diagnostic export rejected; no private details emitted')

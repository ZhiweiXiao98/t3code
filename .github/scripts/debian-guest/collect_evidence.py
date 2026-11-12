"""Always-run safe whitelist collector. Never copies VM/payload/seed/source or credentials."""
import argparse,json,pathlib,shutil
CAP=128*1024*1024

def collect(work,out):
    work,out=pathlib.Path(work),pathlib.Path(out)
    if out.exists():raise ValueError('Evidence destination must be new')
    out.mkdir(parents=True);total=0;copied=[];omitted=[]
    candidates=[]
    results=work/'results'
    if results.is_dir() and not results.is_symlink():
        for file in sorted(results.rglob('*')):
            if file.suffix in ('.json','.png','.txt','.log'):
                candidates.append((file,pathlib.Path('results')/file.relative_to(results),64*1024*1024))
    for name,limit in [('host-os-release.txt',65536),('provenance.json',4*1024*1024),('manifest.json',1024*1024),('github-evidence-after.json',4*1024*1024),('host-provenance.json',1024*1024),('github-evidence.json',4*1024*1024),('console.log',32*1024*1024),('qemu.log',16*1024*1024),('serial.log',24*1024*1024),('producer-job.log',32*1024*1024)]:
        candidates.append((work/name,pathlib.Path(name),limit))
    for source,relative,limit in candidates:
        if not source.is_file() or source.is_symlink():continue
        if any(parent.is_symlink() for parent in source.parents if parent!=work.parent):continue
        size=source.stat().st_size
        if size>limit or total+size>CAP:
            omitted.append({'file':str(relative),'reason':'size budget','bytes':size});continue
        destination=out/relative;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,destination)
        copied.append(str(relative));total+=size
    report={'scope':'safe evidence only; collection is not a compatibility pass','workdirExisted':work.is_dir(),'copied':copied,'omitted':omitted,'totalBytes':total}
    (out/'collection.json').write_text(json.dumps(report,indent=2))
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--workdir',required=True);p.add_argument('--out',required=True);a=p.parse_args();collect(a.workdir,a.out)
    if (pathlib.Path(a.workdir)/'provenance.json').exists():
        from validate_receipt import validate
        validate(a.out)

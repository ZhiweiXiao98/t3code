"""Credential-free cloud-init entry; only fixed JSON crosses virtio serial."""
import base64, hashlib, json, os, pathlib, select, subprocess, sys, time

def write_all(fd, data):
    end=time.monotonic()+5
    while data:
        if time.monotonic()>=end:
            raise TimeoutError()
        if not select.select([], [fd], [], max(0,end-time.monotonic()))[1]:
            raise TimeoutError()
        try:
            count=os.write(fd,data)
        except (InterruptedError,BlockingIOError):
            continue
        if count<=0:
            raise OSError()
        data=data[count:]

def main():
    root=pathlib.Path('/mnt/t3-payload'); fd=None
    try:
        root.mkdir(exist_ok=True)
        subprocess.run(['mount','-o','ro','/dev/disk/by-label/T3PAYLOAD',str(root)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
        expected=json.loads(pathlib.Path('/run/t3-payload-hashes.json').read_text())
        if set(p.name for p in root.iterdir()) != set(expected):
            raise ValueError()
        for name,digest in expected.items():
            if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:
                raise ValueError()
        sys.path.insert(0,str(root))
        from common import cell, install_handlers
        install_handlers()
        fd=os.open('/dev/virtio-ports/org.t3.result',os.O_WRONLY|os.O_NONBLOCK)
        write_all(fd,b'T3_GATHER_READY\n')
        result=cell(root/'probe',expected['probe'],True)
        data=json.dumps(result,separators=(',',':')).encode()
        if len(data)>16384:
            raise ValueError()
        write_all(fd,b'T3_GATHER_RESULT '+base64.b64encode(data)+b'\n')
    except BaseException:
        # No exception strings, raw logs or fallback dumps leave this guest.
        pass
    finally:
        if fd is not None:
            os.close(fd)
        try:
            subprocess.run(['systemctl','poweroff'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
        except BaseException:
            pass
if __name__=='__main__':
    main()

"""Decode a bounded guest result envelope. Transport integrity only, not QA acceptance."""
import base64
import gzip
import hashlib
import io
import pathlib
import re
import sys
import tarfile

MAX_COMPRESSED = 128 * 1024
MAX_UNPACKED = 256 * 1024
MAX_LOG = 512 * 1024


def decode(log_path, output):
    log_path, output = pathlib.Path(log_path), pathlib.Path(output)
    if output.exists():
        raise ValueError('Output must be a fresh directory')
    if log_path.stat().st_size > MAX_LOG:
        raise ValueError('Serial log exceeds limit')
    data = log_path.read_bytes().replace(b'\r\n', b'\n')
    if data.count(b'T3_RESULT_BEGIN ') != 1 or data.count(b'T3_RESULT_END') != 1:
        raise ValueError('Missing or duplicate result frame')
    match = re.search(rb'^T3_RESULT_BEGIN ([0-9]+) ([0-9a-f]{64})\n([A-Za-z0-9+/=\n]+)\nT3_RESULT_END(?:\n|$)', data, re.M)
    if not match:
        raise ValueError('Malformed result frame')
    size = int(match[1])
    if not 0 < size <= MAX_COMPRESSED:
        raise ValueError('Compressed archive exceeds limit')
    packed = base64.b64decode(match[3].replace(b'\n', b''), validate=True)
    if len(packed) != size or hashlib.sha256(packed).hexdigest().encode() != match[2]:
        raise ValueError('Archive length or checksum mismatch')
    with gzip.GzipFile(fileobj=io.BytesIO(packed)) as gz:
        raw = gz.read(MAX_UNPACKED + 1)
    if len(raw) > MAX_UNPACKED:
        raise ValueError('Unpacked archive exceeds limit')
    entries = []
    names = set()
    logical_total = 0
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
        for member in archive:
            name = member.name
            while name.startswith('./'):
                name = name[2:]
            if name in ('', '.') and member.isdir():
                continue
            path = pathlib.PurePosixPath(name)
            name = str(path)
            if (not name or path.is_absolute() or '..' in path.parts or '\\' in name
                    or ':' in name or name in names or member.sparse is not None
                    or member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE)):
                raise ValueError('Unsafe archive entry: ' + repr(name))
            if len(entries) >= 2000:
                raise ValueError('Too many archive entries')
            logical_total += member.size
            if member.size < 0 or member.size > MAX_UNPACKED or logical_total > MAX_UNPACKED:
                raise ValueError('Logical archive size exceeds limit')
            names.add(name)
            contents = None
            if member.isfile():
                contents = archive.extractfile(member).read(member.size + 1)
                if len(contents) != member.size:
                    raise ValueError('Archive member length mismatch')
            entries.append((path, member, contents))
        if len(entries) != 2 or {str(path) for path, member, _ in entries if member.isfile()} != {'diagnostic.json', 'manifest.json'}:
            raise ValueError('Unexpected diagnostic export members')
        # No file may be used as an ancestor directory, irrespective of member order.
        files = {str(path) for path, member, _ in entries if member.isfile()}
        if any(str(parent) in files for path, _, _ in entries for parent in path.parents):
            raise ValueError('Conflicting file and directory paths')
    output.mkdir(parents=False)
    for path, member, contents in entries:
        target = output.joinpath(*path.parts)
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(contents)
    return hashlib.sha256(packed).hexdigest()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: decode-serial.py SERIAL_LOG NEW_OUTPUT_DIRECTORY')
    print('Transport verified:', decode(sys.argv[1], sys.argv[2]))

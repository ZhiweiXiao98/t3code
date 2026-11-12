import pathlib,json,hashlib
root=pathlib.Path(__file__).resolve().parent;d=json.loads((root/'benchmark.json').read_text())
for row in d['helpers']:
 p=root/row['name']
 if p.is_symlink() or not p.is_file() or len(p.read_bytes())!=row['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:raise ValueError('Benchmark helper changed')
print('Public-only benchmark helper pins verified')

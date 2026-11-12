import hashlib,json,pathlib
root=pathlib.Path(__file__).parent
operation=json.loads((root/'operation.json').read_text())
for item in operation['helpers']:
 path=root/item['name']
 if path.is_symlink() or path.stat().st_size!=item['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Reviewed diagnostic payload changed')
print('Diagnostic helper pins verified')

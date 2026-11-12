"""Fetch immutable IDs via the authenticated read-only GitHub CLI; verify before use."""
import argparse,hashlib,json,pathlib,subprocess
HERE=pathlib.Path(__file__).parent
p=argparse.ArgumentParser();p.add_argument('out');a=p.parse_args();out=pathlib.Path(a.out);out.mkdir()
operation=json.loads((HERE/'operation.json').read_text())
for cell in operation['cells']:
 for role in ['installer','proof']:
  pinned=cell[role];url=f"repos/ZhiweiXiao98/t3code/actions/artifacts/{pinned['id']}"
  current=json.loads(subprocess.check_output(['gh','api',url],timeout=60))
  for key in ['id','name','size_in_bytes','digest','workflow_run']:
   if current[key]!=pinned[key]:raise ValueError('Immutable artifact metadata mismatch')
  if current['expired']:raise ValueError('Artifact expired')
  target=out/f"{cell['label']}-{role}.zip"
  with open(target,'wb') as stream:subprocess.run(['gh','api',url+'/zip'],stdout=stream,check=True,timeout=300)
  if target.stat().st_size!=pinned['size_in_bytes'] or hashlib.sha256(target.read_bytes()).hexdigest()!=pinned['digest'].split(':')[1]:raise ValueError('Downloaded artifact mismatch')

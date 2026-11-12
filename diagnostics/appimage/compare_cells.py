import json,pathlib,sys
root=pathlib.Path(sys.argv[1]);a=json.loads((root/'candidate/diagnostic.json').read_text());b=json.loads((root/'control/diagnostic.json').read_text())
for key in ['packageListSha256','securityDefaults']:
 if not a.get(key) or a[key]!=b.get(key):raise SystemExit('Diagnostic environment mismatch; no comparison conclusion')
print('Two bounded diagnostic cells completed with matching package/security observations; not acceptance')

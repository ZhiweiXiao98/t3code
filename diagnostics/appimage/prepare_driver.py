"""Make a diagnostic-only copy of the exact old sequence; never edit app assets."""
import hashlib,pathlib,sys
EXPECTED='fa81bf91c18a1c80792c71a62d8b25610ea14434beee4f6e5fd7273333e8fcf3'
def transform(raw):
 if hashlib.sha256(raw).hexdigest()!=EXPECTED:raise ValueError('Wrong old driver')
 text=raw.decode().replace('same-full-run-debian13-v1','isolated-crash-diagnostic-v1')
 begin=text.index('  report.settings_audit = await auditSettingsOverviews();')
 end=text.index('  await close();',begin)
 text=text[:begin]+text[end:]
 text=text.replace('  report.passed = true;','  report.diagnosticSequenceComplete = true;')
 text=text.replace('Same-full-run typed Linux installer CJK proof','Diagnostic only, not acceptance. Linux installer CJK sequence')
 return text.encode()
if __name__=='__main__':
 out=pathlib.Path(sys.argv[2])
 if out.exists():raise ValueError('Output exists')
 out.write_bytes(transform(pathlib.Path(sys.argv[1]).read_bytes()))

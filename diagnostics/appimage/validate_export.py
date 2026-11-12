"""Validate the complete public schema; reject every unrecognized string/field."""
import re
H40=re.compile('[0-9a-f]{40}');H64=re.compile('[0-9a-f]{64}');HEX=re.compile('0x[0-9a-fA-F]{1,16}')
PHASES={'preflight','dependencies','language-roundtrip','clean-first-start','full-cjk-sequence','offline-symbolization','complete'}
OUTCOMES={'capture-unavailable','driver-timeout','crash-captured','not-reproduced'}
SECURITY={'kernel/unprivileged_userns_clone','kernel/apparmor_restrict_unprivileged_userns','user/max_user_namespaces','apparmor_enabled'}
def check(record,cell,trusted_modules):
 def need(ok):
  if not ok:raise ValueError('Diagnostic schema rejected')
 need(isinstance(record,dict));need(set(record)<= {'schemaVersion','diagnosticOnly','outcome','phase','stacks','source','appimageSha256','packageListSha256','securityDefaults','driverExitCode','completedScreens','failed','progress','resourceObservation'})
 need(record.get('schemaVersion')==1 and record.get('diagnosticOnly') is True)
 need(record.get('source')==cell['source'] and record.get('appimageSha256')==cell['appimage']['sha256'])
 need(record.get('outcome') in OUTCOMES and record.get('phase') in PHASES)
 if 'packageListSha256' in record:need(isinstance(record['packageListSha256'],str) and H64.fullmatch(record['packageListSha256']))
 if 'securityDefaults' in record:
  need(isinstance(record['securityDefaults'],dict) and set(record['securityDefaults'])==SECURITY)
  for key,value in record['securityDefaults'].items():
   need(value is None or isinstance(value,str) and (value in {'Y','N'} if key=='apparmor_enabled' else re.fullmatch('[0-9]{1,12}',value)))
 if 'resourceObservation' in record:
  r=record['resourceObservation'];need(isinstance(r,dict) and set(r)=={'memoryTotalKiB','memoryAvailableKiB','logicalCpus'})
  for k,v in r.items():need(type(v) is int and 0<=v<=(64 if k=='logicalCpus' else 8*1024*1024))
 if 'progress' in record:
  from progress_summary import validate
  validate(record['progress'])
 for key in ['driverExitCode','completedScreens']:
  if key in record:need(type(record[key]) is int and (-255<=record[key]<=255 if key=='driverExitCode' else 0<=record[key]<=254))
 if 'failed' in record:need(record['failed'] is True)
 stacks=record.get('stacks');need(isinstance(stacks,list) and len(stacks)<=4)
 for stack in stacks:
  need(set(stack)=={'schemaVersion','diagnosticOnly','signal','frames'} and stack['schemaVersion']==1 and stack['diagnosticOnly'] is True)
  need(stack['signal'] in {'SIGSEGV','SIGABRT','SIGBUS','SIGILL','SIGFPE','SIGTRAP'})
  need(isinstance(stack['frames'],list) and 1<=len(stack['frames'])<=32)
  for frame in stack['frames']:
   if frame=={'unresolved':True}:continue
   need(set(frame)=={'module','debugId','moduleOffset'})
   need(frame['debugId'] in trusted_modules and frame['module']==trusted_modules[frame['debugId']])
   need(isinstance(frame['moduleOffset'],str) and HEX.fullmatch(frame['moduleOffset']))
 if record['outcome']=='crash-captured':need(bool(stacks))
 return record

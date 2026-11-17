"""Explicit four-process UI schema verifier. Never invents a root-process report.
Offline semantics only; API/producer/original upload-log checks remain separate.
"""
import json,hashlib,zipfile,io,subprocess,tempfile
from pathlib import Path,PurePosixPath
import verify_ui_extensions as ext
SOURCE='74039745b1b44834c30dd9cb275f1c224072dd96';TREE='2849e01639a6ec5242b4041b65762ef78ac08a51'
OP='3f95c4aa754b862cefc19d168248d1030dc10e79';RUN=43992265580
HASH='647d8c81a7dcecb4fef50e58b69e96ba6378a4cdbb0be80c4b8f54e22b3eb173'
CAPTURES=['menu-zh-open','menu-zh-copy','menu-zh-reopened','menu-en-open','menu-zh-roundtrip']
PART=['unit-summary.json','unit-cases.json','unit-progress.json','unit-command.json','unit-environment.json','unit.log','unit-exit.json','unit-verdict.json','junit.xml','browser-lifecycle.jsonl','browser-server-lifecycle.jsonl','module-identity.json','observer-verdict.json']
def need(v,s):
 if not v:raise ValueError('UI partition evidence: '+s)
def sha(b):return hashlib.sha256(b).hexdigest()
def read(b):return ext.strict(b)
def verify_bytes(raw,p):
 need(p['schema']=='v019-ui-partition-pins-1','explicit new pin schema required')
 need(p['source_sha']==SOURCE and p['source_tree']==TREE and p['operation_sha']==OP and p['run_id']==RUN and p['run_attempt']==1,'frozen source/run')
 need(len(raw)==p['artifact']['size']<=8*1024*1024 and sha(raw)==p['artifact']['sha256'],'ZIP bytes')
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  info=z.infolist();need(len(info)==len(p['members']) and len({i.filename for i in info})==len(info),'ZIP member inventory');need(sum(i.file_size for i in info)<=38*1024*1024 and z.testzip()is None,'ZIP size/CRC');members={}
  for i in info:
   n=PurePosixPath(i.filename);need(not i.is_dir() and not n.is_absolute() and '..' not in n.parts and '\\' not in i.filename and not i.flag_bits&1 and (i.external_attr>>16)&0o170000 in [0,0o100000],'unsafe ZIP')
   b=z.read(i);need(sha(b)==p['members'].get(i.filename),'member hash');members[i.filename]=b
 data={n:read(b) for n,b in members.items() if n.endswith('.json')}
 manifest=data['artifact-manifest.json'];need(manifest['sourceSha']==SOURCE and manifest['sourceTree']==TREE,'artifact manifest source')
 actual={n:{'file':n,'bytes':len(b),'sha256':sha(b)} for n,b in members.items() if n!='artifact-manifest.json'};listed=manifest['files'];need(len(listed)==len(actual) and len({r['file'] for r in listed})==len(actual) and all(r==actual.get(r['file']) for r in listed),'artifact manifest bytes')
 prov=data['provenance.json'];need(prov['sourceSha']==SOURCE and prov['sourceTree']==TREE and prov['operationSha']==OP and prov['operationTree']==p['operation_tree'] and prov['workflowBlob']==p['workflow_blob'] and prov['runId']==RUN and prov['runAttempt']==1,'provenance')
 files=p['test_files'];need(prov['testFiles']==files and len(files)==len(set(files))==330 and files==sorted(files) and sha(json.dumps(files,separators=(',',':')).encode())==HASH and prov['testFilesSha256']==HASH,'full330 inventory')
 need(prov['scenarioSha256']=='4dffda96664fc2c493b4fb936284d678174478cda03169df6a2e151a6fe3250d' and prov['reviewedCaptureLabels']==CAPTURES,'scenario source/captures')
 pm=data['unit-partitions.json'];need(pm['schema']=='v019-partition-receipts-1','not legacy single-process schema');receipts=[]
 for r in pm['receipts']:
  need(type(r['index'])is int and 0<=r['index']<4,'partition index');prefix=f"partition-{r['index']+1}-";names=[a['name'] for a in r['artifacts']];need(len(names)==len(set(names)) and set(names)==set(PART),'partition successful member inventory')
  projection={n:b for n,b in members.items() if n.startswith('toast-')}
  for a in r['artifacts']:
   b=members[prefix+a['name']];need(len(b)==a['bytes'] and sha(b)==a['sha256'],'partition member bytes');projection[a['name']]=b
  # Original dual-Toast+observer verifier replays each independent observer; no root alias is published.
  ext.verify(projection,p)
  selected=files[r['index']::4];command=read(projection['unit-command.json'])
  need(p['unit_cli'].startswith(p['checkout_root']+'/node_modules/') and p['unit_cli'].endswith('/node_modules/vitest/vitest.mjs'),'reviewed CLI path')
  args=[p['unit_cli'],'run',*selected,'--maxWorkers=2','--retry=0','--reporter=default','--reporter=json','--reporter=junit','--reporter='+p['runner_temp']+'/v019-tools/root-module-identity.mjs','--reporter='+p['runner_temp']+'/v019-tools/incremental-reporter.mjs','--outputFile.json=<private-output>/unit.json','--outputFile.junit=<private-output>/junit.xml']
  need(command=={'command':'verified Node26.12.1 + vite-plus dependency Vitest5.0.5','args':args,'cwd':'.','scope':'Supplemental selected localization validation, not all tests or native/device UI'},'unchanged partition command')
  receipts.append({**r,**{k:read(projection[n]) for k,n in [('verdict','unit-verdict.json'),('exit','unit-exit.json'),('progress','unit-progress.json'),('summary','unit-summary.json'),('cases','unit-cases.json'),('observer','observer-verdict.json')]}})
 ctx={'sourceSha':SOURCE,'sourceTree':TREE,'operationSha':OP,'runId':str(RUN),'runAttempt':1,'reviewedFilesSha256':HASH,'files':files}
 with tempfile.TemporaryDirectory() as folder:
  f=Path(folder)/'input.json';f.write_text(json.dumps({'context':ctx,'receipts':receipts,'union':data['unit-union.json']}));res=subprocess.run(['node',str(Path(__file__).with_name('replay.mjs')),str(f)],capture_output=True,text=True);need(res.returncode==0,'four-union semantic replay');union=json.loads(res.stdout)
 need(union['passedTests']==p['passed_tests'],'reviewed actual assertion total')
 summary=data['unit-summary.json'];need(summary['execution']=='four-partition-union' and summary['files']==files and summary['sourceSha']==SOURCE and summary['success']is True and summary['incrementalCountsMatched']is True and summary['totalTests']==summary['passedTests']==union['passedTests'] and summary['skippedTests']==summary['todoTests']==summary['unfinishedTests']==0,'aggregate summary')
 need(data['unit-verdict.json']=={'sourceSha':SOURCE,'success':True,'independentlyVerified':True,'execution':'four-partition-union'},'aggregate unit verdict')
 ov=data['observer-verdict.json'];need(ov['execution']=='four-independent-qualified-observers' and ov['partitionReceipts']=='unit-partitions.json' and ov['success']is True and ov['counts']=={'qualified':union['qualifiedObserverSnapshots']},'explicit independent observers')
 final={'sourceSha':SOURCE,'sourceTree':TREE,'operationSha':OP,'priorJobStatus':'success','unitOutcome':'success','toastOutcome':'success','observerOutcome':'success','scenarioOutcome':'success','supplementalOnly':True,'separate21ReleaseGatesRequired':True,'installedAppAcceptance':False,'sourceUnchanged':True,'accepted':True};need(data['final-status.json']==final,'final status')
 r=data['scenario-report.json'];need(r['sourceSha']==SOURCE and r['runStatus']==r['resultStatus']==r['attemptStatus']=='passed' and r['exitCode']==0 and r['cleanup']=='complete' and r['noModelCalls']is True and r['noRetries']is True and len(r['steps'])==61 and all(s['status']=='passed' for s in r['steps']) and r['exportedCaptures']==CAPTURES,'61 actual scene steps')
 need(data['scenario-verdict.json']=={'sourceSha':SOURCE,'success':True,'independentlyVerified':True},'scenario verdict');ex=data['scenario-exit.json'];need(ex['sourceSha']==SOURCE and ex['code']==0 and ex['signal']is None and ex['timedOut']is False,'scenario process')
 for c in CAPTURES:need(members[c+'.png'].startswith(b'\x89PNG\r\n\x1a\n'),'scene PNG')
 return {'schema':'v019-ui-partition-semantic-result-1','source':SOURCE,'run':RUN,'partitions':4,'files':330,'passed_tests':union['passedTests'],'scenario_steps':61,'screenshots':5,'dual_toast_cases':2,'observers':4,'installed_app_acceptance':False}

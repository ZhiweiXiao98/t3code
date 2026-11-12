"""Disposable guest only. No raw dump, app output or symbolizer output is transported."""
import glob,hashlib,json,os,pathlib,pwd,resource,shutil,subprocess,sys,time
from common import require,sha,run,unpack_tar
from sanitize_stack import sanitize
P=pathlib.Path('/mnt/t3-payload');BASE=pathlib.Path('/var/tmp/t3-diagnostic')
def main():
 require(os.geteuid()==0 and pathlib.Path('/run/cloud-init').exists(),'Guest only')
 require(not BASE.exists(),'Fresh guest required');BASE.mkdir()
 exported=BASE/'export';exported.mkdir();private=BASE/'private';private.mkdir()
 result={'schemaVersion':1,'diagnosticOnly':True,'outcome':'capture-unavailable','phase':'preflight','stacks':[]}
 try:
  cell=json.loads((P/'cell.json').read_text());result.update(source=cell['source'],appimageSha256=cell['appimage']['sha256'])
  require(sha(P/'app.AppImage')==cell['appimage']['sha256'],'Asset hash')
  require(sha(P/'playwright.tgz')==cell['playwrightTarSha256'],'Playwright hash')
  require(not glob.glob('/etc/ssh/ssh_host_*'),'Unexpected SSH keys')
  require('ID=debian' in pathlib.Path('/etc/os-release').read_text(),'Wrong OS')
  packages=['nodejs','xvfb','xauth','dbus-x11','fontconfig','fonts-noto-cjk','libfuse2t64','fuse3','libgtk-3-0t64','libnss3','libgbm1','libasound2t64','libxss1','libx11-xcb1','libxshmfence1','libdrm2','libxkbcommon0','libcups2t64','libatk-bridge2.0-0t64','libsecret-1-0','libnotify4','libuuid1','libxtst6','xdg-utils']
  result['phase']='dependencies'
  with open(private/'apt.log','wb') as log:
   run(['apt-get','update'],300,stdout=log,stderr=subprocess.STDOUT)
   run(['apt-get','install','--no-install-recommends','-y',*packages],900,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'DEBIAN_FRONTEND':'noninteractive'})
  package_list=subprocess.check_output(['dpkg-query','-W','-f=${Package}\t${Version}\n'],timeout=30)
  result['packageListSha256']=hashlib.sha256(package_list).hexdigest()
  require(not any(line.split(b'\t')[0].lower() in (b't3code',b't3-code') for line in package_list.splitlines()),'Unexpected installed T3')
  user=pwd.getpwnam('nobody');require(user.pw_uid==65534 and user.pw_gid>0,'Wrong user')
  home=private/'home';home.mkdir();artifacts=private/'cjk';artifacts.mkdir();clean=private/'clean';clean.mkdir()
  for path in [private,home,artifacts,clean]:os.chown(path,user.pw_uid,user.pw_gid)
  env={'PATH':'/usr/bin:/bin','HOME':str(home),'LANG':'C.UTF-8','LC_ALL':'C.UTF-8','GITHUB_ACTIONS':'true','CI':'true','RUNNER_OS':'Linux','DEBUG':'pw:browser*','ELECTRON_ENABLE_LOGGING':'1'}
  prefix=['runuser','-u','nobody','--','env','-i',*[f'{k}={v}' for k,v in env.items()]]
  subprocess.run(prefix+['sh','-c','test "$(id -u)" -ne 0 && test -r /dev/fuse && test -w /dev/fuse && unshare -Ur true'],check=True,timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  security={}
  for key in ('kernel/unprivileged_userns_clone','kernel/apparmor_restrict_unprivileged_userns','user/max_user_namespaces'):
   f=pathlib.Path('/proc/sys')/key;security[key]=f.read_text().strip() if f.exists() else None
  security['apparmor_enabled']=pathlib.Path('/sys/module/apparmor/parameters/enabled').read_text().strip() if pathlib.Path('/sys/module/apparmor/parameters/enabled').exists() else None
  result['securityDefaults']=security
  exe=private/'app.AppImage';shutil.copyfile(P/'app.AppImage',exe);exe.chmod(0o755)
  unpack_tar(P/'playwright.tgz',private/'pw');pw=private/'pw/package'
  package=json.loads((pw/'package.json').read_text());require(package['name']=='playwright-core' and package['version']=='1.60.0','Wrong Playwright')
  from patch_playwright import transform
  if cell['enableLocalCrashCapture']:
   bundle=pw/'lib/coreBundle.js';bundle.write_bytes(transform(bundle.read_bytes(),(P/'early-hook.cjs').read_text()))
  fonts={'distro':pathlib.Path('/etc/os-release').read_text(),'font_match':subprocess.check_output(['fc-match',':lang=zh-cn'],text=True,timeout=30),'noto_package':subprocess.check_output(['dpkg-query','-W','fonts-noto-cjk'],text=True,timeout=30)}
  (artifacts/'font-evidence.json').write_text(json.dumps(fonts))
  m={'kind':'appimage','mode':'same-full-run-debian13-v1','sourceSha':cell['source']['sha'],'sourceTree':cell['source']['tree'],'installerSha256':cell['appimage']['sha256'],'executableSha256':cell['appimage']['sha256'],'cjkDriverSha256':sha(P/'diagnostic-driver.mjs'),'playwrightTreeSha256':cell['playwrightTarSha256'],'producerRunId':cell['producer']['run_id'],'producerRunAttempt':cell['producer']['run_attempt'],'artifactId':cell['installer']['id'],'playwrightVersion':'1.60.0','privacyClauses':{'See the':'请参阅','To opt out, see the':'如需退出，请参阅'}}
  (private/'manifest.json').write_text(json.dumps(m));result['phase']='clean-first-start'
  with open(private/'clean-driver.log','wb') as log:
   run(prefix+['dbus-run-session','--','xvfb-run','-a','node',str(P/'clean-driver.mjs'),'--platform','Linux','--executable',str(exe),'--playwright-module',str(pw/'index.mjs'),'--artifacts-dir',str(clean)],300,stdout=log,stderr=subprocess.STDOUT)
  result['phase']='full-cjk-sequence'
  from cjk_budget import CjkBudget,TOTAL_SECONDS
  budget=CjkBudget(private,emit=lambda *a,**k:None);complete=False
  with open(private/'driver.log','wb') as log:
   try:
    run(prefix+['dbus-run-session','--','xvfb-run','-a','node',str(P/'diagnostic-driver.mjs'),'--manifest',str(private/'manifest.json'),'--kind','appimage','--asset',str(exe),'--executable',str(exe),'--playwright-module',str(pw/'index.mjs'),'--artifacts-dir',str(artifacts)],TOTAL_SECONDS,progress=budget.tick,stdout=log,stderr=subprocess.STDOUT)
    budget.tick();complete=True;result['driverExitCode']=0
   except subprocess.CalledProcessError as error:result['driverExitCode']=error.returncode
   except TimeoutError:result['outcome']='driver-timeout'
   finally:budget.finish(complete)
  require(sha(exe)==cell['appimage']['sha256'],'AppImage changed')
  from progress_summary import summarize
  result['progress']=summarize(private)
  result['completedScreens']=result['progress']['cjkScreens']+result['progress']['cleanScreens']
  memory={}
  for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
   key,_,value=line.partition(':')
   if key in ('MemTotal','MemAvailable'):memory[key]=int(value.strip().split()[0])
  result['resourceObservation']={'memoryTotalKiB':memory['MemTotal'],'memoryAvailableKiB':memory['MemAvailable'],'logicalCpus':os.cpu_count()}
  # Crashpad flushes on process exit; bounded grace, no retries of the application.
  time.sleep(3)
  dumps=[]
  for root in pathlib.Path('/tmp').glob('t3-local-crash-*'):
   if root.is_symlink() or root.stat().st_uid!=65534:continue
   for d in root.rglob('*.dmp'):
    if d.is_file() and not d.is_symlink() and d.stat().st_uid==65534:dumps.append(d)
  require(len(dumps)<=4 and all(d.stat().st_size<=256*1024**2 for d in dumps),'Dump budget exceeded')
  result['phase']='offline-symbolization'
  symbol_ids={}
  for symbol in (P/'symbols').rglob('*.sym'):
   with open(symbol,'r',errors='strict') as stream:header=stream.readline(1024).split()
   if len(header)==5 and header[:3]==['MODULE','Linux','x86_64']:
    identity=header[3].replace('-','').upper()
    require(identity not in symbol_ids or symbol_ids[identity]==header[4],'Conflicting symbol identity')
    symbol_ids[identity]=header[4]
  require(bool(symbol_ids),'No verified symbol identities')
  def cap():resource.setrlimit(resource.RLIMIT_FSIZE,(32*1024**2,32*1024**2))
  for i,dump in enumerate(dumps):
   raw=private/f'stack-{i}.json'
   with open(private/f'stack-{i}.log','wb') as log:
    subprocess.run([str(P/'minidump-stackwalk'),'--json','--no-interactive','--output-file',str(raw),str(dump),str(P/'symbols')],check=True,timeout=90,stdout=log,stderr=subprocess.STDOUT,env={'PATH':'/usr/bin:/bin','LANG':'C'},preexec_fn=cap)
   require(raw.stat().st_size<=32*1024**2,'Stack output budget')
   parsed=json.loads(raw.read_text())
   require(any(str(module.get('debug_id','')).replace('-','').upper() in symbol_ids and module.get('loaded_symbols') is True for module in parsed['modules']),'No matching loaded official symbols')
   result['stacks'].append(sanitize(parsed,symbol_ids))
  if dumps:result['outcome']='crash-captured'
  elif result.get('driverExitCode')==0:result['outcome']='not-reproduced'
  elif result['outcome']=='driver-timeout':pass
  else:result['outcome']='capture-unavailable'
  result['phase']='complete'
 except Exception:
  # The exception may contain argv or private paths; never emit it.
  result['failed']=True
 from validate_export import check
 check(result,cell,locals().get('symbol_ids',{}))
 data=json.dumps(result,sort_keys=True).encode();require(len(data)<=65536,'Public output budget')
 (exported/'diagnostic.json').write_bytes(data)
 (exported/'manifest.json').write_text(json.dumps({'schemaVersion':1,'diagnosticOnly':True,'files':[{'name':'diagnostic.json','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}]}))
 from transport import emit
 emit(exported)
 return 0

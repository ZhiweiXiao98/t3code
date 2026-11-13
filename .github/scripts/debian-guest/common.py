"""Fail-closed manifest, bounded execution, archive and acceptance primitives."""
import base64, hashlib, io, json, os, pathlib, re, signal, subprocess, tarfile, time
CLEAN_SHA='6a8e96df7a6533355af7616345ba47a4ded70d9a957585bd03568395c1d61d3c'
IMAGE_URL='https://cloud.debian.org/cdimage/cloud/trixie/20261001-2618/debian-13-genericcloud-amd64-20261001-2618.qcow2'
IMAGE_SHA='f46f0671a6e5bdec5291ab8972bae2f10e5408c2f64a74078f11efc2f06a436a9d0313ed50e0472542eeabf780e9f7c792ac0a314c6c20507fcd9fd81b468c3d'
CJK_SHA='606bc590f5a8d330cb00c9f4848e1224760ea41b29d5665c5456ca9589ecf368'
PRIVACY_CLAUSES={'See the': '请参阅', 'To opt out, see the': '如需退出，请参阅'}
THREAD_SETTINGS={
    'zh-CN':{
        'ghq-clone-layout':['克隆的仓库按 github.com/owner/repo 结构存放在上述目录下，与 ghq 类似。'],
        'default-model':['新任务默认使用自动选择的模型，项目可以单独覆盖。','新任务使用的默认模型，项目可以单独覆盖。'],
        'default-permissions':['新任务的默认权限，项目可以单独覆盖。'],
        'new-threads':['新任务的起始位置，项目设置及其 t3.json 可以覆盖此项。'],
    },
    'en':{
        'ghq-clone-layout':['Clones go to github.com/owner/repo under the folder above, like ghq.'],
        'default-model':['Default model for new threads, selected automatically. Projects can override it.','Default model for new threads. Projects can override it.'],
        'default-permissions':['Default permissions for new threads. Projects can override them.'],
        'new-threads':['Where new threads start. Projects and their t3.json can override it.'],
    },
}

SETTINGS_OVERVIEWS=[('general','language'),('appearance','appearance'),('chat','composer'),('diffs','diffs'),('keybindings','keybindings'),('voice','voice-input'),('threads','ghq-clone-layout'),('browser','browser-agent-access'),('devices','devices'),('source-control','source-control'),('worktrees','worktree-creation'),('connections','remote-environments'),('maintenance','updates'),('labs','beta'),('about','about'),('archived','archive')]
SETTINGS_UNVISITED=['/settings/providers','/settings/projects','/settings/scheduled-tasks','/settings/snap-shot','/settings/access','/settings/secrets','/settings/diagnostics']
SETTINGS_OVERVIEW_SCOPE='read-only initial settings overviews in the packaged Linux shared UI'

def require(value, message):
    if not value: raise ValueError(message)

def sha(path, algorithm='sha256'):
    h=hashlib.new(algorithm)
    with open(path,'rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

SUPPLEMENTAL_ROUTES=['providers','projects','scheduled-tasks','snap-shot']
SUPPLEMENTAL_SCROLLS=['threads','source-control','worktrees','keybindings','voice','maintenance','appearance']
SUPPLEMENTAL_MENUS=[('general','thread-notifications'),('browser','browser-link-target')]
def validate_supplemental(root, audit):
    require(isinstance(audit,dict) and audit.get('schema_version')==1,'Missing supplemental audit')
    require(set(audit)=={'schema_version','scope','routes','scrolls','menus','screenshots','not_captured','limitations','secrets'},'Unexpected supplemental fields')
    require(audit.get('scope')=='packaged isolated-profile supplemental settings; not all UI or native OS coverage','Wrong supplemental scope')
    require([r.get('route') for r in audit.get('routes',[])]==['/settings/'+n for n in SUPPLEMENTAL_ROUTES],'Missing supplemental routes')
    names=[]
    for r,n in zip(audit['routes'],SUPPLEMENTAL_ROUTES):
        require(set(r)=={'route','marker','locale','static_anchor','screenshot'} and r['locale']=='zh-CN','Unsafe supplemental route fields')
        require(r['marker']==({'providers':'#providers','snap-shot':'#snap-shot'}.get(n)),'Wrong supplemental anchor')
        require(r['static_anchor']=={'providers':'服务提供方','projects':'选择项目以管理其名称、图标、检出目录和操作。','scheduled-tasks':'定时任务','snap-shot':'快照'}[n],'Wrong static anchor')
        name='supplemental-'+n+'-overview.png';require(r['screenshot']==name,'Wrong supplemental screenshot');names.append(name)
    require(audit.get('secrets')=={'route':'/settings/secrets','status':'feature-disabled-redirect-verified','redirect':'/settings/general','captured':False},'Secrets route must remain disabled and uncaptured')
    require([r.get('route') for r in audit.get('scrolls',[])]==['/settings/'+n for n in SUPPLEMENTAL_SCROLLS],'Missing scroll coverage')
    for r,n in zip(audit['scrolls'],SUPPLEMENTAL_SCROLLS):
        require(set(r)=={'route','samples','reached_bottom'} and isinstance(r['reached_bottom'],bool),'Unsafe scroll fields')
        require(1<=len(r['samples'])<=32,'Unbounded scroll captures');last=-1
        for i,s in enumerate(r['samples']):
            require(set(s)=={'top','maximum','height','screenshot'},'Unsafe scroll sample fields')
            require(all(isinstance(s[k],(int,float)) and not isinstance(s[k],bool) for k in ('top','maximum','height')),'Invalid scroll metrics')
            require(s['height']>0 and s['maximum']>=s['top']>last,'Invalid scroll progress');last=s['top']
            name=f'supplemental-{n}-scroll-{i}.png';require(s['screenshot']==name,'Wrong scroll screenshot');names.append(name)
        require(r['reached_bottom'] is True and r['samples'][-1]['top']>=r['samples'][-1]['maximum'],'Incomplete scroll coverage')
    require([(r.get('route'),r.get('row')) for r in audit.get('menus',[])]==[('/settings/'+n,i) for n,i in SUPPLEMENTAL_MENUS],'Missing menus')
    for r,(n,i) in zip(audit['menus'],SUPPLEMENTAL_MENUS):
        require(set(r)=={'route','row','opened','closed','value_unchanged','screenshot'} and all(r[k] is True for k in ('opened','closed','value_unchanged')),'Menu mutation/unclosed popup')
        name=f'supplemental-{n}-{i}-options.png';require(r['screenshot']==name,'Wrong menu screenshot');names.append(name)
    require(audit['not_captured']==[
        {'route':'/settings/access','reason':'Pairing credentials and client details require separately validated structural redaction.'},
        {'route':'/settings/diagnostics','reason':'Process, endpoint and log data require separately validated structural redaction.'}], 'Missing sensitive-route limitations')
    require(isinstance(audit['limitations'],list) and len(audit['limitations'])==5 and all(isinstance(x,str) and x for x in audit['limitations']),'Missing supplemental limitations')
    require([s.get('name') for s in audit.get('screenshots',[])]==names,'Supplemental image inventory mismatch')
    for s in audit['screenshots']:
        require(set(s)=={'name','size','sha256'},'Unexpected image metadata');path=root/'cjk'/s['name'];png(path)
        require(path.stat().st_size==s['size'] and sha(path)==s['sha256'],'Supplemental image hash mismatch')

def validate_manifest(m):
    require(m.get('schemaVersion')==1,'Invalid schema')
    require(m.get('repository')=='ZhiweiXiao98/t3code','Unexpected repository')
    for key in ('sourceSha','sourceTree','workflowSha'):
        require(isinstance(m.get(key),str) and re.fullmatch('[0-9a-f]{40}',m[key]),'Missing/invalid '+key)
    for key in ('artifactZipSha256','proofZipSha256','producerLogSha256','playwrightTreeSha256','cjkDriverSha256','cleanDriverSha256'):
        require(isinstance(m.get(key),str) and re.fullmatch('[0-9a-f]{64}',m[key]),'Missing/invalid '+key)
    for key in ('producerRunId','producerRunAttempt','producerJobId','artifactId','proofArtifactId','packageUploadStepNumber','proofUploadStepNumber'):
        require(type(m.get(key)) is int and m[key]>0,'Missing/invalid '+key)
    require(m['cleanDriverSha256']==CLEAN_SHA,'Clean driver changed')
    require(m['cjkDriverSha256']==CJK_SHA,'CJK driver changed')
    require(m.get('playwrightVersion')=='1.60.0','Unexpected Playwright')
    require(m.get('playwrightSize')==2814257 and m.get('playwrightIntegrity')=='sha512-9bW6zvX/m0lEbgTKJ6YppOKx8H3VOPBMOCFh2irXFOT4BbHgrx5hPjwJYLT40Lu+4qtD36qKc/Hn56StUW57IA==','Unverified official Playwright integrity/size')
    require(m.get('privacyClauses')==PRIVACY_CLAUSES and 'privacyClause' not in m,'Privacy exact-map assertion changed')
    require(m.get('imageUrl')==IMAGE_URL and m.get('imageSha512')==IMAGE_SHA,'Debian image pin changed')
    require((m.get('mode'),m.get('kind')) in [('same-full-run-debian13-v1','appimage'),('same-full-run-native-deb-v1','deb')],'Explicit live mode required')
    require(m['sourceSha']==m['workflowSha'],'Full-run source/head mismatch')
    require(not any(key.startswith('ubuntu24') for key in m),'Focused failure proof forbidden')
    require(re.fullmatch('[0-9a-f]{64}',m.get('installerSha256','')) and re.fullmatch('[0-9a-f]{64}',m.get('executableSha256','')),'Installer/executable pins required')
    kind=m['kind'];suffix='.AppImage' if kind=='appimage' else '.deb'
    require(m.get(kind+'Sha256')==m['installerSha256'],'Installer identity mismatch')
    if kind=='appimage':require(m['installerSha256']==m['executableSha256'],'Guest asset/executable mismatch')
    for key in (kind+'ZipPath',kind+'ProofPath'):
        require(safe_name(m.get(key)).endswith(suffix),'Wrong installer kind')
    return m

def safe_name(name):
    require(isinstance(name,str) and name and '\\' not in name and ':' not in name,'Invalid path')
    p=pathlib.PurePosixPath(name)
    require(not p.is_absolute() and '..' not in p.parts and str(p) not in ('','.','/'),'Unsafe path')
    return str(p)

def run(command, timeout, progress=None, **kw):
    """Bound binary driver logs and kill subprocess groups on timeout/interruption."""
    import selectors
    output=kw.get('stdout');capture=hasattr(output,'fileno')
    if capture:kw={**kw,'stdout':subprocess.PIPE}
    p=subprocess.Popen(command,start_new_session=True,**kw);selector=None
    try:
        if capture:
            selector=selectors.DefaultSelector();selector.register(p.stdout,selectors.EVENT_READ)
            deadline=time.monotonic()+timeout;total=0
            while selector.get_map():
                if progress is not None:progress()
                remaining=deadline-time.monotonic()
                if remaining<=0:raise subprocess.TimeoutExpired(command,timeout)
                for key,event in selector.select(min(0.25,remaining)):
                    chunk=os.read(key.fileobj.fileno(),65536)
                    if not chunk:selector.unregister(key.fileobj);break
                    require(total+len(chunk)<=16*1024*1024,'Command log exceeds 16MiB budget')
                    output.write(chunk);output.flush();total+=len(chunk)
            # A child may close its log pipe before exiting. Continue supervising
            # phase budgets rather than blocking until only the total expires.
            if progress is not None:
                while p.poll() is None:
                    progress()
                    remaining=deadline-time.monotonic()
                    if remaining<=0:raise subprocess.TimeoutExpired(command,timeout)
                    try:p.wait(timeout=min(0.25,remaining))
                    except subprocess.TimeoutExpired:pass
                rc=p.returncode
            else:rc=p.wait(timeout=max(0.001,deadline-time.monotonic()))
        else:rc=p.wait(timeout=timeout)
    except BaseException as error:
        try:os.killpg(p.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        p.wait()
        if isinstance(error,subprocess.TimeoutExpired):raise TimeoutError('Command timed out: '+str(command[0])) from error
        raise
    finally:
        if selector:selector.close()
        if capture:p.stdout.close()
    if rc:raise subprocess.CalledProcessError(rc,command)


def unpack_tar(path,target,max_size=256*1024*1024):
    require(not pathlib.Path(target).exists(),'Extraction target must be fresh')
    records=[];seen=set();total=0
    with tarfile.open(path,'r:*') as archive:
        for m in archive:
            if m.name in ('.','./') and m.isdir(): continue
            name=safe_name(m.name)
            require(name not in seen,'Duplicate normalized path')
            require(m.sparse is None and m.type in (tarfile.REGTYPE,tarfile.AREGTYPE,tarfile.DIRTYPE),'Sparse/links/devices forbidden')
            require(len(records)<20000,'Too many members')
            total+=m.size;require(0<=m.size<=max_size and total<=max_size,'Archive too large')
            seen.add(name);data=archive.extractfile(m).read(m.size+1) if m.isfile() else None
            require(data is None or len(data)==m.size,'Archive member length mismatch')
            records.append((name,m,data))
    files={n for n,m,_ in records if m.isfile()}
    require(not any(str(parent) in files for n,_,_ in records for parent in pathlib.PurePosixPath(n).parents),'Conflicting paths')
    target=pathlib.Path(target);target.mkdir()
    for n,m,b in records:
        dest=target/n
        if m.isdir():dest.mkdir(parents=True,exist_ok=True)
        else:dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)


def png(path):
    from png_validation import validate_png
    require(path.stat().st_size<=32*1024*1024,'Screenshot file size limit')
    validate_png(path.read_bytes())


def under(child,parent):
    return isinstance(child,str) and isinstance(parent,str) and pathlib.PurePosixPath(child).is_absolute() and pathlib.PurePosixPath(parent).is_absolute() and '..' not in pathlib.PurePosixPath(child).parts and '..' not in pathlib.PurePosixPath(parent).parts and pathlib.PurePosixPath(child).is_relative_to(parent) and pathlib.PurePosixPath(child)!=pathlib.PurePosixPath(parent)

def strict_dict(actual,expected):
    return isinstance(actual,dict) and set(actual)==set(expected) and all(type(actual[k]) is type(v) and actual[k]==v for k,v in expected.items())

def sandbox(effective,hyphen=False):
    keys=['no-sandbox','disable-setuid-sandbox','disable-seccomp-filter-sandbox','disable-gpu-sandbox'] if hyphen else ['noSandbox','disableSetuidSandbox','disableSeccompFilterSandbox','disableGpuSandbox']
    require(strict_dict(effective.get('switches'),dict.fromkeys(keys,False)),'Invalid sandbox switches')
    require(strict_dict(effective.get('preferences'),{'sandbox':True,'contextIsolation':True,'nodeIntegration':False}),'Invalid sandbox preferences')
    require(strict_dict(effective.get('renderer'),{'processType':'renderer','sandboxed':True,'contextIsolated':True}),'Missing actual renderer sandbox')

def probe(report):
    p=report.get('rendererProbe',{})
    require(p.get('method')=='CDP existing preload lexical scope' and p.get('reloadSameFreshProfile') is True,'Wrong sandbox observation method')
    require(isinstance(p.get('preloadScripts'),list) and len(p['preloadScripts'])==1 and isinstance(p['preloadScripts'][0],str) and re.search(r'[/\\]preload\.(?:js|cjs|mjs)$',p['preloadScripts'][0]),'Invalid packaged preload URL')
    require(isinstance(p.get('breakpoint'),dict) and set(p['breakpoint'])=={'lineNumber','columnNumber'} and all(type(value) is int and value>=0 for value in p['breakpoint'].values()),'Invalid packaged preload breakpoint')
    require(len(p.get('preloadScripts',[]))==1 and re.fullmatch('[0-9a-f]{64}',p.get('preloadSha256','')),'Missing packaged preload identity')

def launch_args(args,executable,home):
    require(isinstance(args,list) and args and all(isinstance(arg,str) for arg in args) and args[0]==executable,'Wrong executable caller')
    require([arg for arg in args if arg.startswith('--user-data-dir=')]==['--user-data-dir='+home+'/electron-profile'],'Missing/duplicate isolated profile argument')
    require(not any(re.search(r'--(?:no-sandbox|disable-setuid-sandbox|disable-seccomp-filter-sandbox|disable-gpu-sandbox|appimage-extract)',arg) for arg in args),'Forbidden launch argument')

def body(text):
    require(isinstance(text,str) and text.strip() and not re.search('could not start|failed to start the server|无法启动服务器',text,re.I),'Failed/empty rendered UI')

def app_url(url):
    require(isinstance(url,str) and re.match(r'^(?:t3code://app/|https?://(?:127\.0\.0\.1|localhost):[0-9]+/)',url),'Unexpected packaged app URL')

def read_json(path):
    def pairs(items):
        result={}
        for key,value in items:
            require(key not in result,'Duplicate JSON key: '+key);result[key]=value
        return result
    return json.loads(path.read_text(),object_pairs_hook=pairs)

def validate_results(root,m):
    root=pathlib.Path(root);status=read_json(root/'status.json')
    require(status.get('result')=='passed' and type(status.get('exitCode')) is int and status.get('exitCode')==0,'Guest did not pass')
    identity='appimageSha256' if m['kind']=='appimage' else 'installerSha256'
    require(status.get('sourceSha')==m['sourceSha'] and status.get(identity)==m['installerSha256'],'Runtime input mismatch')
    require(status.get('cleanDriverSha256')==CLEAN_SHA and status.get('cjkDriverSha256')==CJK_SHA,'Guest driver identities missing')
    execution=status.get('execution',{})
    require(execution.get('id')==('debian' if m['kind']=='appimage' else 'ubuntu') and execution.get('versionId')==('13' if m['kind']=='appimage' else '24.04'),'Wrong actual execution OS')
    require(type(execution.get('uid')) is int and execution['uid']>0 and execution.get('executableSha256')==m['executableSha256'],'Execution user/executable mismatch')
    require(execution.get('architecture')=='x86_64' and execution.get('securityDefaultsMember')=='results/security-defaults.json','Missing observed architecture/security binding')
    security=read_json(root/'security-defaults.json')
    require(set(security)=={'kernel/unprivileged_userns_clone','kernel/apparmor_restrict_unprivileged_userns','user/max_user_namespaces','apparmor_enabled'} and all(v is None or isinstance(v,str) for v in security.values()),'Missing actual security observations')
    libc=re.fullmatch(r'glibc (\d+)\.(\d+)',execution.get('glibc',''));require(libc and tuple(map(int,libc.groups()))>=(2,39),'Unsupported runtime glibc')
    clean=read_json(root/'clean/clean-first-start.json')
    require(clean.get('result')=='passed' and type(clean.get('schemaVersion')) is int and clean.get('schemaVersion')==2 and clean.get('fixtureData') is False,'Clean schema/fixture/result mismatch')
    require(clean.get('requestedChromiumSandbox') is True and clean.get('cliSandboxOverride') is False,'Sandbox caller assertions missing')
    require(clean.get('profileIsolation')=='unique temporary directory','Wrong profile isolation')
    home=clean.get('testHome','');require(home.startswith('/tmp/t3-clean-first-start-'),'Wrong clean profile')
    executable='/var/tmp/t3-validation/work/app.AppImage' if m['kind']=='appimage' else m['installedExecutable'];require(clean.get('executable')==executable,'Wrong actual executable')
    launch_args(clean.get('spawnArgs'),executable,home)
    require(clean.get('packaged',{}).get('isPackaged') is True and under(clean['packaged']['userData'],home),'Packaged/isolated profile missing')
    sandbox(clean.get('effectiveSandbox',{}));probe(clean)
    first=clean.get('firstRender',{});body(first.get('bodyText'));app_url(first.get('windowUrl'))
    require(first.get('screenshot')=='clean-first-render.png','Wrong first render screenshot')
    require('error' not in clean and isinstance(clean.get('windowTitle'),str),'Invalid clean success report')
    require(clean.get('backendSignalExits')==[],'Unexpected or unobserved backend signal exits')
    body(clean.get('bodyText'));app_url(clean.get('windowUrl'))
    png(root/'clean/clean-first-render.png');png(root/'clean/clean-first-start.png')
    cjk=read_json(root/'cjk/linux-chinese-ui.json')
    require('error' not in cjk,'CJK success report contains error')
    require(type(cjk.get('schema_version')) is int and cjk.get('schema_version')==2 and cjk.get('passed') is True and cjk.get('persisted_restart') is True,'CJK schema/persistence failed')
    require(cjk.get('source')=={'sha':m['sourceSha'],'tree':m['sourceTree']},'CJK source mismatch')
    require(strict_dict(cjk.get('producer'),{'run_id':m['producerRunId'],'run_attempt':m['producerRunAttempt'],'artifact_id':m['artifactId']}),'CJK producer mismatch')
    require(cjk.get('asset',{}).get('sha256')==m['installerSha256'] and type(cjk.get('asset',{}).get('size')) is int and cjk['asset']['size']==m['installerBytes'],'CJK installer identity missing')
    require(cjk.get('driver_sha256')==CJK_SHA and cjk.get('playwright_version')=='1.60.0','CJK driver/dependency mismatch')
    require(cjk.get('evidence_type')==m['mode'] and cjk.get('kind')==m['kind'] and cjk.get('executable',{}).get('sha256')==m['executableSha256'],'Wrong typed CJK runtime')
    require(cjk.get('environment',{}).get('distro',{}).get('ID')==('debian' if m['kind']=='appimage' else 'ubuntu') and cjk['environment']['distro'].get('VERSION_ID')==('13' if m['kind']=='appimage' else '24.04'),'Wrong distro/version')
    require(type(cjk['environment'].get('uid')) is int and (cjk['environment']['uid']==65534 if m['kind']=='appimage' else cjk['environment']['uid']>0) and cjk['environment'].get('kernel'),'Missing nonroot kernel evidence')
    require(cjk['environment']['uid']==execution['uid'] and cjk['executable'].get('path')==executable,'Raw runtime binding mismatch')
    font_evidence=read_json(root/'cjk/font-evidence.json')
    require(cjk.get('font_environment')==font_evidence,'Raw font environment mismatch')
    require(isinstance(font_evidence.get('font_match'),str) and 'Noto' in font_evidence['font_match'] and isinstance(font_evidence.get('noto_package'),str) and 'fonts-noto-cjk' in font_evidence['noto_package'],'Missing installed distro CJK font observation')
    font_os=dict(line.split('=',1) for line in font_evidence.get('distro','').splitlines() if '=' in line)
    require(font_os.get('ID')==execution['id'] and font_os.get('VERSION_ID','').strip('"')==execution['versionId'],'Font distro/runtime mismatch')
    profile=cjk.get('profile',{});chome=profile.get('home','')
    require(chome.startswith('/tmp/t3-cjk-check-') and profile.get('t3Home')==chome+'/t3' and profile.get('initially_empty') is True and profile.get('restart_reuses_same_profile') is True,'CJK profile contract missing')
    require(cjk.get('language_selection')=='actual combobox and option clicks','Language was not selected through real UI')
    observation=cjk.get('privacy_observation',{})
    source_clause=observation.get('source_clause');require(source_clause in PRIVACY_CLAUSES,'Unknown observed English privacy clause')
    expected_privacy=PRIVACY_CLAUSES[source_clause]
    require(observation.get('expected_translation')==expected_privacy and observation.get('observed_before_language_selection') is True and observation.get('visible') is True,'Missing initial privacy observation')
    paragraph=observation.get('english_paragraph');require(isinstance(paragraph,str) and [source for source in PRIVACY_CLAUSES if source in paragraph]==[source_clause],'English privacy observation ambiguous or mismatched')
    sessions=cjk.get('sessions',[]);require(len(sessions)==2,'Missing CJK sessions')
    for session in sessions:
        require(session.get('application_env')=={'home':chome,'forbidden_keys':[]},'Application inherited external credentials or HOME')
        require(session.get('backendSignalExits')==[],'Unexpected or unobserved CJK backend signal exits')
        sandbox(session.get('effectiveSandbox',{}),True);probe(session)
        require(session.get('requested_chromium_sandbox') is True,'CJK sandbox not requested')
        launch_args(session.get('spawn_args'),executable,chome)
        packaged=session.get('packaged',{});require(packaged.get('isPackaged') is True and packaged.get('noSandbox') is False and under(packaged.get('userData',''),chome),'CJK packaged/profile mismatch')
        require(session.get('locale')=='zh-CN' and session.get('page_errors')==[],'CJK locale/page errors')
        body(session.get('body_text'));app_url(session.get('url'))
        require(all(label in session['body_text'] for label in ['欢迎使用 T3 Code','暂不配置 Agent，直接开始','启动',expected_privacy]),'Missing Chinese/privacy labels')
        require(not any(source in session['body_text'] for source in PRIVACY_CLAUSES),'Untranslated privacy clause')
        require(not any(translation in (session['body_text'].replace(expected_privacy,'') if translation in expected_privacy else session['body_text']) for translation in PRIVACY_CLAUSES.values() if translation!=expected_privacy),'Wrong/switched Chinese privacy variant')
        require(strict_dict(session.get('privacy_clause'),{'source':source_clause,'expected':expected_privacy,'visible':True}),'Privacy clause missing')
        fonts=session.get('rendered_chinese_fonts',{});require(fonts.get('text')=='欢迎使用 T3 Code','Wrong actual-font target')
        require(all(isinstance(font.get('familyName'),str) and type(font.get('glyphCount')) is int and font['glyphCount']>=0 for font in fonts.get('fonts',[])),'Invalid actual-font record')
        glyphs=sum(font.get('glyphCount',0) for font in fonts.get('fonts',[]) if re.search(r'Noto.*CJK',font.get('familyName',''),re.I))
        require(glyphs>=4,'Insufficient actual CJK glyphs')
        require(not any(re.search('client.settings.*persist failed|could not start|无法启动',err,re.I) for err in session.get('console_errors',[])),'CJK persistence console failure')
    require(sessions[0]['packaged']['userData']==sessions[1]['packaged']['userData'],'Restart used different profile')
    settings=cjk.get('settings_roundtrip',[])
    require([s.get('locale') for s in settings]==['zh-CN','en','zh-CN'],'Missing settings language roundtrip')
    for s in settings:
        locale=s['locale'];descriptions=s.get('descriptions',{});text=s.get('body_text');body(text);app_url(s.get('url'))
        require(s['url'].endswith('#/settings/threads'),'Wrong settings route')
        require(set(descriptions)==set(THREAD_SETTINGS[locale]),'Missing settings descriptions')
        for key,alternatives in THREAD_SETTINGS[locale].items():require(descriptions[key] in alternatives and descriptions[key] in text,'Wrong/unrendered settings description')
        other='en' if locale=='zh-CN' else 'zh-CN'
        require(not any(label in text for alternatives in THREAD_SETTINGS[other].values() for label in alternatives),'Mixed-language settings descriptions')
        require(s.get('navigation')==(['语音'] if locale=='zh-CN' else ['Voice']),'Missing settings navigation')
        require(s.get('groups')==(['智能体','代码','连接'] if locale=='zh-CN' else ['Agents','Code','Connections']),'Missing settings groups')
    audit=cjk.get('settings_audit',{});routes=audit.get('routes',[])
    require(audit.get('scope')==SETTINGS_OVERVIEW_SCOPE and audit.get('unvisited')==SETTINGS_UNVISITED,'Missing or overstated settings coverage')
    limits=audit.get('limitations',[])
    require(isinstance(limits,list) and len(limits)==5 and all(isinstance(item,str) and item for item in limits),'Missing settings limitations')
    require('not covered' in ' '.join(limits) and 'Linux shared UI' in ' '.join(limits),'Missing stateful/native coverage limits')
    require([(r.get('route'),r.get('marker')) for r in routes]==[('/settings/'+name,marker) for name,marker in SETTINGS_OVERVIEWS],'Missing/wrong settings overview routes')
    for r in routes:
        require(r.get('locale')=='zh-CN','Wrong settings overview locale');app_url(r.get('url'));body(r.get('body_text'))
        require(r['url'].endswith('#'+r['route']),'Wrong settings overview URL')
        require(isinstance(r.get('ready_text'),str) and re.search('[\u3400-\u9fff]',r['ready_text']) and r['ready_text'] in r['body_text'],'Missing Chinese settings readiness evidence')
        require(r.get('screenshot')=='settings-'+r['route'].removeprefix('/settings/')+'-zh-CN.png','Wrong settings overview screenshot')
        require(isinstance(r.get('ascii_lines_for_review'),list) and all(isinstance(line,str) for line in r['ascii_lines_for_review']),'Missing settings text review evidence')
    validate_supplemental(root,cjk.get('supplemental_settings_audit'))
    expected_names=['01-fonts-installed-english.png','02-chinese-selected.png','03-chinese-after-restart.png','04-chinese-thread-settings.png','05-english-thread-settings.png','06-chinese-thread-settings-restored.png']+['settings-'+name+'-zh-CN.png' for name,_ in SETTINGS_OVERVIEWS]
    screenshots=cjk.get('screenshots',[]);require([item.get('name') for item in screenshots]==expected_names,'Missing CJK screenshot set')
    for item in screenshots:
        path=root/'cjk'/item['name'];png(path)
        require(path.stat().st_size==item.get('size') and sha(path)==item.get('sha256'),'CJK screenshot digest/size mismatch')
    if m['kind']=='appimage':
        fuse=read_json(root/'fuse.json')
        require(fuse.get('observed') is True and fuse.get('artifactSha256')==m['appimageSha256'] and fuse.get('uid')==65534 and '/.mount_' in fuse.get('exe','') and fuse.get('mountinfo'),'Missing ordinary nonroot FUSE evidence')
    return status


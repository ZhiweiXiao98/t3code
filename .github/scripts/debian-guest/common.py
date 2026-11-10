"""Fail-closed manifest, bounded execution, archive and acceptance primitives."""
import base64, hashlib, io, json, os, pathlib, re, signal, subprocess, tarfile
CLEAN_SHA='1cfb62bf02d1c4063362b1ffed1cea17c6dfe532e4bf05e7b5bfe0f153362375'
IMAGE_URL='https://cloud.debian.org/cdimage/cloud/trixie/20261001-2618/debian-13-genericcloud-amd64-20261001-2618.qcow2'
IMAGE_SHA='f46f0671a6e5bdec5291ab8972bae2f10e5408c2f64a74078f11efc2f06a436a9d0313ed50e0472542eeabf780e9f7c792ac0a314c6c20507fcd9fd81b468c3d'
CJK_SHA='ad5ee86d2e4fa8fa5dbc98a75fcf35eb324b38eb17d9acbfac609cf11f0e37f1'
PRIVACY_CLAUSES={'To read more about how your data is used, see our': '如需了解数据的使用方式，请参阅我们的', 'To read more about how your data is used and how to opt out, see our': '如需了解数据的使用方式以及如何退出，请参阅我们的'}

def require(value, message):
    if not value: raise ValueError(message)

def sha(path, algorithm='sha256'):
    h=hashlib.new(algorithm)
    with open(path,'rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def validate_manifest(m):
    require(m.get('schemaVersion')==1,'Invalid schema')
    require(m.get('repository')=='ZhiweiXiao98/t3code','Unexpected repository')
    for key in ('sourceSha','sourceTree','workflowSha'):
        require(isinstance(m.get(key),str) and re.fullmatch('[0-9a-f]{40}',m[key]),'Missing/invalid '+key)
    for key in ('appimageSha256','artifactZipSha256','proofZipSha256','producerLogSha256','playwrightTreeSha256','cjkDriverSha256','cleanDriverSha256'):
        require(isinstance(m.get(key),str) and re.fullmatch('[0-9a-f]{64}',m[key]),'Missing/invalid '+key)
    for key in ('producerRunId','producerRunAttempt','producerJobId','artifactId','proofArtifactId','packageUploadStepNumber','proofUploadStepNumber'):
        require(type(m.get(key)) is int and m[key]>0,'Missing/invalid '+key)
    require(m['cleanDriverSha256']==CLEAN_SHA,'Clean driver changed')
    require(m['cjkDriverSha256']==CJK_SHA,'CJK driver changed')
    require(m.get('playwrightVersion')=='1.60.0','Unexpected Playwright')
    require(m.get('playwrightSize')==2814257 and m.get('playwrightIntegrity')=='sha512-9bW6zvX/m0lEbgTKJ6YppOKx8H3VOPBMOCFh2irXFOT4BbHgrx5hPjwJYLT40Lu+4qtD36qKc/Hn56StUW57IA==','Unverified official Playwright integrity/size')
    require(m.get('privacyClauses')==PRIVACY_CLAUSES and 'privacyClause' not in m,'Privacy exact-map assertion changed')
    require(m.get('imageUrl')==IMAGE_URL and m.get('imageSha512')==IMAGE_SHA,'Debian image pin changed')
    require(m.get('ubuntu24Outcome')=='failed','Ubuntu24 contingency gate not satisfied')
    require(m.get('ubuntu24SourceSha')==m['sourceSha'],'Ubuntu24 tested different source')
    require(type(m.get('ubuntu24RunId')) is int and m['ubuntu24RunId']>0,'Missing Ubuntu24 evidence')
    require(type(m.get('ubuntu24JobId')) is int and m['ubuntu24JobId']>0,'Missing Ubuntu24 job evidence')
    require(m['ubuntu24RunId']==m['producerRunId'],'Ubuntu24 must test this same producer run')
    require(isinstance(m.get('ubuntu24JobName'),str) and m['ubuntu24JobName'],'Missing exact Ubuntu24 job name')
    for key in ('appimageZipPath','appimageProofPath'):
        safe_name(m.get(key))
    require(m['appimageZipPath'].endswith('.AppImage'),'Not an AppImage')
    return m

def safe_name(name):
    require(isinstance(name,str) and name and '\\' not in name and ':' not in name,'Invalid path')
    p=pathlib.PurePosixPath(name)
    require(not p.is_absolute() and '..' not in p.parts and str(p) not in ('','.','/'),'Unsafe path')
    return str(p)

def run(command, timeout, **kw):
    """Kill the whole spawned group on timeout; never leave app grandchildren."""
    p=subprocess.Popen(command,start_new_session=True,**kw)
    try:
        rc=p.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid,signal.SIGKILL);p.wait()
        raise TimeoutError('Command timed out: '+str(command[0]))
    if rc: raise subprocess.CalledProcessError(rc,command)

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

def validate_producer(m,repo,runinfo,job,artifact,ubuntu_job,proof_artifact=None):
    require(repo.get('private') is False and repo.get('full_name')==m['repository'],'Repository not public')
    require(runinfo.get('id')==m['producerRunId'] and runinfo.get('run_attempt')==m['producerRunAttempt'],'Run/attempt mismatch')
    require(runinfo.get('head_sha')==m['workflowSha'],'Producer workflow SHA mismatch')
    require(job.get('status')=='completed' and job.get('head_sha')==m['workflowSha'],'Producer job status/head mismatch')
    require(job.get('id')==m['producerJobId'] and job.get('run_id')==m['producerRunId'] and job.get('conclusion')=='success','Producer job failed or mismatched')
    require(job.get('run_attempt')==m['producerRunAttempt'],'Producer job attempt mismatch')
    require(artifact.get('id')==m['artifactId'] and artifact.get('expired') is False,'Wrong/expired artifact')
    require(artifact.get('workflow_run',{}).get('id')==m['producerRunId'],'Artifact run mismatch')
    require(artifact.get('workflow_run',{}).get('head_sha')==m['workflowSha'],'Artifact workflow mismatch')
    require(artifact.get('digest')=='sha256:'+m['artifactZipSha256'],'Artifact ZIP digest mismatch')
    require(artifact.get('name')=='client-linux-x64','Wrong installer artifact name')
    require(proof_artifact is not None,'Missing separate proof artifact metadata')
    require(proof_artifact.get('id')==m['proofArtifactId'] and proof_artifact.get('name')=='focused-linux-build-proof' and proof_artifact.get('expired') is False,'Wrong/expired proof artifact')
    require(proof_artifact.get('workflow_run',{}).get('id')==m['producerRunId'] and proof_artifact.get('workflow_run',{}).get('head_sha')==m['workflowSha'],'Proof run/workflow mismatch')
    require(proof_artifact.get('digest')=='sha256:'+m['proofZipSha256'],'Proof ZIP digest mismatch')
    from datetime import datetime,timedelta
    def date(text):return datetime.fromisoformat(text.replace('Z','+00:00'))
    for artifact_meta,step_no in [(artifact,m['packageUploadStepNumber']),(proof_artifact,m['proofUploadStepNumber'])]:
        steps=[step for step in job.get('steps',[]) if step.get('number')==step_no]
        require(len(steps)==1 and steps[0].get('status')=='completed' and steps[0].get('conclusion')=='success','Missing successful upload step metadata')
        start=date(steps[0]['started_at'])-timedelta(seconds=1);end=date(steps[0]['completed_at'])+timedelta(seconds=1)
        require(start<=date(artifact_meta['created_at'])<=date(artifact_meta['updated_at'])<=end,'Artifact timestamps not within its producer upload step')
        require(type(artifact_meta.get('size_in_bytes')) is int and artifact_meta['size_in_bytes']>0,'Missing artifact byte size')

    require(ubuntu_job.get('id')==m['ubuntu24JobId'] and ubuntu_job.get('run_id')==m['ubuntu24RunId'] and ubuntu_job.get('conclusion')=='failure','Ubuntu24 failure not verified')
    require(ubuntu_job.get('run_attempt')==m['producerRunAttempt'] and ubuntu_job.get('head_sha')==m['workflowSha'],'Ubuntu24 job attempt/workflow mismatch')
    require(ubuntu_job.get('name')==m['ubuntu24JobName'] and 'ubuntu-24.04' in ubuntu_job.get('labels',[]),'Wrong Ubuntu24 job or runner label')
    # The exact source may be an explicit build input, distinct from workflow commit.
    # It is checked through source checkout and mandatory artifact provenance below.

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
    require(status.get('sourceSha')==m['sourceSha'] and status.get('appimageSha256')==m['appimageSha256'],'Guest input mismatch')
    require(status.get('cleanDriverSha256')==CLEAN_SHA and status.get('cjkDriverSha256')==CJK_SHA,'Guest driver identities missing')
    clean=read_json(root/'clean/clean-first-start.json')
    require(clean.get('result')=='passed' and type(clean.get('schemaVersion')) is int and clean.get('schemaVersion')==2 and clean.get('fixtureData') is False,'Clean schema/fixture/result mismatch')
    require(clean.get('requestedChromiumSandbox') is True and clean.get('cliSandboxOverride') is False,'Sandbox caller assertions missing')
    require(clean.get('profileIsolation')=='unique temporary directory','Wrong profile isolation')
    home=clean.get('testHome','');require(home.startswith('/tmp/t3-clean-first-start-'),'Wrong clean profile')
    executable='/var/tmp/t3-validation/work/app.AppImage';require(clean.get('executable')==executable,'Not ordinary AppImage target')
    launch_args(clean.get('spawnArgs'),executable,home)
    require(clean.get('packaged',{}).get('isPackaged') is True and under(clean['packaged']['userData'],home),'Packaged/isolated profile missing')
    sandbox(clean.get('effectiveSandbox',{}));probe(clean)
    first=clean.get('firstRender',{});body(first.get('bodyText'));app_url(first.get('windowUrl'))
    require(first.get('screenshot')=='clean-first-render.png','Wrong first render screenshot')
    require('error' not in clean and isinstance(clean.get('windowTitle'),str),'Invalid clean success report')
    body(clean.get('bodyText'));app_url(clean.get('windowUrl'))
    png(root/'clean/clean-first-render.png');png(root/'clean/clean-first-start.png')
    cjk=read_json(root/'cjk/linux-chinese-ui.json')
    require('error' not in cjk,'CJK success report contains error')
    require(type(cjk.get('schema_version')) is int and cjk.get('schema_version')==2 and cjk.get('passed') is True and cjk.get('persisted_restart') is True,'CJK schema/persistence failed')
    require(cjk.get('source')=={'sha':m['sourceSha'],'tree':m['sourceTree']},'CJK source mismatch')
    require(strict_dict(cjk.get('producer'),{'run_id':m['producerRunId'],'run_attempt':m['producerRunAttempt'],'artifact_id':m['artifactId']}),'CJK producer mismatch')
    require(cjk.get('asset',{}).get('sha256')==m['appimageSha256'] and cjk.get('asset',{}).get('size',0)>0,'CJK installer identity missing')
    require(cjk.get('driver_sha256')==CJK_SHA and cjk.get('playwright_version')=='1.60.0','CJK driver/dependency mismatch')
    require(cjk.get('environment',{}).get('distro',{}).get('ID')=='debian' and cjk['environment']['distro'].get('VERSION_ID')=='13','Wrong distro/version')
    require(cjk['environment'].get('uid')==65534 and cjk['environment'].get('kernel'),'Missing nonroot kernel evidence')
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
        sandbox(session.get('effectiveSandbox',{}),True);probe(session)
        require(session.get('requested_chromium_sandbox') is True,'CJK sandbox not requested')
        launch_args(session.get('spawn_args'),executable,chome)
        packaged=session.get('packaged',{});require(packaged.get('isPackaged') is True and packaged.get('noSandbox') is False and under(packaged.get('userData',''),chome),'CJK packaged/profile mismatch')
        require(session.get('locale')=='zh-CN' and session.get('page_errors')==[],'CJK locale/page errors')
        body(session.get('body_text'));app_url(session.get('url'))
        require(all(label in session['body_text'] for label in ['设置 T3 Code','连接你的设备','要设置的设备','添加设备',expected_privacy]),'Missing Chinese/privacy labels')
        require(not any(source in session['body_text'] for source in PRIVACY_CLAUSES),'Untranslated privacy clause')
        require(not any(translation in session['body_text'] for translation in PRIVACY_CLAUSES.values() if translation!=expected_privacy),'Wrong/switched Chinese privacy variant')
        require(strict_dict(session.get('privacy_clause'),{'source':source_clause,'expected':expected_privacy,'visible':True}),'Privacy clause missing')
        fonts=session.get('rendered_chinese_fonts',{});require(fonts.get('text')=='连接你的设备','Wrong actual-font target')
        require(all(isinstance(font.get('familyName'),str) and type(font.get('glyphCount')) is int and font['glyphCount']>=0 for font in fonts.get('fonts',[])),'Invalid actual-font record')
        glyphs=sum(font.get('glyphCount',0) for font in fonts.get('fonts',[]) if re.search(r'Noto.*CJK',font.get('familyName',''),re.I))
        require(glyphs>=len('连接你的设备'),'Insufficient actual CJK glyphs')
        require(not any(re.search('client.settings.*persist failed|could not start|无法启动',err,re.I) for err in session.get('console_errors',[])),'CJK persistence console failure')
    require(sessions[0]['packaged']['userData']==sessions[1]['packaged']['userData'],'Restart used different profile')
    expected_names=['01-fonts-installed-english.png','02-chinese-selected.png','03-chinese-after-restart.png']
    screenshots=cjk.get('screenshots',[]);require([item.get('name') for item in screenshots]==expected_names,'Missing CJK screenshot set')
    for item in screenshots:
        path=root/'cjk'/item['name'];png(path)
        require(path.stat().st_size==item.get('size') and sha(path)==item.get('sha256'),'CJK screenshot digest/size mismatch')
    fuse=read_json(root/'fuse.json')
    require(fuse.get('observed') is True and fuse.get('artifactSha256')==m['appimageSha256'] and fuse.get('uid')==65534 and '/.mount_' in fuse.get('exe','') and fuse.get('mountinfo'),'Missing ordinary nonroot FUSE evidence')
    return status


def validate_upload_logs(m,job,log_text,artifacts=None):
    from datetime import datetime,timedelta
    def date(text):return datetime.fromisoformat(text.replace('Z','+00:00'))
    require(hashlib.sha256(log_text.encode()).hexdigest()==m['producerLogSha256'],'Producer log digest mismatch')
    for number,name,aid,digest in [(m['packageUploadStepNumber'],'client-linux-x64',m['artifactId'],m['artifactZipSha256']),(m['proofUploadStepNumber'],'focused-linux-build-proof',m['proofArtifactId'],m['proofZipSha256'])]:
        steps=[s for s in job.get('steps',[]) if s.get('number')==number]
        require(len(steps)==1 and steps[0].get('conclusion')=='success','Upload step is not successful')
        step=steps[0];require('upload-artifact' in step.get('name',''),'Wrong producer step')
        start=date(step['started_at'])-timedelta(seconds=1);end=date(step['completed_at'])+timedelta(seconds=1)
        lines=[]
        for line in log_text.splitlines():
            parts=line.split(' ',1)
            try:stamp=date(parts[0])
            except (ValueError,IndexError):continue
            if start<=stamp<=end:lines.append(line)
        block='\n'.join(lines)
        # Disambiguate adjacent upload steps even when timestamp resolution overlaps.
        groups=list(re.finditer(r'(?m)^.*##\[group\]Run actions/upload-artifact@[^\n]*\n',log_text))
        candidates=[]
        for group in groups:
            next_group=re.search(r'(?m)^.*##\[group\]',log_text[group.end():])
            stop=group.end()+next_group.start() if next_group else len(log_text)
            candidate=log_text[group.start():stop]
            if re.search(r'\bname:\s*'+re.escape(name)+r'\s*(?:\n|$)',candidate):candidates.append(candidate)
        require(len(candidates)==1,'Cannot uniquely bind upload action log group')
        require(re.search(r'Artifact ID:?\s*'+str(aid)+r'\b',candidates[0],re.I) and digest in candidates[0],'Artifact ID/digest belong to another upload group')
        require(re.search(r'\bname:\s*'+re.escape(name)+r'\s*(?:\n|$)',block),'Upload artifact name missing from exact step window')
        require(re.search(r'Artifact ID:?\s*'+str(aid)+r'\b',block,re.I),'Upload artifact ID missing')
        require(digest in block,'Upload artifact digest missing')
        require(artifacts is not None,'Artifact metadata required for upload byte-size check')
        metas=[a for a in artifacts if a.get('id')==aid];require(len(metas)==1,'Missing artifact size metadata')
        size=metas[0].get('size_in_bytes');require(type(size) is int and size>0,'Missing final artifact size')
        final=r'Artifact '+re.escape(name)+r' has been successfully uploaded! Final size is '+str(size)+r' bytes\. Artifact ID is '+str(aid)+r'\b'
        require(re.search(final,candidates[0]) and re.search(final,block),'Final upload name/size/ID mismatch')


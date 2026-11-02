const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const vm=require('node:vm');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const script=fs.readFileSync(process.argv[2],'utf8');
async function scenario(mode) {
 const writes=[]; const repo={full_name:'ZhiweiXiao98/t3code'};
 const apkName='T3-Code-zh-CN-Android-0.1.6-zh.1-arm64-v8a.apk';
 const apk=Buffer.from('PUBLIC MOCK BYTES - NOT AN APK');
 const m={source_sha:'1111111111111111111111111111111111111111',candidate_run_id:10000000000,candidate_attempt:1,apk_signature_verified:true,candidate_artifact_id:1,candidate_artifact_sha256:'a'.repeat(64),certificate_sha256:'82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88',package_name:'com.zhiweixiao.t3code.zhcn',version_name:'0.1.6-zh.1',version_code:1000413,recovery_run_id:40649758501,signed_apk_sha256:mode==='bad-hash'?'b'.repeat(64):hash(apk)};
 if(mode==='wrong-certificate')m.certificate_sha256='f'.repeat(64);
 const mb=Buffer.from(JSON.stringify(m));
 const jobNames=['Validate exact source','Lint and typecheck','Rust native formatting and tests','Mobile native static analysis','Build validated desktop bundle','Linux x64 and embedded Windows WSL runtime','Android arm64 unsigned candidate (NOT installable)','Desktop win x64 (integrity checked)','Desktop mac arm64 (integrity checked)','Desktop mac x64 (integrity checked)','Clean macOS arm64 dmg first start', 'Clean macOS arm64 zip first start', 'Clean macOS x64 dmg first start', 'Clean macOS x64 zip first start', 'Clean desktop deb first start', 'Clean desktop appimage first start', 'Clean desktop nsis first start',...['clients','web','server-1','server-2','server-3'].map(x=>`Tests (${x})`)];
 const files={[apkName]:apk,'BUILD-PROVENANCE.json':mb,'SHA256SUMS.txt':Buffer.from(`${hash(apk)}  ${apkName}\n${hash(mb)}  BUILD-PROVENANCE.json\n`)};
 const missing=()=>Promise.reject(Object.assign(new Error('absent'),{status:404}));
 const assets=[];
 let created=false;
 const github={paginate:async()=>[],rest:{git:{getRef:async()=>{if(created)return{data:{object:{sha:m.source_sha}}};if(mode==='existing')return {data:{}};return missing()},createRef:async()=>{writes.push('create-ref');created=true}},repos:{getReleaseByTag:missing,listReleases:()=>{},createRelease:async x=>{assert.equal(x.draft,true);assert.equal(x.make_latest,'false');writes.push('draft');return{data:{id:1}}},uploadReleaseAsset:async x=>{writes.push('upload');const a={name:x.name,state:'uploaded',size:x.data.length,digest:'sha256:'+(mode==='bad-upload'?'c'.repeat(64):hash(x.data))};assets.push(a);return{data:a}},listReleaseAssets:async()=>({data:assets}),updateRelease:async x=>{assert.equal(x.make_latest,'false');assert.equal(x.prerelease,false);assert.equal(x.draft,false);writes.push('publish');return{data:{draft:false,prerelease:false,html_url:'https://example.test/mock'}}}}}};
 const publicFetch=async url=>{let data;const p=new URL(url).pathname.replace('/repos/ZhiweiXiao98/t3code','');
 if(p==='')data={private:false};
 else if(p==='/actions/runs/10000000000')data={status:'completed',conclusion:'success',run_attempt:mode==='wrong-attempt'?2:1,head_sha:m.source_sha,head_branch:'maintenance/v0.1.6-zh-cloud',path:'.github/workflows/client-release.yml',repository:repo,head_repository:repo};
 else if(p.endsWith('/jobs'))data={total_count:mode==='missing-job'?21:22,jobs:(mode==='missing-job'?jobNames.slice(1):jobNames).map((name,index)=>({name,status:'completed',conclusion:mode==='skipped:'+index?'skipped':'success'}))};
 else if(p.startsWith('/git/ref/'))data={object:{sha:mode==='branch-moved'?'f'.repeat(40):m.source_sha}};
 else if(p==='/actions/artifacts/2')data={expired:false,digest:'sha256:'+ 'd'.repeat(64),workflow_run:{id:999,head_sha:'e'.repeat(40)}};
 else if(p==='/actions/artifacts/1')data={expired:mode==='expired-candidate',digest:'sha256:'+m.candidate_artifact_sha256,workflow_run:{id:m.candidate_run_id,head_sha:m.source_sha}};
 else if(p==='/actions/runs/40649758501')data={conclusion:mode==='recovery-failed'?'failure':'success',head_sha:'8fc8b21abd2380926242fc49e7f488cb4b3aa0b8'};
 else throw new Error('unexpected mocked URL');return{ok:true,json:async()=>data};};
 const fsmock={readdirSync:()=>Object.keys(files),readFileSync:(p,enc)=>{const b=files[p.replace('release-assets/','')];assert(b);return enc?b.toString(enc):b}};
 const context={require:n=>n==='node:fs'?fsmock:require(n),process:{env:{EXPECTED_SOURCE_SHA:mode==='wrong-source'?'f'.repeat(40):m.source_sha,EXPECTED_CANDIDATE_RUN:String(m.candidate_run_id),SIGNED_ARTIFACT_ID:'2',SIGNED_ARTIFACT_DIGEST:'d'.repeat(64)}},github,fetch:publicFetch,context:{runId:999,sha:'e'.repeat(40)},core:{summary:{addLink:()=>{},write:async()=>{}}},Buffer};
 let failed=false;try{await new Function(...Object.keys(context), 'return '+script)(...Object.values(context))}catch(e){failed=true;if(mode==='success')throw e;}
 if(mode==='success'){assert(!failed);assert(writes.includes('publish'));}
 else {assert(failed);assert(!writes.includes('publish'));if(mode!=='bad-upload')assert.equal(writes.length,0);else assert(writes.includes('draft'));}
 console.log('PASS publisher mock '+mode);
}
(async()=>{for(const x of ['success','bad-hash','existing','bad-upload','wrong-certificate','wrong-source','wrong-attempt','missing-job','branch-moved','expired-candidate','recovery-failed',...Array.from({length:22},(_,i)=>'skipped:'+i)])await scenario(x)})().catch(e=>{console.error(e);process.exitCode=1});


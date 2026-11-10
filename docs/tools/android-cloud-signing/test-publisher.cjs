// Entirely synthetic public fixtures. No network, keys, APK execution or GitHub writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
let script = fs.readFileSync(process.argv[2], 'utf8');
script=script.replace("assert(false, 'Canonical supplemental coverage integration pending');", "/* Synthetic fixture only: supplemental integration isolated. */");
const input = JSON.parse(fs.readFileSync(path.join(__dirname, 'reviewed-signing-input.json')));
Object.assign(input, {"candidate_artifact_id": 900001, "candidate_artifact_zip_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "candidate_unsigned_apk_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "candidate_unsigned_apk_size": 12345, "candidate_producer_job_id": 900002, "candidate_producer_attempt": 1, "candidate_producer_started_at": "2026-11-09T15:40:27Z", "candidate_producer_completed_at": "2026-11-09T16:07:59Z"});
// Replace deliberately unset production pins only inside the offline synthetic fixture.
for (const [key,value] of Object.entries({candidate_artifact_id:input.candidate_artifact_id,candidate_artifact_zip_size:input.candidate_artifact_zip_size,candidate_artifact_sha256:input.candidate_artifact_zip_sha256,unsigned_apk_sha256:input.candidate_unsigned_apk_sha256,candidate_unsigned_apk_size:input.candidate_unsigned_apk_size,candidate_producer_job_id:input.candidate_producer_job_id})) script=script.replace(new RegExp(`assert\\.equal\\(m\\.${key}, [^;]+\\);`), `assert.equal(m.${key}, ${JSON.stringify(value)});`);
const jobsNames = ['Android arm64 unsigned candidate (NOT installable)', 'Build validated desktop bundle', 'Clean desktop appimage first start', 'Clean desktop deb first start', 'Clean desktop nsis first start', 'Clean macOS arm64 dmg first start', 'Clean macOS arm64 zip first start', 'Clean macOS x64 dmg first start', 'Clean macOS x64 zip first start', 'Desktop mac arm64 (integrity checked)', 'Desktop mac x64 (integrity checked)', 'Desktop win x64 (integrity checked)', 'Lint and typecheck', 'Linux x64 and embedded Windows WSL runtime', 'Mobile native static analysis', 'Rust native formatting and tests', 'Tests (clients)', 'Tests (server-1)', 'Tests (server-2)', 'Tests (server-3)', 'Tests (web)', 'Validate exact source'];
async function scenario(mode) {
 const writes = [];
 const apkName = 'T3-Code-zh-CN-Android-0.1.7-zh.1-arm64-v8a.apk';
 const apk = Buffer.from('PUBLIC MOCK BYTES - NOT AN APK');
 const jobs = jobsNames.map((name, i) => ({ id: 1000+i, name, run_id:input.candidate_run_id, run_attempt:input.candidate_attempt, head_sha:input.candidate_source_sha, head_branch:'maintenance/v0.1.7-zh-cloud', status:'completed', conclusion:'success', started_at:'2026-11-09T15:40:27Z', completed_at:'2026-11-09T16:07:59Z', steps:[] }));
 const android = jobs[0]; android.id=900003;
 android.steps = [{name:'Run actions/upload-artifact@v7', status:'completed', conclusion:'success', started_at:'2026-11-09T16:07:52Z', completed_at:'2026-11-09T16:07:56Z'}];
 const original = {...android, id:input.candidate_producer_job_id, run_attempt:1};
 const m = {...input, supplemental_coverage:{fixture:true}, enabled:true, source_sha:input.candidate_source_sha, candidate_artifact_sha256:input.candidate_artifact_zip_sha256, unsigned_apk_sha256:input.candidate_unsigned_apk_sha256, apk_signature_verified:true, certificate_sha256:'82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88', encrypted_container_sha256:'7e4922f7de02c1c739e627eb3ef87fa1fb639329ed27613dff8b4f0fdad2d397', package_name:'com.zhiweixiao.t3code.zhcn', version_name:'0.1.7-zh.1', version_code:1000414, recovery_run_id:40649758501, signed_apk_sha256:hash(apk), validated_release_jobs:jobs.map(x=>({...x}))};
 if(mode==='bad-hash') m.signed_apk_sha256='b'.repeat(64);
 if(mode==='wrong-source') m.source_sha='a'.repeat(40);
 if(mode==='wrong-tree') m.candidate_source_tree_sha='a'.repeat(40);
 if(mode==='wrong-apk') m.unsigned_apk_sha256='a'.repeat(64);
 if(mode==='wrong-cert') m.certificate_sha256='a'.repeat(64);
 if(mode==='disabled') m.enabled=false;
 if(mode==='changed-proof') m.validated_release_jobs[0].id=123;
 const mb=Buffer.from(JSON.stringify(m));
 const files = {[apkName]:apk, 'BUILD-PROVENANCE.json':mb, 'SHA256SUMS.txt':Buffer.from(`${hash(apk)}  ${apkName}\n${hash(mb)}  BUILD-PROVENANCE.json\n`)};
 if(mode==='extra-file') files['not-reviewed.txt']=Buffer.from('PUBLIC MOCK');
 const missing = () => Promise.reject(Object.assign(new Error('absent'), {status:404}));
 const assets=[]; let ownRelease; let created=false; let rechecks=0;
 const github={paginate:async()=>mode==='existing-draft'?[{tag_name:'android-v0.1.7-zh.1'}]:[], rest:{git:{
  getRef:async()=>{if(created)return{data:{object:{sha:m.source_sha}}};if(mode==='existing-tag')return{data:{}};return missing();},
  createRef:async x=>{assert.equal(x.sha,input.candidate_source_sha);assert.equal(x.ref,'refs/tags/android-v0.1.7-zh.1');writes.push('create-ref');created=true;}
 },repos:{getReleaseByTag:()=>mode==='existing-release'?Promise.resolve({}):missing(),listReleases:()=>{},
  createRelease:async x=>{assert.equal(x.draft,true);assert.equal(x.make_latest,'false');assert.equal(x.tag_name,'android-v0.1.7-zh.1');writes.push('draft');ownRelease={...x,id:1};return{data:{id:1}};},
  uploadReleaseAsset:async x=>{writes.push('upload');const a={id:100+assets.length,name:x.name,state:'uploaded',size:x.data.length,digest:'sha256:'+(mode==='bad-upload'?'c'.repeat(64):hash(x.data))};assets.push(a);return{data:a};},
  listReleaseAssets:async()=>({data:mode==='same-name-replacement'?assets.map(a=>({...a,id:a.id+100,size:1,digest:'sha256:'+'0'.repeat(64)})):assets}),
  getRelease:async()=>({data:{...ownRelease,...(mode==='release-tag-drift'?{tag_name:'other'}:{}),...(mode==='release-draft-drift'?{draft:false}:{}),...(mode==='release-target-drift'?{target_commitish:'f'.repeat(40)}:{})}}),
  updateRelease:async x=>{assert.equal(x.make_latest,'false');assert.equal(x.prerelease,false);assert.equal(x.draft,false);writes.push('publish');return{data:{draft:false,prerelease:false,html_url:'https://example.test/mock'}};}
 }}};
 const publicFetch=async url=>{const u=new URL(url);assert.equal(u.origin,'https://api.github.com');const p=u.pathname.replace('/repos/ZhiweiXiao98/t3code','');let data;
  if(p===''){rechecks++;data={private:mode==='private-repo'};}
  else if(p===`/actions/runs/${input.candidate_run_id}`)data={status:mode==='running'?'in_progress':'completed', conclusion:'success',run_attempt:mode==='later-attempt'?3:input.candidate_attempt,head_sha:input.candidate_source_sha,head_branch:'maintenance/v0.1.7-zh-cloud',path:'.github/workflows/client-release.yml',event:'push',head_commit:{tree_id:input.candidate_source_tree_sha},repository:{full_name:'ZhiweiXiao98/t3code'},head_repository:{full_name:'ZhiweiXiao98/t3code'}};
  else if(p.endsWith('/attempts/2/jobs')){let j=jobs.map(x=>({...x}));if(mode==='partial-gates')j=j.slice(0,15);if(mode==='duplicate-gate')j[1]=j[0];if(mode==='skipped-gate')j[1].conclusion='skipped';if(mode==='old-gate')j[1].run_attempt=99;if(mode==='changed-original')j[0].started_at='2026-11-10T00:55:23Z';if(mode==='later-gate-failure'&&rechecks===2)j[1].conclusion='failure';data={total_count:j.length,jobs:j};}
  else if(p.endsWith('/attempts/1/jobs')){const x={...original};if(mode==='changed-original')x.started_at='2026-11-10T00:55:23Z';data={total_count:1,jobs:[x]};}
  else if(p.startsWith('/git/ref/'))data={object:{sha:mode==='branch-moved'?'a'.repeat(40):input.candidate_source_sha}};
  else if(p==='/actions/artifacts/2')data={expired:mode==='signed-expired',expires_at:'2099-01-01T00:00:00Z',digest:'sha256:'+'d'.repeat(64),workflow_run:{id:999,head_sha:'e'.repeat(40)}};
  else if(p===`/actions/artifacts/${input.candidate_artifact_id}`)data={id:input.candidate_artifact_id,name:'android-UNSIGNED-NOT-INSTALLABLE',size_in_bytes:input.candidate_artifact_zip_size,expired:false,expires_at:'2099-01-01T00:00:00Z',digest:'sha256:'+input.candidate_artifact_zip_sha256,created_at:mode==='artifact-outside-job'?'2026-11-10T01:00:00Z':mode==='artifact-outside-upload'?'2026-11-09T16:07:57Z':'2026-11-09T16:07:55Z',updated_at:'2026-11-09T16:07:55Z',workflow_run:{id:input.candidate_run_id,head_sha:input.candidate_source_sha,head_branch:'maintenance/v0.1.7-zh-cloud'}};
  else if(p==='/actions/runs/40649758501')data={status:'completed',conclusion:mode==='recovery-failed'?'failure':'success',head_sha:'8fc8b21abd2380926242fc49e7f488cb4b3aa0b8'};
  else throw Error('Unexpected mocked URL '+p);
  return {ok:true,json:async()=>data};
 };
 const fsmock={readdirSync:()=>Object.keys(files),readFileSync:(p,encoding)=>{const b=files[p.replace('release-assets/','')];assert(b);return encoding?b.toString(encoding):b;}};
 let coverageChecks=0;
 const context={require:n=>n==='node:child_process'?{execFileSync:()=>{coverageChecks++;if(mode==='coverage-failed'||mode==='coverage-late-failed'&&coverageChecks===2)throw Error('Rejected supplemental evidence');return JSON.stringify(m.supplemental_coverage);}}:n==='node:fs'?fsmock:require(n),process:{env:{EXPECTED_SOURCE_SHA:input.candidate_source_sha,EXPECTED_CANDIDATE_RUN:String(input.candidate_run_id),SIGNED_ARTIFACT_ID:'2',SIGNED_ARTIFACT_DIGEST:'d'.repeat(64)}},github,fetch:publicFetch,context:{runId:999,sha:'e'.repeat(40)},core:{summary:{addLink:()=>{},write:async()=>{}}},Buffer};
 let failed=false;try{await new Function(...Object.keys(context),'return '+script)(...Object.values(context));}catch(e){failed=true;if(mode==='success-retained-artifact')throw e;}
 if(mode==='success-retained-artifact'){assert(!failed);assert(writes.includes('publish'));assert.equal(rechecks,2);}
 else {assert(failed,mode+' should fail');assert(!writes.includes('publish'));if(['bad-upload','later-gate-failure','coverage-late-failed','same-name-replacement','release-tag-drift','release-draft-drift','release-target-drift'].includes(mode))assert(writes.includes('draft'));else assert.equal(writes.length,0);}
 console.log('PASS publisher mock '+mode);
}
(async()=>{for(const mode of ['success-retained-artifact','bad-hash','wrong-source','wrong-tree','wrong-apk','wrong-cert','disabled','changed-proof','extra-file','existing-tag','existing-release','existing-draft','bad-upload','private-repo','running','later-attempt','partial-gates','duplicate-gate','skipped-gate','old-gate','later-gate-failure','changed-original','branch-moved','signed-expired','artifact-outside-job','artifact-outside-upload','recovery-failed','coverage-failed','coverage-late-failed','same-name-replacement','release-tag-drift','release-draft-drift','release-target-drift'])await scenario(mode);})().catch(e=>{console.error(e);process.exitCode=1;});

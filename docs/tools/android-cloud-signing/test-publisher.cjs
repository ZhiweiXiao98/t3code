// Offline mock fixtures only. No keys, signing programs, network or GitHub writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const stable=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
const script=fs.readFileSync(process.argv[2],'utf8');
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'retry-fixture.json'),'utf8'));
const originalThree=JSON.parse(fs.readFileSync(path.join(__dirname,'retry-fixture-attempt3.json'),'utf8'));
const gates=original.manifest.candidate_gates_snapshot.latest_jobs.map(j=>j.name);
async function scenario(mode){
 const threeAttempt=mode==='success-three'||mode.startsWith('three:');const isSuccess=mode==='success'||mode==='success-three';
 const data=structuredClone(threeAttempt?originalThree:original),m=data.manifest,routes=data.routes;
 const writes=[],assets=[],calls={};let created=false;
 const prefix=`/actions/runs/${m.candidate_run_id}`;
 const page=n=>routes[`${prefix}/attempts/${n}/jobs?per_page=100`];
 const apkName='T3-Code-zh-CN-Android-0.1.6-zh.1-arm64-v8a.apk',apk=Buffer.from('PUBLIC MOCK BYTES - NOT AN APK');
 Object.assign(m,{apk_signature_verified:true,certificate_sha256:'82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88',package_name:'com.zhiweixiao.t3code.zhcn',version_name:'0.1.6-zh.1',version_code:1000413,recovery_run_id:40649758501,signed_apk_sha256:hash(apk)});
 if(mode==='bad-hash')m.signed_apk_sha256='b'.repeat(64);
 if(mode==='wrong-certificate')m.certificate_sha256='b'.repeat(64);
 if(mode==='wrong-attempt')routes[prefix].run_attempt=3;
 if(mode==='branch-moved')routes['/git/ref/heads/maintenance/v0.1.6-zh-cloud'].object.sha='f'.repeat(40);
 if(mode==='workflow-bytes')routes[`/contents/.github/workflows/client-release.yml?ref=${m.source_sha}`].content=Buffer.from('FORGED WORKFLOW').toString('base64');
 if(mode==='wrong-workflow-id')routes[`${prefix}/attempts/1`].workflow_id=777;
 if(mode==='dispatch-not-reviewed')routes[prefix].event='workflow_dispatch';
 if(mode==='expired-candidate')routes['/actions/artifacts/1'].expired=true;
 if(mode==='timestamp-expired')routes['/actions/artifacts/1'].expires_at='2020-01-01T00:00:00Z';
 if(mode==='cross-run')routes['/actions/artifacts/1'].workflow_run.id=7;
 if(mode==='cross-sha')routes['/actions/artifacts/1'].workflow_run.head_sha='c'.repeat(40);
 if(mode==='artifact-wrong-id')routes['/actions/artifacts/1'].id=42;
 if(mode==='artifact-wrong-digest')routes['/actions/artifacts/1'].digest='sha256:'+'b'.repeat(64);
 if(mode==='artifact-size-changed')routes['/actions/artifacts/1'].size_in_bytes++;
 if(mode==='truncated-page')page(1).total_count++;
 if(mode==='duplicate-name')page(2).jobs[1].name=page(2).jobs[0].name;
 if(mode==='duplicate-jobid')page(2).jobs[0].id=page(1).jobs[0].id;
 if(mode==='job-attempt-confusion')page(2).jobs[0].run_attempt=1;
 if(mode==='job-cross-run')page(2).jobs[0].run_id=7;
 if(mode==='job-cross-sha')page(2).jobs[0].head_sha='f'.repeat(40);
 if(mode==='placeholder-forged')page(1).jobs.find(j=>j.name.includes('${{')).runner_id=42;
 if(mode==='placeholder-current'){
  const j=structuredClone(page(1).jobs.find(j=>j.name.includes('${{')));j.run_attempt=2;j.id=990;page(2).jobs.push(j);page(2).total_count++;
 }
 if(mode==='new-bundle-old-clean')page(1).jobs.find(j=>j.name==='Build validated desktop bundle').completed_at='2026-11-02T02:00:00Z';
 if(mode==='same-second-old-clean'){
  const j=page(2).jobs.find(j=>j.name==='Clean desktop nsis first start'),producer=page(2).jobs.find(j=>j.name==='Desktop mac arm64 (integrity checked)');
  page(2).jobs=page(2).jobs.filter(x=>x.id!==j.id);page(2).total_count--;j.run_attempt=1;j.started_at=producer.completed_at;page(1).jobs.push(j);page(1).total_count++;
 }
 if(mode==='producer-newer-than-reviewed'){
  const j=page(2).jobs.find(j=>j.name==='Android arm64 unsigned candidate (NOT installable)');j.started_at='2026-11-02T00:20:00Z';j.completed_at='2026-11-02T00:21:00Z';j.created_at=j.started_at;j.runner_group_id=0;
  for(const step of j.steps){step.started_at='2026-11-02T00:20:01Z';step.completed_at='2026-11-02T00:20:02Z';}
 }
 if(mode.startsWith('three:')){
  const which=mode.slice(6),previous=page(2).jobs.find(j=>j.name==='Android arm64 unsigned candidate (NOT installable)'),current=page(3).jobs.find(j=>j.name===previous.name);
  if(which==='missing-middle'){page(2).jobs=page(2).jobs.filter(j=>j.id!==previous.id);page(2).total_count--;}
  if(which==='failed-middle'){previous.conclusion='failure';previous.started_at='2026-11-02T00:20:00Z';previous.completed_at='2026-11-02T00:21:00Z';for(const st of previous.steps){st.started_at='2026-11-02T00:20:01Z';st.completed_at='2026-11-02T00:20:02Z';}}
  if(which==='wrong-root'){m.alias_log_proofs[m.alias_log_proofs.length-1].execution_job_id=999;m.alias_log_proofs_sha256=hash(stable(m.alias_log_proofs));}
  if(which==='conflicting-root-logs'){
   const alias=m.candidate_gates_snapshot.job_aliases.find(a=>a.job_name==='Validate exact source'&&a.alias_run_attempt===3);
   m.alias_log_proofs.find(row=>row.alias_job_id===alias.alias_job_id).log_sha256='f'.repeat(64);m.alias_log_proofs_sha256=hash(stable(m.alias_log_proofs));
  }
  if(which==='missing-proof'){m.alias_log_proofs.pop();m.alias_log_proofs_sha256=hash(stable(m.alias_log_proofs));}
  if(which==='null-original')page(1).jobs.find(j=>j.name===previous.name).runner_group_id=null;
  if(which==='missing-auth')m.candidate_retry_authorizations.pop();
  if(which==='missing-current'){page(3).jobs=page(3).jobs.filter(j=>j.id!==current.id);page(3).total_count--;}
  if(which==='latest-failure')current.conclusion='failure';
  if(which==='unknown-field')current.unknown=previous.unknown='same';
  if(which==='steps')current.steps[0].name='FORGED STEP';
 }
 if(mode.startsWith('alias:')){
  const which=mode.slice(6),j=page(2).jobs.find(j=>j.name==='Android arm64 unsigned candidate (NOT installable)'),previous=page(1).jobs.find(x=>x.name===j.name);
  if(which==='node-empty')j.node_id='';
  if(which==='node-reused')j.node_id=previous.node_id;
  if(which==='url')j.url=previous.url;
  if(which==='check-url')j.check_run_url=previous.check_run_url;
  if(which==='html-url')j.html_url=previous.html_url;
  if(which==='created-early')j.created_at=previous.created_at;
  if(which==='runner-group')j.runner_group_id=123;
  if(which==='bool-original-group')previous.runner_group_id=false;
  if(which==='steps')j.steps[0].name='FORGED SETUP';
  if(which==='runner')j.runner_id=999;
  if(which==='unknown-field')j.unknown='forged';
  if(which==='unknown-both')j.unknown=previous.unknown='same-unknown';
  if(which==='missing-current'){page(2).jobs=page(2).jobs.filter(x=>x.id!==j.id);page(2).total_count--;}
  if(which==='step-time-bypass'){j.started_at='2026-11-02T00:20:00Z';j.completed_at='2026-11-02T00:21:00Z';}
  if(which==='previous-failed')previous.conclusion='failure';
  if(which==='input-producer-alias'){m.candidate_producer_job_id=j.id;m.candidate_producer_attempt=2;}
 }
 if(mode.startsWith('alias-proof:')){
  const which=mode.slice(12);
  if(which==='missing')m.alias_log_proofs.pop();
  if(which==='id')m.alias_log_proofs[0].alias_job_id=999;
  if(which==='hash')m.alias_log_proofs[0].log_sha256='invalid';
  if(which==='producer'){m.alias_log_proofs.find(x=>x.execution_job_id===m.candidate_producer_job_id).log_sha256='f'.repeat(64);}
  m.alias_log_proofs_sha256=hash(stable(m.alias_log_proofs));
 }
 if(mode.startsWith('infra:')){
  const which=mode.slice(6),authorization=m.candidate_retry_authorizations[0],job=page(1).jobs.find(j=>j.id===authorization.job_id),annotations=routes['/check-runs/400/annotations?per_page=100'];
  if(which==='missing')m.candidate_retry_authorizations=[];
  if(which==='extra')m.candidate_retry_authorizations.push({...authorization,job_id:999});
  if(which==='job-hash')authorization.job_snapshot_sha256='f'.repeat(64);
  if(which==='annotation-hash')authorization.capacity_annotations_sha256='f'.repeat(64);
  if(which==='ordinary-failure'){job.conclusion='failure';authorization.job_snapshot_sha256=hash(stable(job));}
  if(which==='boolean-runner'){job.runner_id=false;authorization.job_snapshot_sha256=hash(stable(job));}
  if(which==='started-cancel'){job.runner_id=42;job.steps=[{}];authorization.job_snapshot_sha256=hash(stable(job));}
  if(which==='message'){annotations[0].message='Manual cancellation';authorization.capacity_annotations_sha256=hash(stable(annotations));}
  if(which==='cross-sha'){annotations[0].blob_href=annotations[0].blob_href.replace(m.source_sha,'f'.repeat(40));authorization.capacity_annotations_sha256=hash(stable(annotations));}
 }
 if(mode.startsWith('receipt:')){
  const field=mode.slice(8);m.producer_job_receipt[field]=typeof m.producer_job_receipt[field]==='number'?999:'forged';m.producer_job_receipt_sha256=hash(stable(m.producer_job_receipt));
 }
 if(mode==='receipt-chain-hash')m.producer_job_receipt_sha256='f'.repeat(64);
 if(mode==='snapshot-chain-hash')m.candidate_gates_sha256='f'.repeat(64);
 if(mode.startsWith('latest:')){
  const [_,index,state]=mode.split(':');const name=gates[Number(index)];let j=page(2).jobs.find(j=>j.name===name);
  if(!j){j=structuredClone(page(1).jobs.find(j=>j.name===name));j.id=990;j.run_attempt=2;page(2).jobs.push(j);page(2).total_count++;}
  j.status=['queued','in_progress'].includes(state)?state:'completed';j.conclusion=['queued','in_progress'].includes(state)?null:state;
 }
 if(mode.startsWith('missing:'))for(const n of [1,2]){page(n).jobs=page(n).jobs.filter(j=>j.name!==gates[Number(mode.slice(8))]);page(n).total_count=page(n).jobs.length;}
 const mb=Buffer.from(JSON.stringify(m));
 const files={[apkName]:apk,'BUILD-PROVENANCE.json':mb,'SHA256SUMS.txt':Buffer.from(`${hash(apk)}  ${apkName}\n${hash(mb)}  BUILD-PROVENANCE.json\n`)};
 const missing=()=>Promise.reject(Object.assign(new Error('absent'),{status:404}));
 const github={paginate:async()=>[],rest:{git:{getRef:async()=>{if(created)return{data:{object:{sha:mode==='tag-drift'?'f'.repeat(40):m.source_sha}}};if(mode==='existing')return{data:{}};return missing()},createRef:async x=>{assert.equal(x.sha,m.source_sha);writes.push('create-ref');created=true}},repos:{getReleaseByTag:missing,listReleases:()=>{},createRelease:async x=>{assert.equal(x.draft,true);assert.equal(x.make_latest,'false');writes.push('draft');return{data:{id:1}}},uploadReleaseAsset:async x=>{writes.push('upload');const a={id:assets.length+100,name:x.name,state:'uploaded',size:x.data.length,digest:'sha256:'+(mode==='bad-upload'?'c'.repeat(64):hash(x.data))};assets.push(a);return{data:a}},listReleaseAssets:async()=>({data:mode==='release-asset-replaced'?assets.map(a=>({...a,id:a.id+100})):assets}),updateRelease:async x=>{assert.equal(x.make_latest,'false');assert.equal(x.prerelease,false);assert.equal(x.draft,false);writes.push('publish');return{data:{draft:false,prerelease:false,html_url:'https://example.test/mock'}}}}}};
 const publicFetch=async(url,options)=>{
  assert.equal(options.redirect,'error');assert(!options.headers.Authorization);const u=new URL(url);assert.equal(u.origin,'https://api.github.com');const p=u.pathname.replace('/repos/ZhiweiXiao98/t3code','')+u.search;calls[p]=(calls[p]??0)+1;let result;
  if(p==='')result={private:false};
  else if(p==='/actions/artifacts/2')result={id:2,name:'android-signed-reviewed-999',expired:false,digest:'sha256:'+'d'.repeat(64),workflow_run:{id:999,head_sha:'e'.repeat(40)}};
  else if(p==='/actions/runs/40649758501')result={status:'completed',conclusion:mode==='recovery-failed'?'failure':'success',head_sha:'8fc8b21abd2380926242fc49e7f488cb4b3aa0b8',path:'.github/workflows/android-signing-recovery.yml',head_branch:'signing/android-bootstrap'};
  else{assert(routes[p],`Unexpected mocked URL ${p}`);result=structuredClone(routes[p]);}
  if(mode==='snapshot-race'&&p===prefix&&calls[p]===2)result.run_attempt=3;
  if(mode==='head-race'&&p.startsWith('/git/ref/')&&calls[p]===2)result.object.sha='f'.repeat(40);
  if(mode==='post-snapshot-race'&&writes.includes('draft')&&p===prefix)result.run_attempt=3;
  if(mode==='late-metadata-race'&&writes.includes('draft')&&p==='/actions/artifacts/1')routes[prefix].run_attempt=3;
  if(mode==='post-artifact-expired'&&writes.includes('draft')&&p==='/actions/artifacts/1')result.expired=true;
  return{ok:true,json:async()=>result};
 };
 const fsmock={readdirSync:()=>Object.keys(files),readFileSync:(p,enc)=>{const b=files[p.replace('release-assets/','')];assert(b);return enc?b.toString(enc):b}};
 const context={require:n=>n==='node:fs'?fsmock:require(n),process:{env:{EXPECTED_SOURCE_SHA:mode==='wrong-source'?'f'.repeat(40):m.source_sha,EXPECTED_CANDIDATE_RUN:String(m.candidate_run_id),SIGNED_ARTIFACT_ID:'2',SIGNED_ARTIFACT_DIGEST:'d'.repeat(64),SIGNED_MANIFEST_SHA256:mode==='independent-manifest-hash'?'f'.repeat(64):hash(mb)}},github,fetch:publicFetch,context:{runId:999,sha:'e'.repeat(40)},core:{summary:{addLink:()=>{},write:async()=>{}}},Buffer};
 let failed=false;try{await new Function(...Object.keys(context),'return '+script)(...Object.values(context));}catch(e){failed=true;if(isSuccess)throw e;}
 if(isSuccess){assert(!failed);assert(writes.includes('publish'));}
 else{assert(failed,`Expected rejection: ${mode}`);assert(!writes.includes('publish'));if(['bad-upload','tag-drift','post-snapshot-race','post-artifact-expired','late-metadata-race','release-asset-replaced'].includes(mode))assert(writes.includes('draft'));else assert.equal(writes.length,0,`Preflight writes: ${mode}`);}
 console.log('PASS publisher mock '+mode);
}
(async()=>{
 const modes=['success','success-three',...['missing-middle','failed-middle','wrong-root','conflicting-root-logs','missing-proof','null-original','missing-auth','missing-current','latest-failure','unknown-field','steps'].map(x=>'three:'+x),'independent-manifest-hash','bad-hash','existing','bad-upload','wrong-certificate','wrong-source','wrong-attempt','branch-moved','workflow-bytes','wrong-workflow-id','dispatch-not-reviewed','expired-candidate','timestamp-expired','cross-run','cross-sha','artifact-wrong-id','artifact-wrong-digest','artifact-size-changed','truncated-page','duplicate-name','duplicate-jobid','job-attempt-confusion','job-cross-run','job-cross-sha','placeholder-forged','placeholder-current','new-bundle-old-clean','same-second-old-clean','producer-newer-than-reviewed','receipt-chain-hash','snapshot-chain-hash','snapshot-race','head-race','tag-drift','post-snapshot-race','post-artifact-expired','late-metadata-race','release-asset-replaced','recovery-failed',...['node-empty','node-reused','url','check-url','html-url','created-early','runner-group','bool-original-group','steps','runner','unknown-field','unknown-both','missing-current','step-time-bypass','previous-failed','input-producer-alias'].map(x=>'alias:'+x),...['missing','id','hash','producer'].map(x=>'alias-proof:'+x),...['missing','extra','job-hash','annotation-hash','ordinary-failure','started-cancel','boolean-runner','message','cross-sha'].map(x=>'infra:'+x),...['run_id','run_attempt','job_id','job_name','step_number','step_name','step_started_at','step_completed_at','log_sha256','artifact_id','artifact_name','artifact_digest','artifact_size_in_bytes','upload_action_ref','upload_action_sha'].map(x=>'receipt:'+x),...gates.flatMap((_,i)=>['failure','cancelled','skipped','queued','in_progress'].map(s=>`latest:${i}:${s}`)),...gates.map((_,i)=>`missing:${i}`)];
 for(const mode of modes)await scenario(mode);
 console.log(`TOTAL ${modes.length} publisher mock scenarios`);
})().catch(e=>{console.error(e);process.exitCode=1});

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const fileHash=files=>createHash('sha256').update(JSON.stringify(files)).digest('hex');
export function partitionFiles(files, index) {assert(Number.isInteger(index)&&index>=0&&index<4);return files.filter((_,i)=>i%4===index);}
export function verifyPartitions(ctx, receipts) {
  assert.equal(ctx.files.length,330);assert.equal(new Set(ctx.files).size,330);assert.deepEqual([...ctx.files].sort(),ctx.files);assert.equal(fileHash(ctx.files),ctx.reviewedFilesSha256);
  assert.equal(receipts.length,4);assert.deepEqual(receipts.map(x=>x.index),[0,1,2,3]);
  const all=[], cases=[];let total=0, qualified=0;
  for(const r of receipts){
    for(const k of ['sourceSha','sourceTree','operationSha','runId','runAttempt','reviewedFilesSha256'])assert.equal(r[k],ctx[k],k);
    const selected=partitionFiles(ctx.files,r.index);assert(selected.length>0);assert.deepEqual(r.files,selected);
    assert.equal(r.unitCode,0);assert.equal(r.observerCode,0);
    assert.equal(r.verdict.success,true);assert.equal(r.verdict.independentlyVerified,true);assert.equal(r.verdict.sourceSha,ctx.sourceSha);
    assert.equal(r.exit.sourceSha,ctx.sourceSha);assert.equal(r.exit.code,0);assert.equal(r.exit.signal,null);assert.equal(r.exit.timedOut,false);assert(!r.exit.spawnError);
    const p=r.progress;assert.equal(p.schema,'v019-vitest-incremental-1');assert.equal(p.sourceSha,ctx.sourceSha);assert.equal(p.runId,String(ctx.runId));assert.equal(p.runAttempt,ctx.runAttempt);
    assert.equal(p.reviewedFilesSha256,fileHash(selected));assert.equal(p.selectedFilesSha256,fileHash(selected));assert.equal(p.subsetId,'full-reviewed');assert.equal(p.scope,'reviewed-set');assert.equal(p.selectedCount,selected.length);assert.equal(p.reviewedCount,selected.length);
    assert.equal(p.integrityError,null);assert.equal(p.countsComplete,true);assert.equal(p.unhandledErrorCount,0);assert.equal(p.runEndReason,'passed');
    for(const k of ['missing','inFlight','failedModules'])assert.deepEqual(p[k],[]);
    assert.deepEqual(p.files.map(x=>x.file).sort(),selected);assert(p.files.every(x=>x.ended&&x.moduleState==='passed'&&x.moduleErrorCount===0));
    for(const k of ['failed','skipped','pending','todo'])assert.equal(p.observedCounts[k],0);
    assert.deepEqual(r.summary.files,selected);assert.equal(r.summary.sourceSha,ctx.sourceSha);assert.equal(r.summary.success,true);assert.equal(r.summary.incrementalCountsMatched,true);
    assert.equal(r.summary.totalTests,r.summary.passedTests);assert.equal(r.summary.passedTests,p.observedCounts.passed);assert(r.summary.passedTests>0);
    for(const k of ['skippedTests','todoTests','unfinishedTests'])assert.equal(r.summary[k],0);
    assert.equal(r.cases.sourceSha,ctx.sourceSha);assert.deepEqual(r.cases.modules.map(m=>m.file),selected);
    let n=0;
    for(const m of r.cases.modules){assert(m.assertions.length>0);const row=p.files.find(x=>x.file===m.file);assert.equal(row.counts.passed,m.assertions.length);for(const k of ['failed','skipped','pending','todo'])assert.equal(row.counts[k],0);for(const t of m.assertions){assert.equal(t.status,'passed');assert.equal(typeof t.fullName,'string');assert(t.fullName.length>0);cases.push({file:m.file,fullName:t.fullName});n++;}}
    assert.equal(n,r.summary.passedTests);
    const o=r.observer;for(const k of ['sourceSha','sourceTree','operationSha','runId','runAttempt'])assert.equal(o[k],ctx[k]);assert.equal(o.success,true);assert(o.counts.qualified>0);assert(o.module_identity.qualified===true);qualified+=o.counts.qualified;
    all.push(...selected);total+=n;
  }
  assert.deepEqual([...all].sort(),ctx.files);assert.equal(new Set(all).size,330);
  return {schema:'v019-partition-union-1',...ctx,success:true,files:[...all].sort(),partitions:4,totalTests:total,passedTests:total,skippedTests:0,todoTests:0,unfinishedTests:0,qualifiedObserverSnapshots:qualified,cases,scope:'Four fresh Vitest processes; exact full 330-file union. Scenario/Toast/native gates remain separate.'};
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/early-hook.cjs', 'utf8');
function fixture({ready=false, windows=0, initialUpload=false, finalUpload=false}={}) {
  let started=false;const calls=[];
  const electron={
    app:{isReady:()=>ready,setPath:(...args)=>calls.push(['setPath',...args])},
    BrowserWindow:{getAllWindows:()=>Array(windows)},
    crashReporter:{getUploadToServer:()=>started?finalUpload:initialUpload,
      start:options=>{calls.push(['start',options]);started=true;}}
  };
  return {calls,run:()=>vm.runInNewContext(source,{process:{pid:123},require:name=>{
    if(name==='electron')return electron;
    if(name==='node:fs')return {mkdirSync:(...args)=>calls.push(['mkdir',...args])};
    throw new Error('Unexpected dependency');
  }})};
}
const good=fixture();assert.equal(good.run().localOnly,true);
assert.deepEqual(good.calls.map(c=>c[0]),['mkdir','setPath','start']);
const options=good.calls[2][1];assert.equal(options.uploadToServer,false);
assert.equal(options.ignoreSystemCrashHandler,false);assert.equal('submitURL' in options,false);
for(const config of [{ready:true},{windows:1},{initialUpload:true}]) {
  const f=fixture(config);assert.throws(f.run);assert.equal(f.calls.length,0);
}
assert.throws(fixture({finalUpload:true}).run);
console.log('5 early-hook fixture cases passed; no Electron/app execution; real early Runtime require remains to validate');

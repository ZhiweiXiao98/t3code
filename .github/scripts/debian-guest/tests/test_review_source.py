"""Exercise the actual inline full-candidate source guard without network access."""
import json
from pathlib import Path
import subprocess
import unittest


class ReviewSourceTests(unittest.TestCase):
    def test_actual_workflow_guard(self):
        workflow = Path(__file__).resolve().parents[3] / 'workflows/client-release.yml'
        text = workflow.read_text()
        source = text.split('          script: |\n', 1)[1].split('  quality:\n', 1)[0]
        script = '\n'.join(line[12:] for line in source.splitlines())
        harness = r'''
const script = JSON.parse(process.argv[1]);
const run = new (Object.getPrototypeOf(async function(){}).constructor)('context','github','core','process',script);
const copy = x => JSON.parse(JSON.stringify(x));
const sha = 'a'.repeat(40);
const context = {repo:{owner:'ZhiweiXiao98',repo:'t3code'},payload:{repository:{private:false}},ref:'refs/heads/review/v0.1.10-zh',eventName:'push',sha};
const pr = {state:'open',merged:false,head:{repo:{full_name:'ZhiweiXiao98/t3code'},ref:'review/v0.1.10-zh',sha},base:{repo:{full_name:'ZhiweiXiao98/t3code'},ref:'maintenance/v0.1.9-zh-cloud',sha:'74039745b1b44834c30dd9cb275f1c224072dd96'}};
let checked=0;
async function check(mut,ok){
 const c=copy(context),p=copy(pr),env={EXPECTED_SHA:sha},out={};mut(c,p,env);
 let queries=0,passed=true;
 try{await run(c,{rest:{pulls:{get:async q=>{queries++;if(q.pull_number!==2||q.owner!=='ZhiweiXiao98'||q.repo!=='t3code')throw Error('Wrong PR');return {data:p};}}}},{setOutput:(k,v)=>{out[k]=v},summary:{addRaw:()=>{},write:async()=>{}}},{env});}catch{passed=false;}
 if(passed!==ok || (ok && out.sha!==sha))throw Error('Guard result mismatch '+checked);
 if(ok && c.ref.includes('/review/') && queries!==1)throw Error('Missing exact PR query');
 checked++;
}
await check(()=>{},true);
await check(c=>{c.eventName='workflow_dispatch'},true);
await check(c=>{c.ref='refs/heads/maintenance/v0.1.10-zh-cloud'},true);
await check(c=>{c.ref='refs/heads/maintenance/v0.1.10-zh-cloud';c.eventName='workflow_dispatch'},true);
for(const mutate of [
 c=>{c.repo.owner='other'},c=>{c.payload.repository.private=true},c=>{c.ref='refs/heads/other'},c=>{c.eventName='pull_request'},
 (c,p,e)=>{c.eventName='workflow_dispatch';e.EXPECTED_SHA='b'.repeat(40)},
 (c,p)=>{p.state='closed'},(c,p)=>{p.merged=true},(c,p)=>{p.head.repo.full_name='other/t3code'},
 (c,p)=>{p.head.ref='other'},(c,p)=>{p.head.sha='b'.repeat(40)},(c,p)=>{p.base.ref='main'},
 (c,p)=>{p.base.sha='b'.repeat(40)},(c,p)=>{p.base.repo.full_name='other/t3code'}
])await check(mutate,false);
console.log(JSON.stringify({checked}));
'''
        result = subprocess.run(['node', '--input-type=module', '-e', harness, json.dumps(script)],
                                text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(result.stdout)['checked'], 17)


if __name__ == '__main__':
    unittest.main()

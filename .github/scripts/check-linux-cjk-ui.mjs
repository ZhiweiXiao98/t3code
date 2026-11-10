import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const {values}=parseArgs({options:{executable:{type:'string'},asset:{type:'string'},kind:{type:'string'},'playwright-module':{type:'string'},'artifacts-dir':{type:'string'}}});
for(const key of ['executable','asset','kind','playwright-module','artifacts-dir'])assert.ok(values[key],key);
assert.ok(['deb','appimage'].includes(values.kind));assert.equal(process.platform,'linux');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.getuid()===0,false);
const digest=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const expected={deb:'1b9713cc9d9da734392df8aba0d444d129e0db19fc8cc07a65ebfd5b94063dbe',appimage:'769eddb1bc03c5e1895d372eaf4e0307bc4001394b4b005181b9da0f10d9c284'};
assert.equal(digest(fs.readFileSync(values.asset)),expected[values.kind]);
const {_electron}=await import(pathToFileURL(values['playwright-module']).href);
const artifacts=path.resolve(values['artifacts-dir']);fs.mkdirSync(artifacts,{recursive:true});
const home=fs.mkdtempSync(path.join(os.tmpdir(),'t3-cjk-check-'));const t3Home=path.join(home,'t3');
assert.equal(fs.existsSync(t3Home),false);
const report={schema_version:1,evidence_type:'linux-chinese-ui',passed:false,kind:values.kind,source:{sha:'98ac4dc26fa013c008c3c5afd8012a60cb1d9135',tree:'acdf2b80d00fb3404432f314be0a4a9e4904330f',branch:'maintenance/v0.1.7-zh-cloud'},baseline:{run_id:42740589754,run_attempt:2},operation:{sha:process.env.GITHUB_SHA,branch:process.env.GITHUB_REF_NAME,run_id:Number(process.env.GITHUB_RUN_ID),run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT)},asset:{name:path.basename(values.asset),sha256:expected[values.kind],size:fs.statSync(values.asset).size,artifact_id:13729387369,original_producer_attempt:1},driver_sha256:digest(fs.readFileSync(new URL(import.meta.url))),playwright_version:'1.60.0',profile:{home,t3Home,initially_empty:true,restart_reuses_same_profile:true},font_environment:JSON.parse(fs.readFileSync(path.join(artifacts,'font-evidence.json'),'utf8')),sessions:[],screenshots:[],scope:'Unchanged original installer, official Ubuntu CJK fonts, actual UI language selection and persisted restart. Does not establish original runner font absence or fix systems without CJK fonts.'};
let app,page;
async function screenshot(name){const file=path.join(artifacts,name);await page.screenshot({path:file,animations:'disabled'});report.screenshots.push({name,sha256:digest(fs.readFileSync(file)),size:fs.statSync(file).size});}
async function launch(){
 const session={page_errors:[],console_errors:[]};report.sessions.push(session);
 app=await _electron.launch({executablePath:path.resolve(values.executable),chromiumSandbox:true,args:[`--user-data-dir=${path.join(home,'electron-profile')}`],env:{...process.env,T3CODE_HOME:t3Home,XDG_CONFIG_HOME:path.join(home,'config'),XDG_DATA_HOME:path.join(home,'data'),T3CODE_TELEMETRY_ENABLED:'false',T3CODE_DISABLE_AUTO_UPDATE:'true'},timeout:60000});
 session.spawn_args=app.process().spawnargs;session.requested_chromium_sandbox=true;
 assert.ok(!session.spawn_args.some(a=>/--(?:no-sandbox|disable-setuid-sandbox|appimage-extract)/.test(a)));
 session.packaged=await app.evaluate(({app})=>({isPackaged:app.isPackaged,userData:app.getPath('userData'),version:app.getVersion(),noSandbox:app.commandLine.hasSwitch('no-sandbox')}));
 assert.equal(session.packaged.isPackaged,true);assert.equal(session.packaged.noSandbox,false);
 const rel=path.relative(fs.realpathSync(home),fs.realpathSync(session.packaged.userData));assert.ok(rel&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel));
 page=await app.firstWindow({timeout:60000});page.on('pageerror',e=>session.page_errors.push(e.message));page.on('console',m=>{if(m.type()==='error')session.console_errors.push(m.text());});
 await page.waitForURL(/^(?:t3code:\/\/app\/|https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/)/,{timeout:60000});
 await page.getByRole('dialog').first().waitFor({state:'visible',timeout:60000});
 session.url=page.url();return session;
}
async function actualFonts(text){
 const cdp=await page.context().newCDPSession(page);try{
  await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});let parentId;
  function visit(node){for(const child of node.children||[]){if(child.nodeType===3&&child.nodeValue.trim()===text)parentId=node.nodeId;visit(child);}for(const shadow of node.shadowRoots||[])visit(shadow);}
  visit(root);assert.ok(parentId,'Visible Chinese text missing from CDP DOM');
  const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:parentId});
  const requiredGlyphs=Array.from(text).filter(c=>/\p{Script=Han}/u.test(c)).length;
  const cjkGlyphs=fonts.filter(f=>/Noto.*CJK/i.test(f.familyName)).reduce((sum,f)=>sum+f.glyphCount,0);
  assert.ok(requiredGlyphs>0&&cjkGlyphs>=requiredGlyphs,'Chinese label did not render all Han glyphs using installed Noto CJK');
  return {text,fonts};
 }finally{await cdp.detach();}
}
async function assertChinese(session){
 await page.waitForFunction(()=>document.documentElement.lang==='zh-CN',null,{timeout:30000});
 for(const text of ['设置 T3 Code','连接你的设备','要设置的设备','添加设备'])await page.getByText(text,{exact:true}).first().waitFor({state:'visible',timeout:30000});
 await page.getByRole('combobox',{name:'应用语言',exact:true}).waitFor({state:'visible'});
 assert.equal((await page.getByRole('combobox',{name:'应用语言',exact:true}).innerText()).trim(),'简体中文');
 await page.getByRole('button',{name:'继续',exact:true}).waitFor({state:'visible'});
 session.locale=await page.locator('html').getAttribute('lang');session.body_text=await page.locator('body').innerText();
 assert.ok(!/could not start|failed to start the server|无法启动服务器/i.test(session.body_text));
 session.rendered_chinese_fonts=await actualFonts('连接你的设备');assert.deepEqual(session.page_errors,[]);
 assert.ok(!session.console_errors.some(x=>/client.settings.*persist failed|could not start|无法启动/i.test(x)));
}
async function close(){const active=app;let timer;try{await Promise.race([active.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Graceful application shutdown did not finish')),10000);})]);app=null;page=null;}finally{clearTimeout(timer);}}
try{
 const first=await launch();await page.getByRole('combobox',{name:'App language',exact:true}).waitFor({state:'visible',timeout:30000});
 await screenshot('01-fonts-installed-english.png');
 await page.getByRole('combobox',{name:'App language',exact:true}).click();
 await page.getByRole('option',{name:'简体中文',exact:true}).click();
 await assertChinese(first);await screenshot('02-chinese-selected.png');
 await close();
 const restarted=await launch();await assertChinese(restarted);await screenshot('03-chinese-after-restart.png');
 assert.equal(restarted.packaged.userData,first.packaged.userData);report.language_selection='actual combobox and option clicks';report.persisted_restart=true;
 await close();assert.equal(digest(fs.readFileSync(values.asset)),expected[values.kind]);report.passed=true;
}catch(error){report.error=String(error);process.exitCode=1;if(page)await screenshot('failure.png').catch(()=>{});}
finally{
 if(app){const child=app.process();const timer=setTimeout(()=>child.kill('SIGKILL'),10000);timer.unref();await app.close().catch(()=>{});clearTimeout(timer);}
 fs.writeFileSync(path.join(artifacts,'linux-chinese-ui.json'),JSON.stringify(report,null,2));
}

// DISABLED PROPOSAL. Requires reviewed exact input manifest and explicit activation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const {values}=parseArgs({options:{manifest:{type:'string'},executable:{type:'string'},asset:{type:'string'},kind:{type:'string'},'playwright-module':{type:'string'},'artifacts-dir':{type:'string'}}});
for(const key of ['manifest','executable','asset','kind','playwright-module','artifacts-dir'])assert.ok(values[key],key);
assert.ok(['deb','appimage'].includes(values.kind));assert.equal(process.platform,'linux');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.getuid()===0,false);
const digest=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(values.kind,'appimage');
const manifest=JSON.parse(fs.readFileSync(values.manifest,'utf8'));
for(const key of ['sourceSha','sourceTree'])assert.match(manifest[key],/^[0-9a-f]{40}$/);
for(const key of ['appimageSha256','cjkDriverSha256','playwrightTreeSha256'])assert.match(manifest[key],/^[0-9a-f]{64}$/);
for(const key of ['producerRunId','producerRunAttempt','artifactId'])assert.ok(Number.isSafeInteger(manifest[key])&&manifest[key]>0);
assert.equal(manifest.playwrightVersion,'1.60.0');
const approvedPrivacyClauses={"To read more about how your data is used, see our": "如需了解数据的使用方式，请参阅我们的", "To read more about how your data is used and how to opt out, see our": "如需了解数据的使用方式以及如何退出，请参阅我们的"};
assert.deepEqual(manifest.privacyClauses,approvedPrivacyClauses);
const expected={appimage:manifest.appimageSha256};
assert.equal(digest(fs.readFileSync(values.asset)),expected.appimage);
assert.equal(fs.realpathSync(values.asset),fs.realpathSync(values.executable));
assert.equal(digest(fs.readFileSync(new URL(import.meta.url))),manifest.cjkDriverSha256);
const distro=Object.fromEntries(fs.readFileSync('/etc/os-release','utf8').split('\n').filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1).replace(/^"|"$/g,'')];}));
assert.equal(distro.ID,'debian');assert.equal(distro.VERSION_ID,'13');
const {_electron}=await import(pathToFileURL(values['playwright-module']).href);
const artifacts=path.resolve(values['artifacts-dir']);fs.mkdirSync(artifacts,{recursive:true});
const home=fs.mkdtempSync(path.join(os.tmpdir(),'t3-cjk-check-'));const t3Home=path.join(home,'t3');
assert.equal(fs.existsSync(t3Home),false);
const report={schema_version:2,evidence_type:'debian13-guest-chinese-ui',passed:false,kind:'appimage',source:{sha:manifest.sourceSha,tree:manifest.sourceTree},producer:{run_id:manifest.producerRunId,run_attempt:manifest.producerRunAttempt,artifact_id:manifest.artifactId},asset:{name:path.basename(values.asset),sha256:expected.appimage,size:fs.statSync(values.asset).size},driver_sha256:digest(fs.readFileSync(new URL(import.meta.url))),playwright_version:manifest.playwrightVersion,environment:{distro,kernel:execFileSync('uname',['-r'],{encoding:'utf8'}).trim(),uid:process.getuid()},profile:{home,t3Home,initially_empty:true,restart_reuses_same_profile:true},font_environment:JSON.parse(fs.readFileSync(path.join(artifacts,'font-evidence.json'),'utf8')),sessions:[],screenshots:[],scope:'Manifest-bound repaired AppImage in Debian13 guest with distro Noto CJK fonts; real language selection and persisted restart. Not Ubuntu success, not no-font coverage, not a release approval.'};
let app,page;
async function screenshot(name){const file=path.join(artifacts,name);await page.screenshot({path:file,animations:'disabled'});report.screenshots.push({name,sha256:digest(fs.readFileSync(file)),size:fs.statSync(file).size});}
async function launch(){
 const session={page_errors:[],console_errors:[]};report.sessions.push(session);
 app=await _electron.launch({executablePath:path.resolve(values.executable),chromiumSandbox:true,args:[`--user-data-dir=${path.join(home,'electron-profile')}`],env:{...process.env,T3CODE_HOME:t3Home,XDG_CONFIG_HOME:path.join(home,'config'),XDG_DATA_HOME:path.join(home,'data'),T3CODE_TELEMETRY_ENABLED:'false',T3CODE_DISABLE_AUTO_UPDATE:'true'},timeout:60000});
 session.spawn_args=app.process().spawnargs;session.requested_chromium_sandbox=true;
 assert.ok(!session.spawn_args.some(a=>/--(?:no-sandbox|disable-setuid-sandbox|disable-seccomp-filter-sandbox|disable-gpu-sandbox|appimage-extract)/.test(a)));
 session.packaged=await app.evaluate(({app})=>({isPackaged:app.isPackaged,userData:app.getPath('userData'),version:app.getVersion(),noSandbox:app.commandLine.hasSwitch('no-sandbox')}));
 assert.equal(session.packaged.isPackaged,true);assert.equal(session.packaged.noSandbox,false);
 session.effectiveSandbox={switches:await app.evaluate(({app})=>Object.fromEntries(['no-sandbox','disable-setuid-sandbox','disable-seccomp-filter-sandbox','disable-gpu-sandbox'].map(key=>[key,app.commandLine.hasSwitch(key)])))};
 assert.ok(Object.values(session.effectiveSandbox.switches).every(value=>value===false));
 const rel=path.relative(fs.realpathSync(home),fs.realpathSync(session.packaged.userData));assert.ok(rel&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel));
 page=await app.firstWindow({timeout:60000});page.on('pageerror',e=>session.page_errors.push(e.message));page.on('console',m=>{if(m.type()==='error')session.console_errors.push(m.text());});
 await page.waitForURL(/^(?:t3code:\/\/app\/|https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/)/,{timeout:60000});
 await page.getByRole('dialog').first().waitFor({state:'visible',timeout:60000});
 await observeSandbox(session);
 await page.getByRole('dialog').first().waitFor({state:'visible',timeout:60000});
 session.url=page.url();return session;
}
async function observeSandbox(session){
 const report=session; const NodeAssert=assert; const NodeCrypto=crypto;
  const browserWindow = await app.browserWindow(page);
  try {
    report.effectiveSandbox.preferences = await browserWindow.evaluate((window) => {
      const preferences = window.webContents.getLastWebPreferences();
      return {
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration,
      };
    });
    NodeAssert.deepEqual(report.effectiveSandbox.preferences, {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    // Sandboxed preload exposes process lexically, not as a world-999 global.
    // Pause the existing packaged preload at its own process.platform read.
    // This observes the unmodified preload frame; it adds no preload or settings.
    const cdp = await page.context().newCDPSession(page);
    const scripts = [];
    cdp.on("Debugger.scriptParsed", (script) => scripts.push(script));
    let breakpoint;
    let timer;
    try {
      await cdp.send("Debugger.enable");
      const preloads = scripts.filter((script) =>
        /(?:^|[\\/])preload\.(?:js|cjs|mjs)$/.test(script.url),
      );
      report.rendererProbe = {
        method: "CDP existing preload lexical scope",
        reloadSameFreshProfile: true,
        preloadScripts: preloads.map(({ url }) => url),
      };
      NodeAssert.equal(preloads.length, 1, "Expected one actual packaged preload script");
      const preload = preloads[0];
      const { scriptSource } = await cdp.send("Debugger.getScriptSource", {
        scriptId: preload.scriptId,
      });
      const match = /\bprocess\.platform\b/.exec(scriptSource);
      NodeAssert.ok(match, "Packaged preload must contain an existing process.platform read");
      const before = scriptSource.slice(0, match.index);
      const lineNumber = before.split("\n").length - 1;
      const columnNumber = before.length - (before.lastIndexOf("\n") + 1);
      report.rendererProbe.preloadSha256 = NodeCrypto.createHash("sha256")
        .update(scriptSource)
        .digest("hex");
      report.rendererProbe.breakpoint = { lineNumber, columnNumber };
      const installed = await cdp.send("Debugger.setBreakpointByUrl", {
        url: preload.url,
        lineNumber,
        columnNumber,
      });
      breakpoint = installed.breakpointId;
      const observed = new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Existing preload sandbox observation timed out")),
          30_000,
        );
        cdp.once("Debugger.paused", async (event) => {
          try {
            NodeAssert.ok(event.hitBreakpoints.includes(breakpoint), "Unexpected debugger pause");
            const frame = event.callFrames[0];
            NodeAssert.ok(frame, "Missing existing preload frame");
            const result = await cdp.send("Debugger.evaluateOnCallFrame", {
              callFrameId: frame.callFrameId,
              expression: `({
                processType: typeof process === "object" ? process.type : null,
                sandboxed: typeof process === "object" && typeof process.sandboxed === "boolean" ? process.sandboxed : null,
                contextIsolated: typeof process === "object" && typeof process.contextIsolated === "boolean" ? process.contextIsolated : null
              })`,
              returnByValue: true,
              throwOnSideEffect: true,
            });
            NodeAssert.equal(
              result.exceptionDetails,
              undefined,
              "Read-only renderer observation failed",
            );
            resolve(result.result.value);
          } catch (error) {
            reject(error);
          } finally {
            await cdp
              .send("Debugger.removeBreakpoint", { breakpointId: breakpoint })
              .catch(() => {});
            breakpoint = undefined;
            await cdp.send("Debugger.resume").catch(() => {});
          }
        });
      });
      const [renderer] = await Promise.all([
        observed,
        page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 }),
      ]);
      report.effectiveSandbox.renderer = renderer;
    } finally {
      clearTimeout(timer);
      if (breakpoint)
        await cdp.send("Debugger.removeBreakpoint", { breakpointId: breakpoint }).catch(() => {});
      await cdp.send("Debugger.resume").catch(() => {});
      await cdp.detach();
    }
    NodeAssert.deepEqual(report.effectiveSandbox.renderer, {
      processType: "renderer",
      sandboxed: true,
      contextIsolated: true,
    });
  } finally {
    await browserWindow.dispose();
  }
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
 const observation=report.privacy_observation;assert.ok(observation?.observed_before_language_selection);
 const expectedPrivacy=approvedPrivacyClauses[observation.source_clause];
 assert.equal(expectedPrivacy,observation.expected_translation);
 await page.getByRole('dialog').locator('p').filter({hasText:expectedPrivacy}).first().waitFor({state:'visible',timeout:30000});
 session.privacy_clause={source:observation.source_clause,expected:expectedPrivacy,visible:true};
 session.locale=await page.locator('html').getAttribute('lang');session.body_text=await page.locator('body').innerText();
 assert.ok(!/could not start|failed to start the server|无法启动服务器/i.test(session.body_text));
 for(const source of Object.keys(approvedPrivacyClauses))assert.ok(!session.body_text.includes(source),'Untranslated onboarding privacy clause');
 for(const translation of Object.values(approvedPrivacyClauses))if(translation!==expectedPrivacy)assert.ok(!session.body_text.includes(translation),'Privacy clause variant changed');
 session.rendered_chinese_fonts=await actualFonts('连接你的设备');assert.deepEqual(session.page_errors,[]);
 assert.ok(!session.console_errors.some(x=>/client.settings.*persist failed|could not start|无法启动/i.test(x)));
}
async function close(){const active=app;let timer;try{await Promise.race([active.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Graceful application shutdown did not finish')),10000);})]);app=null;page=null;}finally{clearTimeout(timer);}}
try{
 const first=await launch();await page.getByRole('combobox',{name:'App language',exact:true}).waitFor({state:'visible',timeout:30000});
 const englishDialogText=await page.getByRole('dialog').innerText();
 const observedSources=Object.keys(approvedPrivacyClauses).filter(source=>englishDialogText.includes(source));
 assert.equal(observedSources.length,1,'Expected exactly one approved English privacy clause before language selection');
 const observedSource=observedSources[0];
 const privacyParagraph=page.getByRole('dialog').locator('p').filter({hasText:observedSource});
 assert.equal(await privacyParagraph.count(),1,'Expected one actual privacy paragraph');
 await privacyParagraph.waitFor({state:'visible',timeout:30000});
 report.privacy_observation={source_clause:observedSource,expected_translation:approvedPrivacyClauses[observedSource],observed_before_language_selection:true,visible:true,english_paragraph:await privacyParagraph.innerText()};
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

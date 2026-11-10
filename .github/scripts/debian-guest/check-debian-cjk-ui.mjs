// DISABLED PROPOSAL. Requires reviewed exact input manifest and explicit activation.
import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
const { values } = NodeUtil.parseArgs({
  options: {
    manifest: { type: "string" },
    executable: { type: "string" },
    asset: { type: "string" },
    kind: { type: "string" },
    "playwright-module": { type: "string" },
    "artifacts-dir": { type: "string" },
  },
});
for (const key of ["manifest", "executable", "asset", "kind", "playwright-module", "artifacts-dir"])
  NodeAssert.ok(values[key], key);
NodeAssert.ok(["deb", "appimage"].includes(values.kind));
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone acceptance driver observes the actual guest/native runtime without importing application code.
NodeAssert.equal(process.platform, "linux");
NodeAssert.equal(process.env.GITHUB_ACTIONS, "true");
NodeAssert.equal(process.getuid() === 0, false);
const digest = (bytes) => NodeCrypto.createHash("sha256").update(bytes).digest("hex");
NodeAssert.equal(values.kind, JSON.parse(NodeFS.readFileSync(values.manifest, "utf8")).kind);
const manifest = JSON.parse(NodeFS.readFileSync(values.manifest, "utf8"));
for (const key of ["sourceSha", "sourceTree"]) NodeAssert.match(manifest[key], /^[0-9a-f]{40}$/);
for (const key of [
  "installerSha256",
  "executableSha256",
  "cjkDriverSha256",
  "playwrightTreeSha256",
])
  NodeAssert.match(manifest[key], /^[0-9a-f]{64}$/);
for (const key of ["producerRunId", "producerRunAttempt", "artifactId"])
  NodeAssert.ok(Number.isSafeInteger(manifest[key]) && manifest[key] > 0);
NodeAssert.equal(manifest.playwrightVersion, "1.60.0");
const approvedPrivacyClauses = {
  "To read more about how your data is used, see our": "如需了解数据的使用方式，请参阅我们的",
  "To read more about how your data is used and how to opt out, see our":
    "如需了解数据的使用方式以及如何退出，请参阅我们的",
};
NodeAssert.deepEqual(manifest.privacyClauses, approvedPrivacyClauses);
const expected = { installer: manifest.installerSha256 };
NodeAssert.equal(digest(NodeFS.readFileSync(values.asset)), expected.installer);
NodeAssert.equal(digest(NodeFS.readFileSync(values.executable)), manifest.executableSha256);
if (values.kind === "appimage") {
  NodeAssert.equal(manifest.mode, "same-full-run-debian13-v1");
  NodeAssert.equal(NodeFS.realpathSync(values.asset), NodeFS.realpathSync(values.executable));
  NodeAssert.equal(manifest.installerSha256, manifest.executableSha256);
} else {
  NodeAssert.equal(manifest.mode, "same-full-run-native-deb-v1");
  NodeAssert.notEqual(NodeFS.realpathSync(values.asset), NodeFS.realpathSync(values.executable));
  NodeAssert.equal(
    NodeChildProcess.execFileSync("dpkg-query", ["-S", NodeFS.realpathSync(values.executable)], {
      encoding: "utf8",
    })
      .trim()
      .split(": ")[0],
    manifest.debPackage,
  );
}
NodeAssert.equal(digest(NodeFS.readFileSync(new URL(import.meta.url))), manifest.cjkDriverSha256);
const distro = Object.fromEntries(
  NodeFS.readFileSync("/etc/os-release", "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, "")];
    }),
);
NodeAssert.equal(distro.ID, values.kind === "appimage" ? "debian" : "ubuntu");
NodeAssert.equal(distro.VERSION_ID, values.kind === "appimage" ? "13" : "24.04");
const { _electron } = await import(NodeURL.pathToFileURL(values["playwright-module"]).href);
const artifacts = NodePath.resolve(values["artifacts-dir"]);
NodeFS.mkdirSync(artifacts, { recursive: true });
const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-cjk-check-"));
const t3Home = NodePath.join(home, "t3");
NodeAssert.equal(NodeFS.existsSync(t3Home), false);
const report = {
  schema_version: 2,
  evidence_type: manifest.mode,
  passed: false,
  kind: values.kind,
  executable: { path: NodeFS.realpathSync(values.executable), sha256: manifest.executableSha256 },
  source: { sha: manifest.sourceSha, tree: manifest.sourceTree },
  producer: {
    run_id: manifest.producerRunId,
    run_attempt: manifest.producerRunAttempt,
    artifact_id: manifest.artifactId,
  },
  asset: {
    name: NodePath.basename(values.asset),
    sha256: expected.installer,
    size: NodeFS.statSync(values.asset).size,
  },
  driver_sha256: digest(NodeFS.readFileSync(new URL(import.meta.url))),
  playwright_version: manifest.playwrightVersion,
  environment: {
    distro,
    kernel: NodeChildProcess.execFileSync("uname", ["-r"], { encoding: "utf8" }).trim(),
    uid: process.getuid(),
  },
  profile: { home, t3Home, initially_empty: true, restart_reuses_same_profile: true },
  font_environment: JSON.parse(
    NodeFS.readFileSync(NodePath.join(artifacts, "font-evidence.json"), "utf8"),
  ),
  sessions: [],
  screenshots: [],
  scope:
    "Same-full-run typed Linux installer CJK proof with real distro fonts, language selection and persisted restart; not release approval.",
};
let app, page;
async function screenshot(name) {
  const file = NodePath.join(artifacts, name);
  await page.screenshot({ path: file, animations: "disabled" });
  report.screenshots.push({
    name,
    sha256: digest(NodeFS.readFileSync(file)),
    size: NodeFS.statSync(file).size,
  });
}
async function launch() {
  const session = { page_errors: [], console_errors: [] };
  report.sessions.push(session);
  app = await _electron.launch({
    executablePath: NodePath.resolve(values.executable),
    chromiumSandbox: true,
    args: [`--user-data-dir=${NodePath.join(home, "electron-profile")}`],
    env: {
      ...process.env,
      T3CODE_HOME: t3Home,
      XDG_CONFIG_HOME: NodePath.join(home, "config"),
      XDG_DATA_HOME: NodePath.join(home, "data"),
      T3CODE_TELEMETRY_ENABLED: "false",
      T3CODE_DISABLE_AUTO_UPDATE: "true",
    },
    timeout: 60000,
  });
  session.spawn_args = app.process().spawnargs;
  session.requested_chromium_sandbox = true;
  NodeAssert.ok(
    !session.spawn_args.some((a) =>
      /--(?:no-sandbox|disable-setuid-sandbox|disable-seccomp-filter-sandbox|disable-gpu-sandbox|appimage-extract)/.test(
        a,
      ),
    ),
  );
  session.packaged = await app.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    userData: app.getPath("userData"),
    version: app.getVersion(),
    noSandbox: app.commandLine.hasSwitch("no-sandbox"),
  }));
  NodeAssert.equal(session.packaged.isPackaged, true);
  NodeAssert.equal(session.packaged.noSandbox, false);
  session.effectiveSandbox = {
    switches: await app.evaluate(({ app }) =>
      Object.fromEntries(
        [
          "no-sandbox",
          "disable-setuid-sandbox",
          "disable-seccomp-filter-sandbox",
          "disable-gpu-sandbox",
        ].map((key) => [key, app.commandLine.hasSwitch(key)]),
      ),
    ),
  };
  NodeAssert.ok(Object.values(session.effectiveSandbox.switches).every((value) => value === false));
  const rel = NodePath.relative(
    NodeFS.realpathSync(home),
    NodeFS.realpathSync(session.packaged.userData),
  );
  NodeAssert.ok(rel && !rel.startsWith(".." + NodePath.sep) && !NodePath.isAbsolute(rel));
  page = await app.firstWindow({ timeout: 60000 });
  page.on("pageerror", (e) => session.page_errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") session.console_errors.push(m.text());
  });
  await page.waitForURL(/^(?:t3code:\/\/app\/|https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/)/, {
    timeout: 60000,
  });
  await page.getByRole("dialog").first().waitFor({ state: "visible", timeout: 60000 });
  await observeSandbox(session);
  await page.getByRole("dialog").first().waitFor({ state: "visible", timeout: 60000 });
  session.url = page.url();
  return session;
}
async function observeSandbox(session) {
  const report = session;
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

async function actualFonts(text) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    let parentId;
    function visit(node) {
      for (const child of node.children || []) {
        if (child.nodeType === 3 && child.nodeValue.trim() === text) parentId = node.nodeId;
        visit(child);
      }
      for (const shadow of node.shadowRoots || []) visit(shadow);
    }
    visit(root);
    NodeAssert.ok(parentId, "Visible Chinese text missing from CDP DOM");
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: parentId });
    const requiredGlyphs = Array.from(text).filter((c) => /\p{Script=Han}/u.test(c)).length;
    const cjkGlyphs = fonts
      .filter((f) => /Noto.*CJK/i.test(f.familyName))
      .reduce((sum, f) => sum + f.glyphCount, 0);
    NodeAssert.ok(
      requiredGlyphs > 0 && cjkGlyphs >= requiredGlyphs,
      "Chinese label did not render all Han glyphs using installed Noto CJK",
    );
    return { text, fonts };
  } finally {
    await cdp.detach();
  }
}
async function assertChinese(session) {
  await page.waitForFunction(() => document.documentElement.lang === "zh-CN", null, {
    timeout: 30000,
  });
  for (const text of ["设置 T3 Code", "连接你的设备", "要设置的设备", "添加设备"])
    await page
      .getByText(text, { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30000 });
  await page.getByRole("combobox", { name: "应用语言", exact: true }).waitFor({ state: "visible" });
  NodeAssert.equal(
    (await page.getByRole("combobox", { name: "应用语言", exact: true }).innerText()).trim(),
    "简体中文",
  );
  await page.getByRole("button", { name: "继续", exact: true }).waitFor({ state: "visible" });
  const observation = report.privacy_observation;
  NodeAssert.ok(observation?.observed_before_language_selection);
  const expectedPrivacy = approvedPrivacyClauses[observation.source_clause];
  NodeAssert.equal(expectedPrivacy, observation.expected_translation);
  await page
    .getByRole("dialog")
    .locator("p")
    .filter({ hasText: expectedPrivacy })
    .first()
    .waitFor({ state: "visible", timeout: 30000 });
  session.privacy_clause = {
    source: observation.source_clause,
    expected: expectedPrivacy,
    visible: true,
  };
  session.locale = await page.locator("html").getAttribute("lang");
  session.body_text = await page.locator("body").innerText();
  NodeAssert.ok(
    !/could not start|failed to start the server|无法启动服务器/i.test(session.body_text),
  );
  for (const source of Object.keys(approvedPrivacyClauses))
    NodeAssert.ok(!session.body_text.includes(source), "Untranslated onboarding privacy clause");
  for (const translation of Object.values(approvedPrivacyClauses))
    if (translation !== expectedPrivacy)
      NodeAssert.ok(!session.body_text.includes(translation), "Privacy clause variant changed");
  session.rendered_chinese_fonts = await actualFonts("连接你的设备");
  NodeAssert.deepEqual(session.page_errors, []);
  NodeAssert.ok(
    !session.console_errors.some((x) =>
      /client.settings.*persist failed|could not start|无法启动/i.test(x),
    ),
  );
}
async function close() {
  const active = app;
  let timer;
  try {
    await Promise.race([
      active.close(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Graceful application shutdown did not finish")),
          10000,
        );
      }),
    ]);
    app = null;
    page = null;
  } finally {
    clearTimeout(timer);
  }
}
try {
  const first = await launch();
  await page
    .getByRole("combobox", { name: "App language", exact: true })
    .waitFor({ state: "visible", timeout: 30000 });
  const englishDialogText = await page.getByRole("dialog").innerText();
  const observedSources = Object.keys(approvedPrivacyClauses).filter((source) =>
    englishDialogText.includes(source),
  );
  NodeAssert.equal(
    observedSources.length,
    1,
    "Expected exactly one approved English privacy clause before language selection",
  );
  const observedSource = observedSources[0];
  const privacyParagraph = page
    .getByRole("dialog")
    .locator("p")
    .filter({ hasText: observedSource });
  NodeAssert.equal(await privacyParagraph.count(), 1, "Expected one actual privacy paragraph");
  await privacyParagraph.waitFor({ state: "visible", timeout: 30000 });
  report.privacy_observation = {
    source_clause: observedSource,
    expected_translation: approvedPrivacyClauses[observedSource],
    observed_before_language_selection: true,
    visible: true,
    english_paragraph: await privacyParagraph.innerText(),
  };
  await screenshot("01-fonts-installed-english.png");
  await page.getByRole("combobox", { name: "App language", exact: true }).click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await assertChinese(first);
  await screenshot("02-chinese-selected.png");
  await close();
  const restarted = await launch();
  await assertChinese(restarted);
  await screenshot("03-chinese-after-restart.png");
  NodeAssert.equal(restarted.packaged.userData, first.packaged.userData);
  report.language_selection = "actual combobox and option clicks";
  report.persisted_restart = true;
  await close();
  NodeAssert.equal(digest(NodeFS.readFileSync(values.asset)), expected.installer);
  report.passed = true;
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
  if (page) await screenshot("failure.png").catch(() => {});
} finally {
  if (app) {
    const child = app.process();
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    timer.unref();
    await app.close().catch(() => {});
    clearTimeout(timer);
  }
  NodeFS.writeFileSync(
    NodePath.join(artifacts, "linux-chinese-ui.json"),
    JSON.stringify(report, null, 2),
  );
}

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
  "See the": "请参阅",
  "To opt out, see the": "如需退出，请参阅",
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
function backendSignalExits(text) {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      const record = JSON.parse(line);
      const annotations = record.annotations;
      if (
        record.level !== "ERROR" ||
        annotations?.component !== "desktop-backend-child" ||
        annotations.phase !== "END"
      )
        return [];
      const match = /^pid=(\d+) killed by (SIG[A-Z0-9]+)$/.exec(annotations.details ?? "");
      return match
        ? [
            {
              pid: Number(match[1]),
              signal: match[2],
              timestamp: record.timestamp,
              runId: annotations.runId,
            },
          ]
        : [];
    });
}
function readBackendSignalExits() {
  const directory = NodePath.join(t3Home, "userdata", "logs");
  // Failure snapshots are lazy; a healthy backend need not create a log file.
  if (!NodeFS.existsSync(directory)) return [];
  return NodeFS.readdirSync(directory)
    .filter((name) => /^server-child\.log(?:\.\d+)?$/.test(name))
    .flatMap((name) =>
      backendSignalExits(NodeFS.readFileSync(NodePath.join(directory, name), "utf8")),
    );
}
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
function isolatedApplicationEnv(source, home) {
  const allowed = [
    "PATH",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "DISPLAY",
    "XAUTHORITY",
    "DBUS_SESSION_BUS_ADDRESS",
    "XDG_RUNTIME_DIR",
    "TMPDIR",
    "TMP",
    "TEMP",
    "CI",
    "DEBUG",
    "ELECTRON_ENABLE_LOGGING",
  ];
  return {
    ...Object.fromEntries(
      allowed.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
    ),
    HOME: home,
    T3CODE_HOME: NodePath.join(home, "t3"),
    XDG_CONFIG_HOME: NodePath.join(home, "config"),
    XDG_DATA_HOME: NodePath.join(home, "data"),
    T3CODE_TELEMETRY_ENABLED: "false",
    T3CODE_DISABLE_AUTO_UPDATE: "true",
  };
}
async function launch() {
  const session = { page_errors: [], console_errors: [] };
  // Previous session's own graceful close is outside this launch's observation.
  session.backendSignalBaseline = readBackendSignalExits();
  report.sessions.push(session);
  app = await _electron.launch({
    executablePath: NodePath.resolve(values.executable),
    chromiumSandbox: true,
    args: [`--user-data-dir=${NodePath.join(home, "electron-profile")}`],
    env: isolatedApplicationEnv(process.env, home),
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
  session.application_env = await app.evaluate(() => ({
    home: process.env.HOME,
    forbidden_keys: Object.keys(process.env).filter((key) =>
      /^(?:GH_|GITHUB_|ACTIONS_)|TOKEN|SECRET|PASSWORD|API_KEY|AUTH_SOCK|CREDENTIAL/i.test(key),
    ),
  }));
  NodeAssert.deepEqual(session.application_env, { home, forbidden_keys: [] });
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
  await page.waitForLoadState("domcontentloaded");
  await observeSandbox(session);
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
async function navigate(path) {
  const url = new URL(page.url());
  // Packaged Electron uses hash history, including its localhost fallback origin.
  url.hash = path;
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
}
async function assertChinese(session) {
  await page.waitForFunction(() => document.documentElement.lang === "zh-CN", null, {
    timeout: 30000,
  });
  await page.getByRole("combobox", { name: "应用语言", exact: true }).waitFor({ state: "visible" });
  NodeAssert.equal(
    (await page.getByRole("combobox", { name: "应用语言", exact: true }).innerText()).trim(),
    "简体中文",
  );
  await navigate("/welcome");
  await page
    .getByRole("heading", { name: "欢迎使用 T3 Code", exact: true })
    .waitFor({ state: "visible", timeout: 30000 });
  await page
    .getByRole("button", { name: "暂不配置 Agent，直接开始", exact: true })
    .waitFor({ state: "visible", timeout: 30000 });
  await page
    .getByRole("button", { name: "启动", exact: true })
    .waitFor({ state: "visible", timeout: 30000 });
  const observation = report.privacy_observation;
  NodeAssert.ok(observation?.observed_before_language_selection);
  const expectedPrivacy = approvedPrivacyClauses[observation.source_clause];
  NodeAssert.equal(expectedPrivacy, observation.expected_translation);
  await page
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
  session.url = page.url();
  NodeAssert.ok(
    !/could not start|failed to start the server|无法启动服务器/i.test(session.body_text),
  );
  for (const source of Object.keys(approvedPrivacyClauses))
    NodeAssert.ok(!session.body_text.includes(source), "Untranslated onboarding privacy clause");
  for (const translation of Object.values(approvedPrivacyClauses))
    if (translation !== expectedPrivacy)
      NodeAssert.ok(
        !(
          expectedPrivacy.includes(translation)
            ? session.body_text.replaceAll(expectedPrivacy, "")
            : session.body_text
        ).includes(translation),
        "Privacy clause variant changed",
      );
  session.rendered_chinese_fonts = await actualFonts("欢迎使用 T3 Code");
  const previousSignals = new Set(
    session.backendSignalBaseline.map((record) => JSON.stringify(record)),
  );
  session.backendSignalExits = readBackendSignalExits().filter(
    (record) => !previousSignals.has(JSON.stringify(record)),
  );
  NodeAssert.deepEqual(
    session.backendSignalExits,
    [],
    "Unexpected backend signal exit before session close",
  );
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
async function assertThreadsSettings(locale) {
  await navigate("/settings/threads");
  await page.waitForFunction((expected) => document.documentElement.lang === expected, locale, {
    timeout: 30000,
  });
  const chinese = locale === "zh-CN";
  const rows = {
    "ghq-clone-layout": chinese
      ? ["克隆的仓库按 github.com/owner/repo 结构存放在上述目录下，与 ghq 类似。"]
      : ["Clones go to github.com/owner/repo under the folder above, like ghq."],
    "default-model": chinese
      ? [
          "新任务默认使用自动选择的模型，项目可以单独覆盖。",
          "新任务使用的默认模型，项目可以单独覆盖。",
        ]
      : [
          "Default model for new threads, selected automatically. Projects can override it.",
          "Default model for new threads. Projects can override it.",
        ],
    "default-permissions": chinese
      ? ["新任务的默认权限，项目可以单独覆盖。"]
      : ["Default permissions for new threads. Projects can override them."],
    "new-threads": chinese
      ? ["新任务的起始位置，项目设置及其 t3.json 可以覆盖此项。"]
      : ["Where new threads start. Projects and their t3.json can override it."],
  };
  const descriptions = {};
  for (const [id, alternatives] of Object.entries(rows)) {
    const row = page.locator(`#${id}`);
    await row.waitFor({ state: "visible", timeout: 30000 });
    const text = await row.innerText();
    const matches = alternatives.filter((description) => text.includes(description));
    NodeAssert.equal(matches.length, 1, `Missing ${locale} settings description: ${id}`);
    descriptions[id] = matches[0];
  }
  const navigation = chinese ? ["语音"] : ["Voice"];
  for (const name of navigation)
    await page.getByRole("treeitem", { name, exact: true }).waitFor({ state: "visible" });
  const groups = chinese ? ["智能体", "代码", "连接"] : ["Agents", "Code", "Connections"];
  for (const name of groups)
    await page.getByRole("group", { name, exact: true }).waitFor({ state: "visible" });
  return {
    locale: await page.locator("html").getAttribute("lang"),
    url: page.url(),
    descriptions,
    navigation,
    groups,
    body_text: await page.locator("body").innerText(),
  };
}
const settingsOverviews = [
  ["general", "language"],
  ["appearance", "appearance"],
  ["chat", "composer"],
  ["diffs", "diffs"],
  ["keybindings", "keybindings"],
  ["voice", "voice-input"],
  ["threads", "ghq-clone-layout"],
  ["browser", "browser-agent-access"],
  ["devices", "devices"],
  ["source-control", "source-control"],
  ["worktrees", "worktree-creation"],
  ["connections", "remote-environments"],
  ["maintenance", "updates"],
  ["labs", "beta"],
  ["about", "about"],
  ["archived", "archive"],
];
async function auditSettingsOverviews() {
  const routes = [];
  for (const [name, marker] of settingsOverviews) {
    const route = `/settings/${name}`;
    await navigate(route);
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN", null, {
      timeout: 30000,
    });
    await page
      .locator(`[data-settings-section="${route}"][aria-selected="true"]`)
      .waitFor({ state: "visible", timeout: 30000 });
    const content = page.locator('[data-workspace-area="settings"]');
    const ready = content.locator(`#${marker}`);
    await ready.waitFor({ state: "visible", timeout: 30000 });
    const readyText = (await ready.innerText()).trim().split("\n")[0];
    NodeAssert.match(readyText, /\p{Script=Han}/u, `No Chinese overview text: ${route}`);
    if (name === "voice") {
      await content
        .getByRole("heading", { name: "输入", exact: true })
        .waitFor({ state: "visible" });
      await content
        .getByRole("heading", { name: "转写", exact: true })
        .waitFor({ state: "visible" });
    }
    const text = await content.innerText();
    NodeAssert.ok(!/could not start|failed to start the server|无法启动服务器/i.test(text));
    const filename = `settings-${name}-zh-CN.png`;
    await screenshot(filename);
    routes.push({
      route,
      marker,
      locale: await page.locator("html").getAttribute("lang"),
      url: page.url(),
      ready_text: readyText,
      body_text: text,
      screenshot: filename,
      ascii_lines_for_review: text
        .split("\n")
        .filter((line) => /^[A-Za-z][A-Za-z ,.:;!?'-]{7,}$/.test(line)),
    });
  }
  return {
    scope: "read-only initial settings overviews in the packaged Linux shared UI",
    routes,
    unvisited: [
      "/settings/providers",
      "/settings/projects",
      "/settings/scheduled-tasks",
      "/settings/snap-shot",
      "/settings/access",
      "/settings/secrets",
      "/settings/diagnostics",
    ],
    limitations: [
      "Screenshots show initial viewports; body text includes loaded settings copy, not unopened menus or dialogs.",
      "ASCII lines need human review; product names and technical terms may intentionally remain English.",
      "No thread/project fixtures, agent turns, provider setup, authentication, microphone capture, downloads, permission changes or destructive actions.",
      "Thread context menus and provider/project/schedule/credential-dependent states are not covered.",
      "Linux shared UI evidence does not cover native macOS, Windows, Android or iOS controls.",
    ],
  };
}
// Separate from the frozen 16-route/22-image settings_audit contract.
// Sensitive access/diagnostics views are deliberately not navigated or captured.
async function auditSupplementalSettings(page, navigate, capture) {
  const result = {
    schema_version: 1,
    scope: "packaged isolated-profile supplemental settings; not all UI or native OS coverage",
    routes: [],
    scrolls: [],
    menus: [],
    screenshots: [],
    not_captured: [
      {
        route: "/settings/access",
        reason:
          "Pairing credentials and client details require separately validated structural redaction.",
      },
      {
        route: "/settings/diagnostics",
        reason: "Process, endpoint and log data require separately validated structural redaction.",
      },
    ],
    limitations: [
      "Only isolated fresh-profile overview states; no provider authentication or project/task creation.",
      "Inputs and canvas are masked; reports contain static anchor labels, not full DOM text.",
      "No permissions, settings values, capture setup, credentials or accounts changed.",
      "Bounded scroll samples and two open/close menus do not prove all nested states.",
      "Secrets must remain disabled in the actual release; no feature flag is enabled.",
    ],
  };
  const content = page.locator('[data-workspace-area="settings"]');
  const visible = async (locator) => locator.waitFor({ state: "visible", timeout: 30000 });
  const enter = async (name) => {
    const route = `/settings/${name}`;
    await navigate(route);
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN", null, {
      timeout: 30000,
    });
    NodeAssert.equal(new URL(page.url()).hash, `#${route}`);
    await visible(page.locator(`[data-settings-section="${route}"][aria-selected="true"]`));
    return route;
  };
  const shot = async (name) => {
    // No arbitrary filename, route URL, exception text or input value enters the report.
    NodeAssert.match(name, /^supplemental-[a-z0-9-]+\.png$/);
    const evidence = await capture(name);
    result.screenshots.push(evidence);
    return name;
  };
  for (const [name, marker, label] of [
    ["providers", "#providers", "服务提供方"],
    ["projects", null, "选择项目以管理其名称、图标、检出目录和操作。"],
    ["scheduled-tasks", null, "定时任务"],
    ["snap-shot", "#snap-shot", "快照"],
  ]) {
    const route = await enter(name);
    await visible(
      marker
        ? content.locator(marker)
        : name === "projects"
          ? content.getByText(label, { exact: true })
          : content.getByRole("heading", { name: label, exact: true }),
    );
    result.routes.push({
      route,
      marker,
      locale: "zh-CN",
      static_anchor: label,
      screenshot: await shot(`supplemental-${name}-overview.png`),
    });
  }
  // Do not capture or read text while testing this potentially sensitive route.
  await navigate("/settings/secrets");
  await page.waitForFunction(() => new URL(location.href).hash === "#/settings/general", null, {
    timeout: 30000,
  });
  NodeAssert.equal(new URL(page.url()).hash, "#/settings/general");
  NodeAssert.equal(await page.locator('[data-settings-section="/settings/secrets"]').count(), 0);
  result.secrets = {
    route: "/settings/secrets",
    status: "feature-disabled-redirect-verified",
    redirect: "/settings/general",
    captured: false,
  };

  for (const name of [
    "threads",
    "source-control",
    "worktrees",
    "keybindings",
    "voice",
    "maintenance",
    "appearance",
  ]) {
    const route = await enter(name);
    const scroller = content.locator("[data-settings-page-scroll]");
    await visible(scroller);
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    let last = -1;
    const samples = [];
    // Real 1100x780 keybindings DOM needs 15 samples (6428px / 454px).
    // 32 is a bounded headroom, never permission to accept a truncated page.
    for (let step = 0; step < 32; step++) {
      const state = await scroller.evaluate((element) => {
        const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
        element.scrollTop = Math.min(
          maximum,
          element.scrollTop + Math.max(1, Math.floor(element.clientHeight * 0.7)),
        );
        return { top: element.scrollTop, maximum, height: element.clientHeight };
      });
      NodeAssert.ok(state.height > 0 && state.top >= last);
      if (state.top === last) break;
      last = state.top;
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      samples.push({ ...state, screenshot: await shot(`supplemental-${name}-scroll-${step}.png`) });
      if (state.top >= state.maximum) break;
    }
    NodeAssert.ok(samples.length > 0);
    NodeAssert.ok(
      samples.at(-1).top >= samples.at(-1).maximum,
      "Incomplete supplemental scroll coverage",
    );
    result.scrolls.push({
      route,
      samples,
      reached_bottom: samples.at(-1).top >= samples.at(-1).maximum,
    });
  }
  for (const [name, id] of [
    ["general", "thread-notifications"],
    ["browser", "browser-link-target"],
  ]) {
    const route = await enter(name);
    const trigger = content.locator(`#${id}`).locator('[data-slot="select-trigger"]');
    await trigger.scrollIntoViewIfNeeded();
    await visible(trigger);
    const before = await trigger.innerText();
    await trigger.click();
    const popup = page.getByRole("listbox");
    await visible(popup);
    const screenshot = await shot(`supplemental-${name}-${id}-options.png`);
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden", timeout: 10000 });
    NodeAssert.equal(await trigger.innerText(), before);
    result.menus.push({
      route,
      row: id,
      opened: true,
      closed: true,
      value_unchanged: true,
      screenshot,
    });
  }
  await enter("general");
  return result;
}

let supplementalPhase = false;

try {
  const first = await launch();
  await page
    .getByRole("heading", { name: "Welcome to T3 Code", exact: true })
    .waitFor({ state: "visible", timeout: 60000 });
  const englishDialogText = await page.locator("body").innerText();
  const observedSources = Object.keys(approvedPrivacyClauses).filter((source) =>
    englishDialogText.includes(source),
  );
  NodeAssert.equal(
    observedSources.length,
    1,
    "Expected exactly one approved English privacy clause before language selection",
  );
  const observedSource = observedSources[0];
  const privacyParagraph = page.locator("p").filter({ hasText: observedSource });
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
  await page.getByRole("button", { name: "Start without an agent", exact: true }).click();
  await page.waitForURL((url) => url.hash !== "#/welcome", { timeout: 60000 });
  await navigate("/settings/general");
  await page.getByRole("combobox", { name: "App language", exact: true }).click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await assertChinese(first);
  await screenshot("02-chinese-selected.png");
  await close();
  const restarted = await launch();
  await navigate("/settings/general");
  await assertChinese(restarted);
  await screenshot("03-chinese-after-restart.png");
  NodeAssert.equal(restarted.packaged.userData, first.packaged.userData);
  const chineseSettings = await assertThreadsSettings("zh-CN");
  await screenshot("04-chinese-thread-settings.png");
  await navigate("/settings/general");
  await page.getByRole("combobox", { name: "应用语言", exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  const englishSettings = await assertThreadsSettings("en");
  await screenshot("05-english-thread-settings.png");
  await navigate("/settings/general");
  await page.getByRole("combobox", { name: "App language", exact: true }).click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  const restoredSettings = await assertThreadsSettings("zh-CN");
  await screenshot("06-chinese-thread-settings-restored.png");
  report.settings_roundtrip = [chineseSettings, englishSettings, restoredSettings];
  report.settings_audit = await auditSettingsOverviews();
  supplementalPhase = true;
  report.supplemental_settings_audit = await auditSupplementalSettings(
    page,
    navigate,
    async (name) => {
      const file = NodePath.join(artifacts, name);
      await page.screenshot({
        path: file,
        animations: "disabled",
        mask: [page.locator('input, textarea, [contenteditable="true"], canvas')],
        maskColor: "#808080",
      });
      return { name, sha256: digest(NodeFS.readFileSync(file)), size: NodeFS.statSync(file).size };
    },
  );
  const previousSignals = new Set(
    restarted.backendSignalBaseline.map((record) => JSON.stringify(record)),
  );
  restarted.backendSignalExits = readBackendSignalExits().filter(
    (record) => !previousSignals.has(JSON.stringify(record)),
  );
  NodeAssert.deepEqual(restarted.backendSignalExits, []);
  NodeAssert.deepEqual(restarted.page_errors, []);
  report.language_selection = "actual combobox and option clicks";
  report.persisted_restart = true;
  await close();
  NodeAssert.equal(digest(NodeFS.readFileSync(values.asset)), expected.installer);
  report.passed = true;
} catch (error) {
  report.error = supplementalPhase
    ? "Supplemental settings validation failed; no page content captured on failure."
    : String(error);
  process.exitCode = 1;
  if (page && !supplementalPhase) await screenshot("failure.png").catch(() => {});
} finally {
  const logs = NodePath.join(t3Home, "userdata", "logs");
  if (NodeFS.existsSync(logs))
    NodeFS.cpSync(logs, NodePath.join(artifacts, "logs"), { recursive: true });
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

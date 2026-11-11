import * as NodeCrypto from "node:crypto";
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import * as NodeURL from "node:url";

const { values } = NodeUtil.parseArgs({
  options: {
    executable: { type: "string" },
    platform: { type: "string" },
    "playwright-module": { type: "string" },
    "artifacts-dir": { type: "string" },
  },
});
NodeAssert.ok(values.executable && values["playwright-module"] && values["artifacts-dir"]);
NodeAssert.ok(["Linux", "Windows", "macOS"].includes(values.platform));
const { _electron } = await import(NodeURL.pathToFileURL(values["playwright-module"]).href);
const artifacts = NodePath.resolve(values["artifacts-dir"]);
NodeFS.mkdirSync(artifacts, { recursive: true });
const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-clean-first-start-"));
const t3Home = NodePath.join(home, "t3");
NodeAssert.ok(!NodeFS.existsSync(t3Home));
const macProfile =
  values.platform === "macOS"
    ? NodePath.join(NodeOS.homedir(), "Library", "Application Support", "t3code-v2")
    : null;
if (macProfile) {
  NodeAssert.equal(process.env.GITHUB_ACTIONS, "true");
  NodeAssert.equal(process.env.RUNNER_OS, "macOS");
  NodeAssert.ok(!NodeFS.existsSync(macProfile), "macOS CI runner profile must start empty");
}
const report = {
  schemaVersion: 2,
  executable: NodePath.resolve(values.executable),
  fixtureData: false,
  testHome: home,
  requestedChromiumSandbox: true,
  profileIsolation: macProfile ? "fresh macOS CI runner account" : "unique temporary directory",
  scope:
    "instrumented clean first launch through the installed executable or ordinary AppImage entry; no migration fixture",
  downloadTrustDialogs:
    "Browser-origin security dialogs, Finder approval and Windows SmartScreen are not covered by this CI check.",
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
async function waitForWelcome(page) {
  await page
    .getByRole("heading", { name: "Welcome to T3 Code", exact: true })
    .waitFor({ state: "visible", timeout: 60_000 });
  await page
    .getByRole("button", { name: "Start without an agent", exact: true })
    .waitFor({ state: "visible", timeout: 60_000 });
  await page
    .getByRole("button", { name: "Start", exact: true })
    .waitFor({ state: "visible", timeout: 60_000 });
}
let app;
let page;
try {
  app = await _electron.launch({
    executablePath: report.executable,
    chromiumSandbox: true,
    args: [`--user-data-dir=${NodePath.join(home, "electron-profile")}`],
    env: {
      ...process.env,
      T3CODE_HOME: t3Home,
      XDG_CONFIG_HOME: NodePath.join(home, "config"),
      XDG_DATA_HOME: NodePath.join(home, "data"),
      ...(values.platform === "Windows"
        ? {
            APPDATA: NodePath.join(home, "appdata"),
            LOCALAPPDATA: NodePath.join(home, "localappdata"),
          }
        : {}),
      T3CODE_TELEMETRY_ENABLED: "false",
      T3CODE_DISABLE_AUTO_UPDATE: "true",
    },
    timeout: 60_000,
  });
  report.spawnArgs = app.process().spawnargs;
  report.effectiveSandbox = {
    switches: await app.evaluate(({ app }) => ({
      noSandbox: app.commandLine.hasSwitch("no-sandbox"),
      disableSetuidSandbox: app.commandLine.hasSwitch("disable-setuid-sandbox"),
      disableSeccompFilterSandbox: app.commandLine.hasSwitch("disable-seccomp-filter-sandbox"),
      disableGpuSandbox: app.commandLine.hasSwitch("disable-gpu-sandbox"),
    })),
  };
  NodeAssert.deepEqual(report.effectiveSandbox.switches, {
    noSandbox: false,
    disableSetuidSandbox: false,
    disableSeccompFilterSandbox: false,
    disableGpuSandbox: false,
  });
  report.cliSandboxOverride = report.spawnArgs.some((arg) =>
    /--(?:no-sandbox|disable-setuid-sandbox|disable-seccomp-filter-sandbox|disable-gpu-sandbox|appimage-extract)/.test(
      arg,
    ),
  );
  NodeAssert.equal(report.cliSandboxOverride, false);
  report.packaged = await app.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    userData: app.getPath("userData"),
  }));
  NodeAssert.ok(report.packaged.isPackaged);
  if (macProfile) {
    NodeAssert.equal(
      NodeFS.realpathSync(report.packaged.userData),
      NodeFS.realpathSync(macProfile),
    );
  } else {
    const relativeProfile = NodePath.relative(
      NodeFS.realpathSync(home),
      NodeFS.realpathSync(report.packaged.userData),
    );
    NodeAssert.ok(
      !relativeProfile.startsWith(`..${NodePath.sep}`) && !NodePath.isAbsolute(relativeProfile),
    );
  }
  page = await app.firstWindow({ timeout: 60_000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForURL(/^(?:t3code:\/\/app\/|https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/)/, {
    timeout: 60_000,
  });
  await waitForWelcome(page);
  report.firstRender = {
    bodyText: await page.locator("body").innerText(),
    windowUrl: page.url(),
    screenshot: "clean-first-render.png",
  };
  NodeAssert.ok(report.firstRender.bodyText.trim().length > 0);
  NodeAssert.deepEqual(errors, []);
  NodeAssert.ok(
    !/could not start|failed to start the server|无法启动服务器/i.test(report.firstRender.bodyText),
  );
  await page.screenshot({
    path: NodePath.join(artifacts, "clean-first-render.png"),
    animations: "disabled",
  });
  // Observe packaged preferences and existing preload execution without changing either.
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
  await waitForWelcome(page);
  report.bodyText = await page.locator("body").innerText();
  NodeAssert.ok(report.bodyText.trim().length > 0);
  NodeAssert.deepEqual(errors, []);
  NodeAssert.ok(
    !/could not start|failed to start the server|无法启动服务器/i.test(report.bodyText),
  );
  report.windowTitle = await page.title();
  report.windowUrl = page.url();
  await page.screenshot({
    path: NodePath.join(artifacts, "clean-first-start.png"),
    animations: "disabled",
  });
  // Inspect before our own graceful close: a recovered crash is still a failure.
  report.backendSignalExits = readBackendSignalExits();
  NodeAssert.deepEqual(
    report.backendSignalExits,
    [],
    "Unexpected backend signal exit before acceptance completed",
  );
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.error = String(error);
  console.error(error);
  if (page)
    await page.screenshot({ path: NodePath.join(artifacts, "failure.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  NodeFS.writeFileSync(
    NodePath.join(artifacts, "clean-first-start.json"),
    JSON.stringify(report, null, 2),
  );
  const logs = NodePath.join(t3Home, "userdata", "logs");
  if (NodeFS.existsSync(logs))
    NodeFS.cpSync(logs, NodePath.join(artifacts, "logs"), { recursive: true });
  if (app) {
    const child = app.process();
    const kill = setTimeout(() => child.kill("SIGKILL"), 10_000);
    kill.unref();
    await app.close().catch(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    });
    clearTimeout(kill);
  }
}

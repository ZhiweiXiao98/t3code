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
NodeAssert.ok(["Linux", "Windows"].includes(values.platform));
const { _electron } = await import(NodeURL.pathToFileURL(values["playwright-module"]).href);
const artifacts = NodePath.resolve(values["artifacts-dir"]);
NodeFS.mkdirSync(artifacts, { recursive: true });
const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-clean-first-start-"));
const t3Home = NodePath.join(home, "t3");
NodeAssert.ok(!NodeFS.existsSync(t3Home));
const report = {
  executable: NodePath.resolve(values.executable),
  fixtureData: false,
  testHome: home,
  requestedChromiumSandbox: true,
  scope:
    "instrumented clean first launch through the installed executable or ordinary AppImage entry; no migration fixture",
  downloadTrustDialogs:
    "Browser-origin security dialogs and Windows SmartScreen are not covered by this headless CI check.",
};
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
  report.cliSandboxOverride = report.spawnArgs.some((arg) =>
    /--(?:no-sandbox|disable-setuid-sandbox|appimage-extract)/.test(arg),
  );
  NodeAssert.equal(report.cliSandboxOverride, false);
  report.packaged = await app.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    userData: app.getPath("userData"),
  }));
  NodeAssert.ok(report.packaged.isPackaged);
  const relativeProfile = NodePath.relative(
    NodeFS.realpathSync(home),
    NodeFS.realpathSync(report.packaged.userData),
  );
  NodeAssert.ok(
    !relativeProfile.startsWith(`..${NodePath.sep}`) && !NodePath.isAbsolute(relativeProfile),
  );
  page = await app.firstWindow({ timeout: 60_000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForURL(/^(?:t3code:\/\/app\/|https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/)/, {
    timeout: 60_000,
  });
  await page
    .getByRole("main")
    .or(page.getByRole("dialog"))
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button").first().waitFor({ state: "visible", timeout: 60_000 });
  report.bodyText = await page.locator("body").innerText();
  NodeAssert.ok(report.bodyText.trim().length > 0);
  NodeAssert.deepEqual(errors, []);
  NodeAssert.ok(
    !/could not start|failed to start the server|无法启动服务器/i.test(report.bodyText),
  );
  report.windowTitle = await page.title();
  report.windowUrl = page.url();
  await page.screenshot({ path: NodePath.join(artifacts, "clean-first-start.png") });
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

import * as NodeFS from "node:fs";
import * as NodeAssert from "node:assert/strict";
const s = NodeFS.readFileSync(new URL("../check-debian-cjk-ui.mjs", import.meta.url), "utf8");
const start = s.indexOf('if (values.kind === "appimage") {');
const end = s.indexOf("NodeAssert.equal(digest(NodeFS.readFileSync(new URL", start);
NodeAssert.ok(start > 0 && end > start);
const check = new Function(
  "values",
  "manifest",
  "NodeFS",
  "NodeChildProcess",
  "NodeAssert",
  s.slice(start, end),
);
const distroStart = s.indexOf("NodeAssert.equal(distro.ID, values.kind");
const distroEnd = s.indexOf("const { _electron }", distroStart);
const oscheck = new Function("values", "distro", "NodeAssert", s.slice(distroStart, distroEnd));
function run(
  kind,
  mode,
  same,
  owner = "t3code",
  id = kind === "deb" ? "ubuntu" : "debian",
  version = kind === "deb" ? "24.04" : "13",
) {
  const values = { kind, asset: "asset", executable: same ? "asset" : "exe" };
  check(
    values,
    {
      mode,
      installerSha256: "a",
      executableSha256: kind === "appimage" ? "a" : "b",
      debPackage: "t3code",
    },
    { realpathSync: (x) => x },
    { execFileSync: () => owner + ": /opt/t3code" },
    NodeAssert,
  );
  oscheck(values, { ID: id, VERSION_ID: version }, NodeAssert);
}
run("appimage", "same-full-run-debian13-v1", true);
run("deb", "same-full-run-native-deb-v1", false);
for (const a of [
  ["appimage", "same-full-run-debian13-v1", false],
  ["deb", "same-full-run-native-deb-v1", true],
  ["deb", "same-full-run-debian13-v1", false],
  ["deb", "same-full-run-native-deb-v1", false, "other"],
  ["deb", "same-full-run-native-deb-v1", false, "t3code", "debian", "13"],
  ["appimage", "same-full-run-debian13-v1", true, "t3code", "ubuntu", "24.04"],
])
  NodeAssert.throws(() => run(...a));
const tail = s.match(
  /NodeAssert\.equal\(digest\(NodeFS\.readFileSync\(values\.asset\)\), expected\.installer\);/g,
);
NodeAssert.equal(tail.length, 2);
const endCheck = new Function("NodeAssert", "digest", "NodeFS", "values", "expected", tail[1]);
endCheck(
  NodeAssert,
  (x) => x,
  { readFileSync: () => "verified-hash" },
  { asset: "synthetic" },
  { installer: "verified-hash" },
);
NodeAssert.throws(() =>
  endCheck(
    NodeAssert,
    (x) => x,
    { readFileSync: () => "changed-hash" },
    { asset: "synthetic" },
    { installer: "verified-hash" },
  ),
);
console.log(
  "10 actual-JavaScript typed runtime and final asset-integrity cases passed; no app execution",
);

const settingsStart = s.indexOf("async function assertThreadsSettings(locale) {");
const settingsEnd = s.indexOf("\nconst settingsOverviews", settingsStart);
NodeAssert.ok(settingsStart > 0 && settingsEnd > settingsStart);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const settings = new AsyncFunction(
  "locale",
  "page",
  "navigate",
  "NodeAssert",
  s
    .slice(s.indexOf("{", settingsStart) + 1, settingsEnd)
    .trim()
    .replace(/}$/, ""),
);
const cases = {
  "zh-CN": {
    rows: {
      "ghq-clone-layout": "克隆的仓库按 github.com/owner/repo 结构存放在上述目录下，与 ghq 类似。",
      "default-model": "新任务默认使用自动选择的模型，项目可以单独覆盖。",
      "default-permissions": "新任务的默认权限，项目可以单独覆盖。",
      "new-threads": "新任务的起始位置，项目设置及其 t3.json 可以覆盖此项。",
    },
    navigation: ["语音"],
    groups: ["智能体", "代码", "连接"],
    ordinaryModel: "新任务使用的默认模型，项目可以单独覆盖。",
  },
  en: {
    rows: {
      "ghq-clone-layout": "Clones go to github.com/owner/repo under the folder above, like ghq.",
      "default-model":
        "Default model for new threads, selected automatically. Projects can override it.",
      "default-permissions": "Default permissions for new threads. Projects can override them.",
      "new-threads": "Where new threads start. Projects and their t3.json can override it.",
    },
    navigation: ["Voice"],
    groups: ["Agents", "Code", "Connections"],
    ordinaryModel: "Default model for new threads. Projects can override it.",
  },
};
async function settingsFixture(locale, data) {
  let path;
  const result = await settings(
    locale,
    {
      waitForFunction: async (_fn, expected) => NodeAssert.equal(expected, locale),
      locator: (selector) => ({
        waitFor: async () => NodeAssert.ok(selector.slice(1) in data.rows),
        innerText: async () =>
          selector === "body" ? Object.values(data.rows).join("\n") : data.rows[selector.slice(1)],
        getAttribute: async () => locale,
      }),
      getByRole: (role, { name, exact }) => ({
        waitFor: async () => {
          NodeAssert.equal(exact, true);
          NodeAssert.ok((role === "treeitem" ? data.navigation : data.groups).includes(name));
        },
      }),
      url: () => `t3code://app/#${path}`,
    },
    async (target) => {
      path = target;
    },
    NodeAssert,
  );
  NodeAssert.equal(path, "/settings/threads");
  NodeAssert.deepEqual(result.descriptions, data.rows);
  return result;
}
let settingsCases = 0;
for (const [locale, data] of Object.entries(cases)) {
  await settingsFixture(locale, data);
  await settingsFixture(locale, {
    ...data,
    rows: { ...data.rows, "default-model": data.ordinaryModel },
  });
  settingsCases += 2;
  for (const id of Object.keys(data.rows)) {
    await NodeAssert.rejects(
      settingsFixture(locale, {
        ...data,
        rows: { ...data.rows, [id]: "Untranslated or missing description" },
      }),
    );
    settingsCases++;
  }
  for (const key of ["navigation", "groups"]) {
    await NodeAssert.rejects(settingsFixture(locale, { ...data, [key]: [] }));
    settingsCases++;
  }
}
console.log(
  `${settingsCases} actual settings-driver language/negative fixture cases passed; no app execution`,
);

const overviewsStart = s.indexOf("const settingsOverviews = [");
const auditStart = s.indexOf("async function auditSettingsOverviews() {");
const auditEnd = s.indexOf("\n// Separate from the frozen", auditStart);
NodeAssert.ok(overviewsStart > 0 && auditStart > overviewsStart && auditEnd > auditStart);
const overviews = new Function(s.slice(overviewsStart, auditStart) + "return settingsOverviews;")();
NodeAssert.equal(overviews.length, 16);
NodeAssert.equal(new Set(overviews.map(([name]) => name)).size, 16);
const audit = new AsyncFunction(
  "page",
  "navigate",
  "screenshot",
  "settingsOverviews",
  "NodeAssert",
  s
    .slice(s.indexOf("{", auditStart) + 1, auditEnd)
    .trim()
    .replace(/}$/, ""),
);
async function auditFixture(fault) {
  let route;
  const visited = [],
    screenshots = [];
  const content = {
    locator: (selector) => ({
      waitFor: async () =>
        NodeAssert.equal(
          selector,
          `#${overviews.find(([name]) => route === `/settings/${name}`)[1]}`,
        ),
      innerText: async () => (fault === "english" ? "Raw English" : "设置概览\n其他设置"),
    }),
    innerText: async () =>
      fault === "backend"
        ? "设置概览\nCould not start the server"
        : "设置概览\nOther copy needs review",
    getByRole: (role, { name, exact }) => ({
      waitFor: async () => {
        NodeAssert.equal(role, "heading");
        NodeAssert.equal(exact, true);
        NodeAssert.ok(fault !== "voice" && ["输入", "转写"].includes(name));
      },
    }),
  };
  const result = await audit(
    {
      waitForFunction: async () => NodeAssert.notEqual(fault, "locale"),
      locator: (selector) =>
        selector === '[data-workspace-area="settings"]'
          ? content
          : {
              waitFor: async () => {
                NodeAssert.notEqual(fault, "selected");
                NodeAssert.equal(
                  selector,
                  `[data-settings-section="${route}"][aria-selected="true"]`,
                );
              },
              getAttribute: async () => "zh-CN",
            },
      url: () => `t3code://app/#${route}`,
    },
    async (target) => {
      route = target;
      visited.push(target);
    },
    async (name) => screenshots.push(name),
    overviews,
    NodeAssert,
  );
  NodeAssert.deepEqual(
    visited,
    overviews.map(([name]) => `/settings/${name}`),
  );
  NodeAssert.deepEqual(
    screenshots,
    overviews.map(([name]) => `settings-${name}-zh-CN.png`),
  );
  NodeAssert.equal(result.routes.length, 16);
  NodeAssert.equal(result.unvisited.length, 7);
  NodeAssert.equal(result.limitations.length, 5);
  NodeAssert.equal(result.routes[0].ascii_lines_for_review[0], "Other copy needs review");
  return result;
}
await auditFixture();
for (const fault of ["english", "backend", "voice", "locale", "selected"])
  await NodeAssert.rejects(auditFixture(fault));
console.log(
  "6 actual read-only settings-audit driver fixture cases passed; 16 routes; no app execution",
);

const envStart = s.indexOf("function isolatedApplicationEnv(source, home) {");
const envEnd = s.indexOf("\nasync function launch", envStart);
NodeAssert.ok(envStart > 0 && envEnd > envStart);
const isolatedEnv = new Function(
  "source",
  "home",
  "NodePath",
  s
    .slice(s.indexOf("{", envStart) + 1, envEnd)
    .trim()
    .replace(/}$/, ""),
);
const inherited = {
  PATH: "/usr/bin:/bin",
  DISPLAY: ":99",
  DBUS_SESSION_BUS_ADDRESS: "unix:path=/tmp/dbus-fixture",
  HOME: "/home/runner",
  GITHUB_TOKEN: "synthetic",
  GH_TOKEN: "synthetic",
  ACTIONS_RUNTIME_TOKEN: "synthetic",
  ANTHROPIC_API_KEY: "synthetic",
  AWS_ACCESS_KEY_ID: "synthetic",
  SSH_AUTH_SOCK: "/tmp/not-inherited",
  CUSTOM_CREDENTIAL: "synthetic",
  T3CODE_HOME: "/outside",
  XDG_CONFIG_HOME: "/outside/config",
  NODE_OPTIONS: "--require=untrusted.js",
};
const isolated = isolatedEnv(inherited, "/tmp/t3-fixture", { join: (...parts) => parts.join("/") });
NodeAssert.equal(isolated.PATH, inherited.PATH);
NodeAssert.equal(isolated.DISPLAY, inherited.DISPLAY);
NodeAssert.equal(isolated.DBUS_SESSION_BUS_ADDRESS, inherited.DBUS_SESSION_BUS_ADDRESS);
NodeAssert.equal(isolated.HOME, "/tmp/t3-fixture");
NodeAssert.equal(isolated.T3CODE_HOME, "/tmp/t3-fixture/t3");
NodeAssert.equal(isolated.XDG_CONFIG_HOME, "/tmp/t3-fixture/config");
for (const key of [
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "ACTIONS_RUNTIME_TOKEN",
  "ANTHROPIC_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "SSH_AUTH_SOCK",
  "CUSTOM_CREDENTIAL",
  "NODE_OPTIONS",
])
  NodeAssert.equal(key in isolated, false);
NodeAssert.equal(inherited.GITHUB_TOKEN, "synthetic");
console.log(
  "1 application-environment isolation fixture passed; controller unchanged; no secrets or app execution",
);

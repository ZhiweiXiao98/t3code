// Exercise actual readiness/navigation functions against a full-page UI fixture.
// No Electron, network, or application state writes.
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
const clean = NodeFS.readFileSync(
  new URL("../../check-clean-desktop-first-start.mjs", import.meta.url),
  "utf8",
);
const cjk = NodeFS.readFileSync(new URL("../check-debian-cjk-ui.mjs", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function functionBody(source, name, next) {
  const start = source.indexOf(`function ${name}(`);
  NodeAssert.ok(start >= 0, `Missing ${name}`);
  return source
    .slice(source.indexOf("{", start) + 1, source.indexOf(`\n${next}`, start))
    .trim()
    .replace(/}$/, "");
}
const ready = new AsyncFunction("page", functionBody(clean, "waitForWelcome", "let app;"));
function fixture(missing) {
  return {
    getByRole(role, { name, exact }) {
      NodeAssert.equal(exact, true);
      const present = [
        ["heading", "Welcome to T3 Code"],
        ["button", "Start without an agent"],
        ["button", "Start"],
      ];
      return {
        waitFor: async () =>
          NodeAssert.ok(present.some(([r, n]) => r === role && n === name && n !== missing)),
      };
    },
  };
}
await ready(fixture());
for (const missing of ["Welcome to T3 Code", "Start without an agent", "Start"]) {
  await NodeAssert.rejects(ready(fixture(missing)));
}
const navigate = new AsyncFunction(
  "path",
  "page",
  functionBody(cjk, "navigate", "async function assertChinese"),
);
for (const origin of ["t3code://app/", "http://127.0.0.1:1234/"]) {
  let actual;
  await navigate("/settings/general", {
    url: () => origin + "#/welcome",
    goto: async (url) => {
      actual = url;
    },
  });
  NodeAssert.equal(actual, origin + "#/settings/general");
}
console.log("6 full-page welcome readiness/navigation fixture cases passed");

const signals = new Function(
  "text",
  functionBody(clean, "backendSignalExits", "function readBackendSignalExits"),
);
const entry = (signal) =>
  JSON.stringify({
    level: "ERROR",
    timestamp: "2026-11-11T00:00:00Z",
    annotations: {
      component: "desktop-backend-child",
      phase: "END",
      runId: "fixture",
      details: `pid=4865 killed by ${signal}`,
    },
  });
NodeAssert.deepEqual(signals(""), []);
for (const signal of ["SIGSEGV", "SIGABRT", "SIGTERM"]) {
  NodeAssert.deepEqual(signals(entry(signal)), [
    { pid: 4865, signal, timestamp: "2026-11-11T00:00:00Z", runId: "fixture" },
  ]);
}
NodeAssert.deepEqual(
  signals(JSON.stringify({ annotations: { stream: "stdout", text: "killed by SIGSEGV" } })),
  [],
);
console.log("5 backend-signal fixture cases passed");

const readSignals = new Function(
  "NodeFS",
  "NodePath",
  "t3Home",
  "backendSignalExits",
  functionBody(clean, "readBackendSignalExits", "async function waitForWelcome"),
);
NodeAssert.deepEqual(
  readSignals(
    { existsSync: () => false },
    { join: (...parts) => parts.join("/") },
    "/fixture",
    signals,
  ),
  [],
);
const scanned = [];
const rotated = readSignals(
  {
    existsSync: () => true,
    readdirSync: () => ["server-child.log", "server-child.log.1", "desktop.log"],
    readFileSync: (path) => {
      scanned.push(path);
      return path.endsWith(".1") ? entry("SIGSEGV") : "";
    },
  },
  { join: (...parts) => parts.join("/") },
  "/fixture",
  signals,
);
NodeAssert.equal(rotated[0].signal, "SIGSEGV");
NodeAssert.equal(scanned.length, 2);
const cjkSignals = new Function(
  "text",
  functionBody(cjk, "backendSignalExits", "function readBackendSignalExits"),
);
NodeAssert.deepEqual(cjkSignals(entry("SIGABRT")), signals(entry("SIGABRT")));
console.log("3 lazy/rotated/shared backend-log fixture cases passed");

const signalStart = cjk.indexOf("  const previousSignals =");
const signalEnd = cjk.indexOf("  NodeAssert.deepEqual(session.page_errors", signalStart);
NodeAssert.ok(signalStart > 0 && signalEnd > signalStart);
const checkSessionSignals = new Function(
  "session",
  "readBackendSignalExits",
  "NodeAssert",
  cjk.slice(signalStart, signalEnd),
);
const oldShutdown = signals(entry("SIGTERM"))[0];
checkSessionSignals({ backendSignalBaseline: [oldShutdown] }, () => [oldShutdown], NodeAssert);
NodeAssert.throws(() =>
  checkSessionSignals(
    { backendSignalBaseline: [oldShutdown] },
    () => [oldShutdown, signals(entry("SIGSEGV"))[0]],
    NodeAssert,
  ),
);
console.log("2 CJK per-session signal fixture cases passed");

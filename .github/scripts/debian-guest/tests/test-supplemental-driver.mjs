import * as NodeFS from "node:fs";
import * as NodeAssert from "node:assert/strict";
const source = NodeFS.readFileSync(new URL("../check-debian-cjk-ui.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function auditSupplementalSettings(");
const end = source.indexOf("\nlet supplementalPhase = false;", start);
NodeAssert.ok(start > 0 && end > start);
const audit = new Function(
  "NodeAssert",
  source.slice(start, end) + ";return auditSupplementalSettings;",
)(NodeAssert);
async function fixture(fault) {
  let route = "",
    top = 0,
    opened = false;
  const visits = [],
    captures = [],
    clicks = [];
  const canary = "SYNTHETIC_PASSWORD_TOKEN_QR_CANARY";
  const locator = (selector) => ({
    locator: (child) => locator(selector + " " + child),
    waitFor: async ({ state }) => {
      if (fault === "anchor" && selector.includes("#providers")) throw Error(canary);
      if (state === "hidden") NodeAssert.equal(opened, false);
    },
    getByText: (text) => locator(text),
    getByRole: (role, { name } = {}) => locator(role + ":" + name),
    count: async () => (fault === "secret-nav" ? 1 : 0),
    scrollIntoViewIfNeeded: async () => {},
    innerText: async () =>
      fault === "mutation" && !opened && clicks.length > 0 ? "changed" : canary,
    click: async () => {
      NodeAssert.ok(selector.includes("select-trigger"));
      opened = true;
      clicks.push(selector);
    },
    evaluate: async (fn) => {
      const element = { scrollTop: top, scrollHeight: 1600, clientHeight: 600 };
      const result = fn(element);
      top = element.scrollTop;
      return result;
    },
  });
  const page = {
    locator,
    getByRole: () => locator("popup"),
    url: () => `t3code://app/#${route}`,
    waitForFunction: async () => {
      if (fault === "secret-redirect" && route === "/settings/secrets") throw Error(canary);
    },
    evaluate: async () => {},
    keyboard: {
      press: async (key) => {
        NodeAssert.equal(key, "Escape");
        opened = false;
      },
    },
  };
  const result = await audit(
    page,
    async (target) => {
      visits.push(target);
      route =
        target === "/settings/secrets" && fault !== "secret-redirect"
          ? "/settings/general"
          : target;
      top = 0;
    },
    async (name) => {
      captures.push(name);
      return { name, size: 100, sha256: "a".repeat(64) };
    },
  );
  NodeAssert.ok(!visits.includes("/settings/access") && !visits.includes("/settings/diagnostics"));
  NodeAssert.equal(result.routes.length, 4);
  NodeAssert.equal(result.scrolls.length, 7);
  NodeAssert.equal(result.menus.length, 2);
  NodeAssert.equal(result.screenshots.length, 27);
  NodeAssert.equal(clicks.length, 2);
  NodeAssert.ok(result.scrolls.every((x) => x.reached_bottom));
  NodeAssert.ok(!JSON.stringify(result).includes(canary));
  NodeAssert.deepEqual(
    captures,
    result.screenshots.map((x) => x.name),
  );
  return result;
}
await fixture();
for (const fault of ["anchor", "secret-redirect", "secret-nav", "mutation"])
  await NodeAssert.rejects(fixture(fault));
NodeAssert.match(source, /if \(page && !supplementalPhase\) await screenshot\("failure.png"\)/);
NodeAssert.match(
  source,
  /report.error = supplementalPhase\s*\? "Supplemental settings validation failed; no page content captured on failure\."/,
);
NodeAssert.match(
  source,
  /mask: \[page.locator\('input, textarea, \[contenteditable="true"\], canvas'\)\]/,
);
console.log(
  "5 supplemental driver fixtures passed; canary absent from report; no app execution or sensitive-route capture",
);

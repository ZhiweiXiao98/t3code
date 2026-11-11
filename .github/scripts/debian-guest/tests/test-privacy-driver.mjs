// Execute the actual privacy-observation/assertion snippets with DOM stubs only.
// No Playwright import, Electron launch, network or app execution.
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
const driver = NodeFS.readFileSync(new URL("../check-debian-cjk-ui.mjs", import.meta.url), "utf8");
const map = new Function(
  "return (" + driver.match(/const approvedPrivacyClauses = (\{[\s\S]*?\n\});/)[1] + ")",
)();
NodeAssert.deepEqual(map, { "See the": "请参阅", "To opt out, see the": "如需退出，请参阅" });
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const firstStart = driver.indexOf("  const englishDialogText =");
const firstEnd = driver.indexOf(
  '  await screenshot("01-fonts-installed-english.png");',
  firstStart,
);
const checkStart = driver.indexOf("  const observation = report.privacy_observation;");
const checkEnd = driver.indexOf("  session.rendered_chinese_fonts =", checkStart);
NodeAssert.ok(firstStart > 0 && firstEnd > firstStart && checkStart > 0 && checkEnd > checkStart);
const observe = new AsyncFunction(
  "page",
  "report",
  "NodeAssert",
  "approvedPrivacyClauses",
  driver.slice(firstStart, firstEnd),
);
const check = new AsyncFunction(
  "page",
  "report",
  "session",
  "NodeAssert",
  "approvedPrivacyClauses",
  driver.slice(checkStart, checkEnd),
);
function pageFor(text) {
  return {
    url: () => "t3code://app/#/welcome",
    getByRole() {
      return {
        innerText: async () => text,
        locator() {
          return {
            filter({ hasText }) {
              return {
                count: async () => (text.includes(hasText) ? 1 : 0),
                first() {
                  return this;
                },
                waitFor: async () => {
                  NodeAssert.ok(text.includes(hasText));
                },
                innerText: async () => text,
              };
            },
          };
        },
      };
    },
    locator() {
      return {
        ...this.getByRole().locator(),
        getAttribute: async () => "zh-CN",
        innerText: async () => text,
      };
    },
  };
}
let count = 0;
for (const [source, translation] of Object.entries(map)) {
  const report = {};
  await observe(pageFor(source + " privacy policy."), report, NodeAssert, map);
  NodeAssert.equal(report.privacy_observation.source_clause, source);
  NodeAssert.equal(report.privacy_observation.expected_translation, translation);
  const session = {};
  await check(pageFor(translation + " 隐私政策"), report, session, NodeAssert, map);
  NodeAssert.deepEqual(session.privacy_clause, { source, expected: translation, visible: true });
  count++;
  // Same fixed observation survives restart unchanged.
  await check(pageFor(translation + " 隐私政策"), report, {}, NodeAssert, map);
  count++;
  const other = Object.values(map).find((t) => t !== translation);
  await NodeAssert.rejects(check(pageFor(other + " 隐私政策"), report, {}, NodeAssert, map));
  count++;
  await NodeAssert.rejects(check(pageFor(translation + " " + other), report, {}, NodeAssert, map));
  count++;
  for (const english of Object.keys(map)) {
    await NodeAssert.rejects(
      check(pageFor(translation + " " + english), report, {}, NodeAssert, map),
    );
    count++;
  }
}
await NodeAssert.rejects(observe(pageFor(Object.keys(map).join(" ")), {}, NodeAssert, map));
count++;
await NodeAssert.rejects(observe(pageFor("Unknown copy"), {}, NodeAssert, map));
count++;
console.log(
  `${count} actual-JavaScript privacy snippet cases passed; DOM stubs only, no app execution`,
);

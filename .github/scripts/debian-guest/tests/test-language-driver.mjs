// Exercise the actual packaged driver helper, not a replacement implementation.
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
const driver = fs.readFileSync(new URL("../check-debian-cjk-ui.mjs", import.meta.url), "utf8");
const start = driver.indexOf("async function languageControl(locale) {");
const end = driver.indexOf("async function assertChinese(session) {", start);
assert.ok(start >= 0 && end > start);
const makeControl = new Function("page", driver.slice(start, end) + "return languageControl;");
for (const locale of ["en", "zh-CN"]) {
  const calls = [];
  const control = { waitFor: async (value) => calls.push(["visible", value]) };
  const select = makeControl({
    locator(selector) {
      assert.equal(selector, "#language");
      return {
        scrollIntoViewIfNeeded: async () => calls.push(["scroll"]),
        getByRole(role, options) {
          assert.equal(role, "combobox");
          assert.deepEqual(options, { name: locale === "en" ? "Language" : "语言", exact: true });
          calls.push(["locate"]);
          return control;
        },
      };
    },
  });
  assert.equal(await select(locale), control);
  assert.deepEqual(calls, [["scroll"], ["locate"], ["visible", { state: "visible" }]]);
}
// Missing/newly renamed controls must still reject, not fall back to a broad combobox.
await assert.rejects(
  makeControl({
    locator: () => ({
      scrollIntoViewIfNeeded: async () => {},
      getByRole: () => ({
        waitFor: async () => {
          throw new Error("missing Language control");
        },
      }),
    }),
  })("en"),
  /missing Language control/,
);
const panels = fs.readFileSync(
  new URL("../../../../apps/web/src/components/settings/SettingsPanels.tsx", import.meta.url),
  "utf8",
);
assert.ok(panels.includes('{...setting("language")}'));
assert.ok(panels.includes('aria-label={gt("Language")}'));
const en = JSON.parse(
  fs.readFileSync(
    new URL("../../../../apps/web/src/i18n/translations/en.json", import.meta.url),
    "utf8",
  ),
);
const zh = JSON.parse(
  fs.readFileSync(
    new URL("../../../../apps/web/src/i18n/translations/zh.json", import.meta.url),
    "utf8",
  ),
);
const key = Object.keys(en).find((key) => en[key] === "Language");
assert.equal(zh[key], "语言");
const locales = fs.readFileSync(
  new URL("../../../../packages/client-runtime/src/locales.ts", import.meta.url),
  "utf8",
);
assert.ok(locales.includes('zh: "中文（简体）"'));
assert.equal(
  (driver.match(/getByRole\("option", \{ name: "中文（简体）", exact: true \}\)/g) ?? []).length,
  2,
);
assert.match(
  driver,
  /NodeAssert\.equal\(\s*\(await control\.innerText\(\)\)\.trim\(\),\s*"中文（简体）"/,
);
assert.ok(driver.includes('document.documentElement.lang === "zh-CN"'));
assert.ok(!driver.includes('name: "App language"') && !driver.includes('name: "应用语言"'));
console.log("Actual language driver helper and source bindings passed; not packaged UI execution");

// Navigation semantics must follow the actual accessible sidebar, not old tree roles.
const nav = fs.readFileSync(
  new URL("../../../../apps/web/src/components/settings/SettingsSidebarNav.tsx", import.meta.url),
  "utf8",
);
assert.ok(nav.includes('aria-current={isActive ? "page" : undefined}'));
assert.ok(nav.includes("data-settings-section={to}"));
assert.ok(driver.includes('getByRole("button", { name, exact: true })'));
assert.equal((driver.match(/\[aria-current="page"\]/g) ?? []).length, 2);
assert.ok(!driver.includes('getByRole("treeitem"') && !driver.includes('aria-selected="true"'));
assert.equal(en["2632f324dc2d9c48"], "Agents");
assert.equal(zh["2632f324dc2d9c48"], "智能体");
assert.ok(driver.includes('["智能体", "代码", "连接"]'));
console.log(
  "Current button/active-page navigation and preserved Agents translation bindings passed",
);

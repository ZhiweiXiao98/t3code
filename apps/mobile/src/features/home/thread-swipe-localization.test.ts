// @effect-diagnostics nodeBuiltinImport:off - checks translation wiring against the production swipe entrypoints.
import * as NodeFS from "node:fs";
import { expect, it } from "vite-plus/test";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString } from "../../i18n/mobileStrings";

it("wires localized swipe labels at each actual entrypoint and preserves opaque titles", () => {
  const source = [
    new URL("./thread-swipe-actions.tsx", import.meta.url),
    new URL("../archive/ArchivedThreadsScreen.tsx", import.meta.url),
    new URL("../threads/thread-list-v2-items.tsx", import.meta.url),
  ]
    .map((url) => NodeFS.readFileSync(url, "utf8"))
    .join("\n");
  const cases = [
    ["Delete {0}", "删除 {0}"],
    ["Unarchive {0}", "取消归档 {0}"],
    ["Discard {0}", "放弃 {0}"],
    ["Archive {0}", "归档 {0}"],
    ["Wake {0} now", "立即唤醒 {0}"],
    ["Un-settle {0}", "恢复任务 {0}"],
    ["Settle {0}", "收起 {0}"],
    ["Choose when to snooze {0}", "选择暂缓 {0} 的时间"],
  ] as const;
  for (const [template, translated] of cases) {
    expect(source).toContain(JSON.stringify(template));
    for (const title of ["Settings", "{0}", "$&", "Settings {0} $&"]) {
      expect(formatMobileMessage(template, [title], "zh-CN")).toBe(
        translated.replace("{0}", () => title),
      );
      expect(formatMobileMessage(template, [title], "en")).toBe(
        template.replace("{0}", () => title),
      );
    }
  }
  expect(source).toContain(
    'accessibilityLabel: formatMobileMessage("Delete {0}", [input.threadTitle])',
  );
  expect(source).toContain(
    'accessibilityLabel: formatMobileMessage("Unarchive {0}", [props.thread.title])',
  );
  expect(source).toMatch(/title: environment.label,\s+localize: false/);
  expect(source).toContain('formatMobileMessage(isDraft ? "Discard {0}" : "Delete {0}", [');
  for (const template of [
    "Archive {0}",
    "Wake {0} now",
    "Un-settle {0}",
    "Settle {0}",
    "Choose when to snooze {0}",
  ]) {
    expect(source).toContain(
      `accessibilityLabel: formatMobileMessage("${template}", [thread.title])`,
    );
  }
});

it("covers singular/plural shelves and both disclosure directions", () => {
  const source = NodeFS.readFileSync(
    new URL("../threads/thread-list-v2-items.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toMatch(/accessibilityLabel: formatMobileMessage\(\s+`\{0\} \$\{props.kind\}/);
  expect(source).toMatch(/accessibilityHint: localizeMobileString\(\s+`\$\{props.expanded/);
  expect(source).toContain("const label = localizeMobileString(SHELF_LABEL[props.kind])");
  for (const [kind, translated] of [
    ["working", "运行中"],
    ["snoozed", "已暂缓"],
    ["settled", "已结束"],
  ] as const) {
    for (const count of [0, 1, 2]) {
      const template = `{0} ${kind} ${count === 1 ? "thread" : "threads"}`;
      expect(formatMobileMessage(template, [count], "zh-CN")).toBe(`${count} 个${translated}对话`);
      expect(formatMobileMessage(template, [count], "en")).toBe(
        template.replace("{0}", String(count)),
      );
    }
    for (const [verb, expected] of [
      ["Collapses", "折叠"],
      ["Expands", "展开"],
    ] as const) {
      const template = `${verb} the ${kind} threads.`;
      expect(localizeMobileString(template, "zh-CN")).toBe(`${expected}${translated}对话。`);
      expect(localizeMobileString(template, "en")).toBe(template);
    }
  }
});

it("covers read-only, draft, queued and every primary action with or without snooze", () => {
  const source = NodeFS.readFileSync(
    new URL("../threads/thread-list-v2-items.tsx", import.meta.url),
    "utf8",
  );
  const fixedHints = [
    [
      "Opens the draft in the new task composer. Swipe left to discard.",
      "在新任务编辑器中打开草稿。向左滑动以放弃。",
    ],
    [
      "Sends when the environment reconnects. Opens the task for editing. Swipe left to delete.",
      "环境重新连接后发送。打开任务进行编辑。向左滑动以删除。",
    ],
    ["Opens the thread", "打开对话"],
  ] as const;
  for (const [hint, translated] of fixedHints) {
    expect(source).toContain(JSON.stringify(hint));
    expect(localizeMobileString(hint, "zh-CN")).toBe(translated);
    expect(localizeMobileString(hint, "en")).toBe(hint);
  }
  for (const [action, translated] of [
    ["Archive", "归档"],
    ["Wake", "唤醒"],
    ["Un-settle", "恢复任务"],
    ["Settle", "收起"],
  ] as const) {
    for (const snooze of [false, true]) {
      const template = snooze
        ? "Opens the thread. Swipe left for {0} and snooze actions."
        : "Opens the thread. Swipe left to {0}.";
      expect(source).toContain(`formatMobileMessage("${template}", [`);
      expect(
        formatMobileMessage(
          template,
          [localizeMobileString(action, "zh-CN").toLowerCase()],
          "zh-CN",
        ),
      ).toBe(
        snooze
          ? `打开对话。向左滑动以使用${translated}和暂缓操作。`
          : `打开对话。向左滑动以${translated}。`,
      );
      expect(
        formatMobileMessage(template, [localizeMobileString(action, "en").toLowerCase()], "en"),
      ).toBe(template.replace("{0}", action.toLowerCase()));
    }
  }
});

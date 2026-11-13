import {
  presentPendingBackgroundWork,
  presentProviderGoal,
} from "@t3tools/client-runtime/state/thread-execution";
import { formatMobileMessage } from "./mobileDisplayStrings";
import { localizeMobileString } from "./mobileStrings";
import { projectCloneProgressSummary, type ProjectCloneSnapshot } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import {
  mobileCloneProgress,
  mobileOutputFailure,
  mobileSharedContentPrompt,
  mobileSkippedThreadWarning,
} from "./threadDisplayMessages";

it("keeps clone detail and percentages intact while translating finite stages and stall state", () => {
  for (const stage of ["connecting", "counting", "receiving", "resolving", "checkout"] as const) {
    for (const stalled of [true, false]) {
      const snapshot: Pick<ProjectCloneSnapshot, "stage" | "percent" | "detail" | "stalled"> = {
        stage,
        stalled,
        percent: 27,
        detail: "Settings/{0}/$&",
      };
      const before = JSON.stringify(snapshot);
      expect(mobileCloneProgress(snapshot, "en")).toBe(projectCloneProgressSummary(snapshot));
      const result = mobileCloneProgress(snapshot, "zh-CN");
      expect(result).toContain("27%");
      expect(result).toContain(stalled ? "已停滞" : snapshot.detail);
      expect(result).not.toContain(stage);
      expect(JSON.stringify(snapshot)).toBe(before);
    }
  }
});

it("preserves foreign diagnostics and quoted thread titles instead of translating matching words", () => {
  for (const text of ["Settings", "Title", "Open/{0}/$&", 'thread"name']) {
    expect(mobileOutputFailure(text, "en")).toBe(`Couldn't load output: ${text}`);
    expect(mobileOutputFailure(text, "zh-CN")).toBe(`无法加载输出：${text}`);
    expect(mobileSkippedThreadWarning([text], "en")).toBe(`"${text}" is on another machine.`);
    expect(mobileSkippedThreadWarning([text], "zh-CN")).toBe(`"${text}" 位于另一台机器上。`);
    expect(mobileSkippedThreadWarning([text, "Open"], "en")).toBe(
      `"${text}", "Open" are on another machine.`,
    );
  }
});

it("chooses shared-content instructions from attachment count and type without changing attachments", () => {
  for (const [attachments, english, chinese] of [
    [[], "Choose a project for what you shared", "为分享的内容选择项目"],
    [[{ type: "image" }], "Choose a project for the image you shared", "为分享的图片选择项目"],
    [[{ type: "file" }], "Choose a project for the file you shared", "为分享的文件选择项目"],
    [
      [{ type: "image" }, { type: "image" }],
      "Choose a project for the 2 images you shared",
      "为分享的 2 张图片选择项目",
    ],
    [
      [{ type: "image" }, { type: "file" }],
      "Choose a project for the 2 files you shared",
      "为分享的 2 个文件选择项目",
    ],
  ] as const) {
    const before = JSON.stringify(attachments);
    expect(mobileSharedContentPrompt(attachments, "en")).toBe(english);
    expect(mobileSharedContentPrompt(attachments, "zh-CN")).toBe(chinese);
    expect(JSON.stringify(attachments)).toBe(before);
  }
});

it("localizes background states without changing real descriptions or task ordering", () => {
  const display = (template: string, values: readonly string[]) =>
    formatMobileMessage(template, values, "zh-CN");
  for (const kind of ["subagent", "command", "monitor", "background_task"] as const) {
    const tasks = [{ taskId: kind, kind, description: "Settings" }];
    const original = JSON.stringify(tasks);
    const result = presentPendingBackgroundWork(tasks, display);
    expect(result?.items[0]?.label).toBe("Settings");
    expect(result?.title).toMatch(/^(等待中|运行中) · Settings$/);
    expect(JSON.stringify(tasks)).toBe(original);
  }
  expect(
    presentPendingBackgroundWork(
      [{ taskId: "same", kind: "command", description: "command" }],
      display,
    )?.title,
  ).toBe("运行中 · command");
  expect(
    presentPendingBackgroundWork(
      [{ taskId: "same-agent", kind: "subagent", description: "subagent" }],
      display,
    )?.title,
  ).toBe("等待中 · subagent");
  expect(presentPendingBackgroundWork([{ taskId: "none", kind: "command" }], display)?.title).toBe(
    "正在运行命令",
  );
  const many = presentPendingBackgroundWork(
    [
      { taskId: "monitor", kind: "monitor" },
      { taskId: "command", kind: "command", awaited: true },
    ],
    display,
  );
  expect(many?.items.map((item) => item.taskId)).toEqual(["command", "monitor"]);
  expect(many?.title).toBe("正在等待1 个命令和1 个监视器");
});

it("translates finite goal states while keeping the goal text and metrics unchanged", () => {
  for (const status of [
    "active",
    "paused",
    "blocked",
    "usage_limited",
    "budget_limited",
    "complete",
  ] as const) {
    const goal = { status, objective: "Settings {0}", tokensUsed: 1200, checks: 3 };
    const base = presentProviderGoal(goal, false);
    const result = presentProviderGoal(goal, false, (title) =>
      localizeMobileString(title, "zh-CN"),
    );
    expect(result.title).not.toBe(base.title);
    expect(result.objective).toBe(goal.objective);
    expect(result.usage).toBe(base.usage);
    expect(result.canResume).toBe(base.canResume);
  }
});

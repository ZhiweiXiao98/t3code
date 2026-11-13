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

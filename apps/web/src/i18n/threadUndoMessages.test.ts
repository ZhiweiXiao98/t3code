import { describe, expect, it } from "vite-plus/test";
import {
  threadUndoFailureTitle,
  threadUndoShortcutLabel,
  threadUndoSummary,
} from "./threadUndoMessages";

describe("thread undo presentation", () => {
  it("preserves English plurals and renders every action in both compact and spoken summaries", () => {
    for (const [action, chinese] of [
      ["Settled", "已结束"],
      ["Snoozed", "已延后"],
      ["Unpinned", "已取消置顶"],
      ["Archived", "已归档"],
      ["Discarded", "已丢弃"],
    ] as const) {
      for (const count of [1, 2]) {
        const notice = { action, count };
        const noun = action === "Discarded" ? "draft" : "thread";
        expect(threadUndoSummary("en", notice)).toBe(
          `${action} ${count} ${noun}${count === 1 ? "" : "s"}`,
        );
        expect(threadUndoSummary("zh-CN", notice)).toBe(
          `${chinese} ${count} 个${action === "Discarded" ? "草稿" : "会话"}`,
        );
        expect(threadUndoSummary("en", notice, true)).toBe(
          count === 1 ? action : `${action} ${count}`,
        );
        expect(threadUndoSummary("zh-CN", notice, true)).toBe(
          count === 1 ? chinese : `${chinese} ${count}`,
        );
      }
    }
  });
  it("preserves opaque shortcuts and unknown failure titles", () => {
    const shortcut = "⌘+{shortcut}/$&/中文";
    expect(threadUndoShortcutLabel("en", shortcut)).toBe(`${shortcut} to undo`);
    expect(threadUndoShortcutLabel("zh-CN", shortcut)).toBe(`按 ${shortcut} 撤销`);
    expect(threadUndoShortcutLabel("en", null)).toBe("Undo");
    expect(threadUndoShortcutLabel("zh-CN", undefined)).toBe("撤销");
    for (const [source, chinese] of [
      ["Failed to undo archive", "无法撤销归档"],
      ["Failed to undo unpin", "无法撤销取消置顶"],
      ["Failed to undo settle", "无法撤销结束会话"],
      ["Failed to wake thread", "无法唤醒会话"],
      ["Failed to restore draft", "无法恢复草稿"],
    ] as const) {
      expect(threadUndoFailureTitle("en", source)).toBe(source);
      expect(threadUndoFailureTitle("zh-CN", source)).toBe(chinese);
    }
    expect(threadUndoFailureTitle("zh-CN", "Settings")).toBe("Settings");
  });
});

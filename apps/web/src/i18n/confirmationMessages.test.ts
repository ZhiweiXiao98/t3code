import { describe, expect, it } from "vite-plus/test";
import {
  browserCloseMessage,
  projectRemovalMessage,
  terminalCloseMessage,
} from "./confirmationMessages";
import { translateWebMessage } from "./messages";

describe("localized confirmation boundaries", () => {
  it("preserves names, paths and placeholder-like data while retaining consequences", () => {
    const opaque = 'Settings/{name}/$&/"quoted"\n路径';
    for (const locale of ["en", "zh-CN"] as const) {
      expect(terminalCloseMessage(locale, [opaque])).toBe(
        locale === "en"
          ? `Close terminal "${opaque}"?\nThis stops the running process and clears its history.`
          : `关闭终端“${opaque}”？\n这将停止正在运行的进程并清除其历史记录。`,
      );
      expect(terminalCloseMessage(locale, [opaque, "Other"])).toBe(
        locale === "en"
          ? `Close 2 terminals?\nThis stops their running processes and clears their histories: "${opaque}", "Other".`
          : `关闭 2 个终端？\n这将停止以下终端中正在运行的进程并清除其历史记录："${opaque}", "Other"。`,
      );
      expect(translateWebMessage(locale, "audit5.removeImage", { name: opaque })).toBe(
        locale === "en"
          ? `Remove ${opaque} from the message?\nIt is referenced in your text; removing it also removes every reference.`
          : `从消息中移除 ${opaque}？\n正文中引用了此图片；移除图片也会移除所有引用。`,
      );
      expect(translateWebMessage(locale, "audit5.worktree", { path: opaque })).toBe(
        locale === "en"
          ? `This thread is the only one linked to this worktree:\n${opaque}\n\nDelete the worktree too?`
          : `此会话是唯一关联到以下工作树的会话：\n${opaque}\n\n同时删除该工作树？`,
      );
      expect(translateWebMessage(locale, "audit5.unpin", { title: opaque })).toContain(opaque);
      expect(translateWebMessage(locale, "audit5.deleteSession", { name: opaque })).toContain(
        opaque,
      );
      expect(translateWebMessage(locale, "audit5.disableProvider", { id: opaque })).toContain(
        opaque,
      );
    }
    const plan = {
      targetKind: "checkout",
      targetLabel: opaque,
      threadCount: 7,
      isWholeGroup: false,
      confirmationMessage: "original",
    };
    const translated = projectRemovalMessage(
      "zh-CN",
      plan,
      [{ workspaceRoot: opaque, environmentLabel: opaque }],
      false,
    );
    expect(translated).toContain(`移除检出目录“${opaque}”并删除其中的 7 个会话？`);
    expect(translated.split(opaque)).toHaveLength(4);
    expect(translated).toContain("这些会话及所有已归档会话将从 T3 Code 中删除。提供方会话将保留。");
    expect(projectRemovalMessage("en", plan, [], false)).toBe("original");
  });
  it("preserves the singular and plural browser interruption warnings", () => {
    expect(browserCloseMessage("en", 1)).toBe(
      "Close browser while the agent is using it?\nThe agent is actively controlling this browser. Closing it may interrupt the current browser action.",
    );
    expect(browserCloseMessage("en", 2)).toBe(
      "Close 2 browsers while the agent is using them?\nThe agent is actively controlling these browsers. Closing them may interrupt the current browser actions.",
    );
    expect(browserCloseMessage("zh-CN", 1)).toBe(
      "在 Agent 正在使用浏览器时关闭它？\nAgent 正在控制此浏览器。关闭它可能会中断当前的浏览器操作。",
    );
    expect(browserCloseMessage("zh-CN", 2)).toBe(
      "在 Agent 正在使用这些浏览器时关闭 2 个浏览器？\nAgent 正在控制这些浏览器。关闭它们可能会中断当前的浏览器操作。",
    );
  });
});

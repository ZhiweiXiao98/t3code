import { describe, expect, it } from "vite-plus/test";

import { resolveConfirmDialogCopy } from "./ConfirmDialogHost";

describe("resolveConfirmDialogCopy", () => {
  it("recognizes a full-width Chinese question mark as the title boundary", () => {
    expect(
      resolveConfirmDialogCopy("要删除任务“修复登录”吗？\n这会永久清除此任务的对话记录。"),
    ).toEqual({
      title: "要删除任务“修复登录”吗？",
      description: "这会永久清除此任务的对话记录。",
    });
  });

  it("uses localized fallback copy when the message is empty", () => {
    expect(
      resolveConfirmDialogCopy("", {
        title: "确认操作",
        description: "此操作需要你的确认。",
      }),
    ).toEqual({
      title: "确认操作",
      description: "此操作需要你的确认。",
    });
  });
});

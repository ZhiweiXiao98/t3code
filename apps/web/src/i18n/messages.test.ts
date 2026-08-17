import { describe, expect, it } from "vite-plus/test";

import { translateWebMessage } from "./messages";

describe("translateWebMessage", () => {
  it("uses English as the complete baseline catalog", () => {
    expect(translateWebMessage("en", "sidebar.newThread")).toBe("New thread");
  });

  it("interpolates values in Simplified Chinese messages", () => {
    expect(
      translateWebMessage("zh-CN", "pairing.hosted.saved", {
        environment: "Local dev",
      }),
    ).toBe("Local dev 已保存在此浏览器中。");
  });

  it("interpolates task titles in localized destructive confirmations", () => {
    expect(
      translateWebMessage("zh-CN", "sidebar.confirmDeleteThread", {
        title: "修复登录",
      }),
    ).toBe("要删除任务“修复登录”吗？");
  });

  it("keeps provider names and versions unchanged in localized update notices", () => {
    expect(
      translateWebMessage("zh-CN", "providerUpdate.title.single", {
        provider: "Claude",
        version: "v2.1.232",
      }),
    ).toBe("可用更新：Claude v2.1.232");
  });

  it("localizes the user-facing settings details selected for review", () => {
    expect(translateWebMessage("zh-CN", "settings.general.autoSettleDays.title")).toBe(
      "自动收起前的无活动天数",
    );
    expect(translateWebMessage("zh-CN", "providers.healthCheck.title")).toBe("健康检查间隔");
    expect(translateWebMessage("zh-CN", "sourceControl.versionControl")).toBe("版本控制");
  });

  it("localizes dialog copy while preserving technical values", () => {
    expect(translateWebMessage("zh-CN", "projectAction.dialog.addTitle")).toBe("添加操作");
    expect(
      translateWebMessage("zh-CN", "sshPassword.description", {
        target: "dev@192.168.1.8",
      }),
    ).toContain("dev@192.168.1.8");
    expect(
      translateWebMessage("zh-CN", "gitDialog.publish.publishedDescription", {
        branch: "feature/i18n-zh-cn",
        provider: "GitHub",
      }),
    ).toBe("feature/i18n-zh-cn 现已发布到 GitHub。");
    expect(
      translateWebMessage("zh-CN", "pullRequestConfirm.mergeDescription", {
        number: 42,
        method: "squash",
      }),
    ).toBe("将使用 squash 合并 #42。");
    expect(translateWebMessage("zh-CN", "composer.banner.settledTitle")).toBe("此任务已收起");
  });
});

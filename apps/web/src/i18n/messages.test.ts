import { describe, expect, it } from "vite-plus/test";

import { translateWebMessage, translateWebSource } from "./messages";

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
    expect(translateWebMessage("zh-CN", "settings.integrations.browser.title")).toBe("浏览器");
    expect(translateWebMessage("zh-CN", "settings.integrations.browserDefaultViewport.fill")).toBe(
      "填满面板",
    );
    expect(
      translateWebMessage("zh-CN", "settings.integrations.browserDefaultViewport.rotateTo", {
        orientation: "横向",
      }),
    ).toBe("旋转为横向");
    expect(translateWebSource("zh-CN", "No actions configured.")).toBe("尚未配置操作。");
    expect(translateWebSource("zh-CN", "Project agent browser access")).toBe(
      "项目 Agent 浏览器访问权限",
    );
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
    expect(translateWebMessage("zh-CN", "contextWindow.title")).toBe("上下文窗口");
    expect(
      translateWebMessage("zh-CN", "composer.compaction.native.question", {
        age: "2 小时 5 分钟",
        tokens: "250,000",
      }),
    ).toBe("此会话已有 2 小时 5 分钟，当前使用 250,000 个令牌。是否先压缩再继续？");
    expect(translateWebMessage("zh-CN", "providers.config.autoCompactWindow")).toBe(
      "达到以下用量后自动压缩",
    );
  });
});

describe("upstream UI localization", () => {
  it("localizes new queue, permission and scoped-settings copy", () => {
    expect(translateWebSource("zh-CN", "Queue message")).toBe("将消息加入队列");
    expect(translateWebSource("zh-CN", "App permission approval")).toBe("应用权限审批");
    expect(translateWebSource("zh-CN", "Restore device defaults")).toBe("恢复此设备的默认设置");
    expect(translateWebSource("en", "Queue message")).toBe("Queue message");
  });

  it("preserves user-provided project names and counts in new upstream controls", () => {
    expect(
      translateWebMessage("zh-CN", "upstream.sidebar.projectFilter", { project: "feature/API-v2" }),
    ).toBe("按 feature/API-v2 筛选");
    expect(
      translateWebMessage("zh-CN", "upstream.comments.olderBots", { count: 20, hidden: 42 }),
    ).toBe("显示较早的 20 条机器人评论（隐藏了 42 条）");
  });
});

describe("v0.0.45 UI localization", () => {
  it("preserves project paths, environment names, and errors in new project messages", () => {
    expect(
      translateWebMessage("zh-CN", "newProject.createsPath", {
        path: "C:\\Users\\dev\\API-v2",
      }),
    ).toBe("将创建 C:\\Users\\dev\\API-v2");
    expect(
      translateWebMessage("zh-CN", "newProject.createdWithoutCommit", { name: "API-v2" }),
    ).toBe("已创建 API-v2，但未完成首次提交");
    expect(
      translateWebMessage("zh-CN", "newProject.onEnvironment", { environment: "dev@host" }),
    ).toBe("（dev@host）");
    expect(
      translateWebMessage("zh-CN", "newProject.gitHubErrorDescription", { error: "HTTP 403" }),
    ).toBe("HTTP 403 可在 Git 菜单中选择“发布仓库”重试。");
    expect(translateWebMessage("en", "newProject.createShortcut")).toBe("Create (Enter)");
  });

  it("localizes the Working setting through source-text settings search and restore", () => {
    expect(translateWebSource("zh-CN", "Working section (beta)")).toBe("进行中分区（测试版）");
    expect(translateWebSource("zh-CN", "Working section")).toBe("进行中分区");
    expect(
      translateWebSource(
        "zh-CN",
        "Automatically resume interrupted threads after an update, crash, or machine restart on the selected environments.",
      ),
    ).toBe("在所选环境更新、崩溃或设备重启后，自动恢复被中断的任务。");
    expect(translateWebMessage("zh-CN", "sidebar.working", { count: 3 })).toBe("进行中（3）");
  });

  it("localizes new screen-reader labels without changing English fallback", () => {
    expect(translateWebMessage("zh-CN", "composer.menu.label.paths")).toBe("文件和文件夹");
    expect(translateWebMessage("zh-CN", "composer.messageLabel")).toBe("消息");
    expect(translateWebMessage("zh-CN", "composer.traits.ultrafastModeOn")).toBe("已开启极速模式");
    expect(translateWebMessage("en", "composer.menu.label.commands")).toBe("Commands");
  });
});

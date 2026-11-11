import { welcomePrivacyClause } from "./welcomePrivacyClause";

import { describe, expect, it } from "vite-plus/test";

import { translateWebMessage, translateWebSource } from "./messages";

describe("translateWebMessage", () => {
  it("localizes both privacy clauses selected by the onboarding telemetry policy", () => {
    expect(welcomePrivacyClause("zh-CN", false)).toBe("如需退出，请参阅");
    expect(welcomePrivacyClause("zh-CN", true)).toBe("请参阅");
    expect(welcomePrivacyClause("en", false)).toBe("To opt out, see the");
    expect(welcomePrivacyClause("en", true)).toBe("See the");
  });

  it("localizes shared account and settings controls without changing English", () => {
    for (const [source, chinese] of [
      ["Use in another app (MCP)", "在其他应用中使用（MCP）"],
      ["New thread each run", "每次运行新建会话"],
      ["One thread, continuing the conversation", "使用同一会话，继续之前的对话"],
      ["One thread, fresh session each run", "使用同一会话，每次运行开启全新会话上下文"],
      ["Started by the first run", "首次运行时创建"],
      ["Destination thread", "目标会话"],
      ["Search all threads...", "搜索所有会话..."],
      ["No threads found.", "未找到会话。"],
      ["Untitled thread", "未命名会话"],
      ["Thread {id}", "会话 {id}"],
      [
        "The first run starts a thread with the workspace and model below. Later runs continue that conversation.",
        "首次运行使用下方工作区和模型创建会话，后续运行继续该对话。",
      ],
      [
        "The first run starts a thread with the workspace and model below. Later runs post there, each in a fresh session without earlier runs' context.",
        "首次运行使用下方工作区和模型创建会话。后续运行仍在该会话中进行，但每次都使用全新上下文，不包含之前运行的内容。",
      ],
      [
        "Each run starts a fresh session in this thread, without earlier runs' context.",
        "每次运行都在此会话中开启全新上下文，不包含之前运行的内容。",
      ],
      ["Deleting the thread also deletes this task.", "删除此会话也会删除该定时任务。"],

      [
        "T3 Code collects anonymous usage data to improve the app.",
        "T3 Code 会收集匿名使用数据，以改进应用。",
      ],
      ["Continue with ChatGPT", "使用 ChatGPT 继续"],
      ["Reconnect ChatGPT", "重新连接 ChatGPT"],
      ["Any local files", "任何本地文件"],
      ["Last selected", "上次选择"],
      ["Queue", "排队"],
      ["Blue & orange", "蓝色和橙色"],
      ["Collapsed", "折叠"],
      ["Clone into host folders", "按主机名分目录克隆"],
      [
        "Clones go to github.com/owner/repo under the folder above, like ghq.",
        "克隆的仓库按 github.com/owner/repo 结构存放在上述目录下，与 ghq 类似。",
      ],
      [
        "Default model for new threads, selected automatically. Projects can override it.",
        "新任务默认使用自动选择的模型，项目可以单独覆盖。",
      ],
      [
        "Default permissions for new threads. Projects can override them.",
        "新任务的默认权限，项目可以单独覆盖。",
      ],
      [
        "Where new threads start. Projects and their t3.json can override it.",
        "新任务的起始位置，项目设置及其 t3.json 可以覆盖此项。",
      ],
      ["Model for new threads in this project.", "此项目中新任务使用的模型。"],
      ["Permissions for new threads in this project.", "此项目中新任务的权限。"],
      ["Where new threads in this project start.", "此项目中新任务的起始位置。"],
    ]) {
      expect(translateWebSource("zh-CN", source!)).toBe(chinese);
      expect(translateWebSource("en", source!)).toBe(source);
    }
  });

  it("preserves account identifiers and setting names in translated notices", () => {
    expect(
      translateWebMessage("zh-CN", "settings.followUps.multilineDescription", {
        singleShortcut: "⌘ + Enter",
        multilineShortcut: "⌘ + Shift + Enter",
      }),
    ).toBe(
      "Agent 运行时，可将追加消息排队或用于引导当前运行。单行提示按 ⌘ + Enter，多行提示按 ⌘ + Shift + Enter，可对此条消息使用另一种方式。",
    );

    expect(
      translateWebMessage("zh-CN", "sourceControl.accounts.accountForHost", {
        provider: "GitHub",
        host: "git.example.org",
      }),
    ).toBe("git.example.org 的 GitHub 账号");
    expect(
      translateWebMessage("en", "sourceControl.accounts.accountForHost", {
        provider: "GitHub",
        host: "git.example.org",
      }),
    ).toBe("GitHub account for git.example.org");
    expect(
      translateWebMessage("zh-CN", "sourceControl.tokens.noneSaved", {
        variable: "GH_TOKEN",
        cli: "gh",
      }),
    ).toBe("尚未保存令牌；服务器使用 GH_TOKEN 或 gh 登录账号。");
    expect(
      translateWebMessage("zh-CN", "settings.scope.requiresSupported", {
        setting: "自动收起任务",
      }),
    ).toBe("“自动收起任务”需要受支持的环境。请选择一个环境以继续。");
    expect(
      translateWebMessage("zh-CN", "storage.cleanup.moreResults", {
        environment: "My Linux",
        count: "1,234",
      }),
    ).toBe("My Linux：另有 1,234 条结果。");
  });

  it("preserves full-access approval exceptions and original English explanations", () => {
    expect(
      translateWebSource(
        "zh-CN",
        "Full access skips approvals, but an ask rule in the agent's own settings matches this action, so it still asks. Remove or narrow that rule to stop these prompts.",
      ),
    ).toBe(
      "完全访问会跳过审批，但 Agent 自身设置中的一条询问规则匹配了此操作，因此仍会询问。删除该规则或缩小其适用范围，即可停止这些提示。",
    );
    expect(
      translateWebSource(
        "en",
        "Full access skips approvals, but an ask rule in the agent's own settings matches this action, so it still asks. Remove or narrow that rule to stop these prompts.",
      ),
    ).toBe(
      "Full access skips approvals, but an ask rule in the agent's own settings matches this action, so it still asks. Remove or narrow that rule to stop these prompts.",
    );
    expect(
      translateWebSource(
        "zh-CN",
        "Full access skips approvals, but the agent still stops for a few safety checks of its own that no setting can skip, such as a delete whose path it can't verify. T3 Code can't turn these off, so check the request and approve it if it's what you expect.",
      ),
    ).toBe(
      "完全访问会跳过审批，但 Agent 仍会停下来进行少数自身安全检查；这些检查无法通过任何设置跳过，例如删除操作的路径无法验证时。T3 Code 无法关闭这些检查，请检查请求，确认符合预期后再批准。",
    );
    expect(
      translateWebSource(
        "en",
        "Full access skips approvals, but the agent still stops for a few safety checks of its own that no setting can skip, such as a delete whose path it can't verify. T3 Code can't turn these off, so check the request and approve it if it's what you expect.",
      ),
    ).toBe(
      "Full access skips approvals, but the agent still stops for a few safety checks of its own that no setting can skip, such as a delete whose path it can't verify. T3 Code can't turn these off, so check the request and approve it if it's what you expect.",
    );
  });

  it("uses English as the complete baseline catalog", () => {
    expect(translateWebMessage("en", "sidebar.newThread")).toBe("New thread");
  });

  it("interpolates values in Simplified Chinese messages", () => {
    expect(
      translateWebMessage("zh-CN", "pairing.hosted.saved", {
        environment: "Local dev",
      }),
    ).toBe("Local dev 已保存在此浏览器中。");
    const computers = "Open, Continue, 开发机";
    expect(translateWebMessage("en", "onboarding.skippedComputers", { computers })).toBe(
      `Skipped unavailable computers: ${computers}.`,
    );
    expect(translateWebMessage("zh-CN", "onboarding.skippedComputers", { computers })).toBe(
      `已跳过不可用的计算机：${computers}。`,
    );
  });

  it("interpolates task titles in localized destructive confirmations", () => {
    expect(
      translateWebMessage("zh-CN", "sideChat.deleteConfirmation", { title: "fix English title" }),
    ).toBe("删除旁支对话“fix English title”？");
    expect(translateWebMessage("en", "sideChat.deleteConfirmation", { title: "修复登录" })).toBe(
      'Delete side chat "修复登录"?',
    );
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
  it("localizes registry, account, permission and scheduled-task settings", () => {
    expect(translateWebSource("zh-CN", "Search ACP Registry")).toBe("搜索 ACP 注册表");
    expect(translateWebSource("zh-CN", "Provider sign-in terminal")).toBe("提供商登录终端");
    expect(translateWebSource("zh-CN", "Scheduled tasks")).toBe("定时任务");
    expect(translateWebSource("zh-CN", "Require signature")).toBe("要求签名");
    expect(translateWebSource("zh-CN", "Not granted")).toBe("未授予");
    expect(translateWebSource("zh-CN", "GH_TOKEN")).toBe("GH_TOKEN");
    expect(translateWebSource("en", "Scheduled tasks")).toBe("Scheduled tasks");
  });

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

describe("v0.1.3 incremental localization", () => {
  it("covers reorganized settings, guest sharing and title instructions", () => {
    expect(translateWebSource("zh-CN", "Sharing & access")).toBe("共享与访问");
    expect(translateWebSource("zh-CN", "Guest links")).toBe("访客链接");
    expect(translateWebSource("zh-CN", "Thread title instructions")).toBe("会话标题生成指令");
    expect(translateWebSource("zh-CN", "Open Environments")).toBe("打开环境");
    expect(translateWebSource("en", "Open Environments")).toBe("Open Environments");
  });

  it("keeps guest names and recovered thread titles intact", () => {
    expect(translateWebMessage("zh-CN", "guestShare.sendFrom", { name: "API-v3" })).toBe(
      "发送 API-v3 的消息",
    );
    expect(
      translateWebMessage("zh-CN", "chat.queuedEdit.threadSuffix", { title: "feature/API-v3" }),
    ).toBe("（会话“feature/API-v3”）");
    expect(translateWebMessage("zh-CN", "guestShare.waiting", { count: 3 })).toBe(
      "3 条访客消息待处理",
    );
  });
});

describe("source translation own-property lookup", () => {
  it("preserves prototype-property names as plain source strings in both locales", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      for (const source of ["constructor", "toString", "__proto__"]) {
        expect(translateWebSource(locale, source)).toBe(source);
      }
    }
  });

  it("retains known source translations, keyed fallback, and unknown text", () => {
    expect(translateWebSource("zh-CN", "Continue with ChatGPT")).toBe("使用 ChatGPT 继续");
    expect(translateWebSource("en", "Continue with ChatGPT")).toBe("Continue with ChatGPT");
    expect(translateWebSource("zh-CN", "Settings")).toBe("设置");
    expect(translateWebSource("zh-CN", "User_原文 /tmp/file.ts {count}")).toBe(
      "User_原文 /tmp/file.ts {count}",
    );
  });
});

describe("localized workflow details", () => {
  it("preserves user names, paths, and errors inside complete translated notices", () => {
    const source = "Ready";
    const environment = "My Mac / develop";
    const path = "/Users/name/Open/jiusheng-code";
    expect(translateWebMessage("zh-CN", "newProject.createsAt", { path })).toBe(`创建于 ${path}`);
    expect(translateWebMessage("en", "newProject.createsAt", { path })).toBe(`Creates ${path}`);
    expect(translateWebMessage("zh-CN", "settings.inheritedFrom", { environment })).toBe(
      `继承自 ${environment}`,
    );
    expect(translateWebMessage("zh-CN", "storage.database.lastFailure", { error: source })).toBe(
      "上次尝试失败：Ready",
    );
    expect(translateWebMessage("zh-CN", "secrets.removeUnused", { source })).toBe(
      "没有设置从 Ready 读取密钥。密钥本身不会被更改。",
    );
    expect(translateWebMessage("en", "secrets.removeUnused", { source })).toBe(
      "Nothing reads from Ready. The secrets themselves are untouched.",
    );
    expect(
      translateWebMessage("zh-CN", "device.discovery.incompleteMany", {
        platforms: "iOS 和 Android",
        environment,
      }),
    ).toBe(`${environment} 上的 iOS 和 Android 列表可能不完整。`);
    expect(translateWebMessage("zh-CN", "sidebar.snoozeFailedMany", { count: 2 })).toBe(
      "无法稍后处理 2 个任务",
    );
    expect(translateWebMessage("en", "sidebar.snoozeFailedMany", { count: 2 })).toBe(
      "Failed to snooze 2 threads",
    );
    expect(translateWebMessage("zh-CN", "sidebar.bulk.settleCount", { count: 2 })).toBe(
      "收起（2）",
    );
    expect(translateWebMessage("en", "sidebar.bulk.settleCount", { count: 2 })).toBe("Settle (2)");
  });
});

import { describe, expect, it } from "vite-plus/test";

import { localizeAlertArguments, localizeMobileString } from "./mobileStrings";

describe("mobile strings", () => {
  it("translates project creation and scratch-task copy", () => {
    const messages = {
      "New project": "新建项目",
      "Start a new Git repository from a name": "输入名称以创建新的 Git 仓库",
      "Project name": "项目名称",
      "Create private repository on GitHub": "在 GitHub 上创建私有仓库",
      "Create project": "创建项目",
      "Add existing project": "添加已有项目",
      "No project": "不关联项目",
      "Start a task without a project": "创建不关联项目的任务",
      "Start without a project": "不关联项目并开始",
      "What should we work on?": "我们来做些什么？",
      "Choose a project": "选择项目",
      "Opens the project picker": "打开项目选择器",
    };
    for (const [source, translated] of Object.entries(messages)) {
      expect(localizeMobileString(source, "zh-CN")).toBe(translated);
      expect(localizeMobileString(source, "en")).toBe(source);
    }
  });

  it("localizes new-task alerts and preserves machine names", () => {
    expect(
      localizeAlertArguments(
        "Could not switch machine",
        "It has not reached this device yet. Try again.",
        undefined,
        "zh-CN",
      ),
    ).toMatchObject({ title: "无法切换机器", message: "尚未同步到此设备，请重试。" });
    expect(localizeMobileString("Created without a first commit", "zh-CN")).toBe(
      "项目已创建，但未完成首次提交",
    );
    expect(localizeMobileString("Could not start without a project", "zh-CN")).toBe(
      "无法在不关联项目的情况下启动",
    );
    expect(localizeMobileString("Environment: Work Mac", "zh-CN")).toBe("环境：Work Mac");
    expect(localizeMobileString("on Settings", "zh-CN")).toBe("在 Settings 上");
  });

  it("translates the new shared usage and Cursor access copy", () => {
    expect(localizeMobileString("ChatGPT shared usage", "zh-CN")).toBe("ChatGPT 共享用量");
    expect(localizeMobileString("Manage usage", "zh-CN")).toBe("管理用量");
    expect(localizeMobileString("Enable Cursor usage from Work Mac", "zh-CN")).toBe(
      "启用 Work Mac 的 Cursor 用量统计",
    );
    expect(localizeMobileString("Enable on Work Mac", "zh-CN")).toBe("在 Work Mac 上启用");
    expect(localizeMobileString("no known rates · 20K tokens", "zh-CN")).toBe(
      "暂无已知费率 · 20K 个令牌",
    );
  });

  it("keeps English and technical values unchanged", () => {
    expect(localizeMobileString("Settings", "en")).toBe("Settings");
    expect(localizeMobileString("gpt-5.6-sol", "zh-CN")).toBe("gpt-5.6-sol");
    expect(localizeMobileString("feature/mobile-polish", "zh-CN")).toBe("feature/mobile-polish");
  });

  it("translates fixed messages while preserving surrounding whitespace", () => {
    expect(localizeMobileString("  Settings ", "zh-CN")).toBe("  设置 ");
    expect(localizeMobileString("No conversation yet", "zh-CN")).toBe("还没有对话");
    expect(localizeMobileString("Add Environment", "zh-CN")).toBe("添加环境");
    expect(localizeMobileString("Scan QR Code", "zh-CN")).toBe("扫描二维码");
  });

  it("translates dynamic thread states", () => {
    expect(localizeMobileString('No threads matching "docs".', "zh-CN")).toBe(
      "没有与“docs”匹配的任务。",
    );
    expect(localizeMobileString("Show more (3 settled hidden)", "zh-CN")).toBe(
      "显示更多（已隐藏 3 个已收起任务）",
    );
    expect(
      localizeMobileString(
        "This session is 2h 5m old and uses 250,000 tokens. Compact it before continuing?",
        "zh-CN",
      ),
    ).toBe("此会话已有 2 小时 5 分钟，当前使用 250,000 个令牌。是否先压缩再继续？");
    expect(localizeMobileString("Recording 1:04", "zh-CN")).toBe("正在录音 1:04");
    expect(localizeMobileString("Base branch: main", "zh-CN")).toBe("基础分支：main");
    expect(localizeMobileString("Switches to a new worktree", "zh-CN")).toBe("切换到新工作树");
    expect(localizeMobileString("New thread on feature/mobile", "zh-CN")).toBe(
      "基于 feature/mobile 新建任务",
    );
  });

  it("translates attachment and voice input controls", () => {
    expect(localizeMobileString("Photo Library", "zh-CN")).toBe("照片图库");
    expect(localizeMobileString("Choose Files", "zh-CN")).toBe("选择文件");
    expect(localizeMobileString("Preparing", "zh-CN")).toBe("正在准备");
    expect(localizeMobileString("Transcribing", "zh-CN")).toBe("正在转写");
  });

  it("translates usage limits and provider setup states", () => {
    expect(localizeMobileString("82% used", "zh-CN")).toBe("已使用 82%");
    expect(localizeMobileString("in 2h 5m", "zh-CN")).toBe("2 小时 5 分钟后");
    expect(localizeMobileString("Dismiss usage limits", "zh-CN")).toBe("关闭用量限额");
    expect(localizeMobileString("ahead of pace · resets in 2h 5m", "zh-CN")).toBe(
      "用量偏快 · 2 小时 5 分钟后重置",
    );
    expect(localizeMobileString("2 reset credits banked · next expires in 3d 4h", "zh-CN")).toBe(
      "有 2 个重置额度 · 下一额度将在 3 天 4 小时后过期",
    );
    expect(localizeMobileString("Set up Antigravity", "zh-CN")).toBe("设置 Antigravity");
    expect(localizeMobileString("Enabled. Installed 1.2.3", "zh-CN")).toBe("已启用 · 已安装 1.2.3");
  });

  it("translates workspace image and Codex feedback states", () => {
    expect(localizeMobileString("Loading image…", "zh-CN")).toBe("正在加载图片…");
    expect(
      localizeMobileString("Feedback sent to OpenAI.\n\nThread ID: `feedback-123`", "zh-CN"),
    ).toBe("反馈已发送给 OpenAI。\n\n任务 ID：`feedback-123`");
  });

  it("translates alert titles, messages, and button labels", () => {
    expect(
      localizeAlertArguments(
        "No open PR",
        "This branch does not have an open pull request.",
        [{ text: "Cancel" }, { text: "Confirm" }],
        "zh-CN",
      ),
    ).toEqual({
      title: "没有打开的 PR",
      message: "此分支没有打开的 Pull Request。",
      buttons: [{ text: "取消" }, { text: "确认" }],
    });
  });
});

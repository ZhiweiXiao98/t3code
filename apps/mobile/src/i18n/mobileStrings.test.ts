import { describe, expect, it } from "vite-plus/test";

import { localizeAlertArguments, localizeMobileString } from "./mobileStrings";
import { localizeMobileVoiceError } from "./mobileVoiceStrings";

describe("mobile strings", () => {
  it("localizes v0.1.8 session, transcription, merge-back and diagram controls", () => {
    const messages = {
      "Keep the current session": "保留当前会话",
      "Start a fresh session": "开始全新会话",
      "Merge back to source": "合并回源任务",
      "Transcribe on": "转写位置",
      "Audio stays on this device and is transcribed here.": "音频保留在此设备上，并在此处转写。",
      "Show diagram": "显示图表",
      "Close inspector": "关闭检查面板",
      "Save image": "保存图片",
      "Fast worktree checkout": "快速检出工作树",
    };
    for (const [source, translated] of Object.entries(messages)) {
      expect(localizeMobileString(source, "zh-CN")).toBe(translated);
      expect(localizeMobileString(source, "en")).toBe(source);
    }
  });

  it("localizes the new native child work and one-time scheduling copy in Chinese only", () => {
    const messages = {
      "Approval from": "批准请求来自",
      "Subagent work": "子 Agent 工作",
      "Read only. These subagents cannot take messages.": "仅供查看。这些子 Agent 无法接收消息。",
      "No transcript yet.": "暂无记录。",
      Once: "单次",
      Date: "日期",
      "Duplicate request key": "重复请求识别键",
    };
    for (const [source, translated] of Object.entries(messages)) {
      expect(localizeMobileString(source, "zh-CN")).toBe(translated);
      expect(localizeMobileString(source, "en")).toBe(source);
    }
  });

  it("does not interpret opaque policy messages as UI templates", () => {
    for (const value of [
      "Completed in 1m",
      "2 of 4",
      "Runs on Settings",
      "Managed by Settings.",
      "Settings manages T3 Code updates.",
      "O'Brien limits threads to Auto-accept edits.",
      "Open's policy does not allow webhook tasks.",
    ]) {
      expect(localizeMobileString(value, "zh-CN")).toBe(value);
    }
  });

  it("localizes only recognized voice fallback errors and preserves native error text", () => {
    const source = "Speech model download failed. Check your network connection and retry.";
    expect(localizeMobileVoiceError(source, "zh-CN")).toBe(
      "语音模型下载失败。请检查网络连接后重试。",
    );
    expect(localizeMobileVoiceError(source, "en")).toBe(source);
    for (const error of ["Open", "Settings", "E_AUDIO: native diagnostic", "Voice error\nOpen"]) {
      expect(localizeMobileVoiceError(error, "zh-CN")).toBe(error);
      expect(localizeMobileVoiceError(error, "en")).toBe(error);
    }
  });

  it("translates stable settings, review, and side-chat controls while preserving English", () => {
    const messages = {
      "Agent browser access": "Agent 浏览器访问",
      "Reset tabs": "重置标签页",
      "Resume after usage limits": "用量限制解除后继续",
      "Snooze until limits reset": "休眠至用量限制重置",
      "Edit labels": "编辑标签",
      "Search authors…": "搜索作者…",
      "Ask anything": "输入任何问题",
      "Side chats": "旁支对话",
      "Force stop": "强制停止",
      "Not responding to Stop": "未响应停止请求",
      "Archive project": "归档项目",
      "Unarchive project": "取消归档项目",
    };
    for (const [source, translated] of Object.entries(messages)) {
      expect(localizeMobileString(source, "zh-CN")).toBe(translated);
      expect(localizeMobileString(source, "en")).toBe(source);
    }
  });
  it("translates the new commit, linking, webhook, and preview controls", () => {
    const messages = {
      "Cancel commit": "取消提交",
      "Commit on a new branch": "提交到新分支",
      "Link pull request": "关联拉取请求",
      "Back to document": "返回文档",
      "Render math": "渲染数学公式",
      "Replay key template": "重放去重键模板",
      "Coalesce window (seconds, 10–3600)": "合并窗口（秒，10–3600）",
      "Resume queue": "恢复队列",
    };
    for (const [source, translated] of Object.entries(messages)) {
      expect(localizeMobileString(source, "zh-CN")).toBe(translated);
      expect(localizeMobileString(source, "en")).toBe(source);
    }
  });

  it("translates the new commit counts and quota pace without changing account names", () => {
    expect(localizeMobileString("3 of 8 selected · +1.2k −30", "zh-CN")).toBe(
      "已选择 3 / 8 个文件 · +1.2k −30",
    );
    expect(
      localizeMobileString("Segment 2, Work Mac, 80% left, 62% of the window left", "zh-CN"),
    ).toBe("区段 2，Work Mac，剩余 80%，额度周期剩余 62%");
    expect(localizeMobileString("Segment 2, Work Mac, 80% left", "zh-CN")).toBe(
      "区段 2，Work Mac，剩余 80%",
    );
  });

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

  it("translates repository publishing for each host without changing host names", () => {
    for (const provider of [
      "GitHub",
      "GitLab",
      "Forgejo",
      "GitCafe",
      "Azure DevOps",
      "Bitbucket",
    ]) {
      expect(localizeMobileString(`Create private repository on ${provider}`, "zh-CN")).toBe(
        `在 ${provider} 上创建私有仓库`,
      );
      expect(localizeMobileString(`Could not create the ${provider} repository`, "zh-CN")).toBe(
        `无法创建 ${provider} 仓库`,
      );
      expect(localizeMobileString(`Create private repository on ${provider}`, "en")).toBe(
        `Create private repository on ${provider}`,
      );
    }
  });

  it("translates incremental usage progress and preserves environment names and errors", () => {
    expect(localizeMobileString("Updating Codex…", "zh-CN")).toBe("正在更新 Codex…");
    expect(localizeMobileString("Updating 2 providers…", "zh-CN")).toBe("正在更新 2 个服务提供方…");
    expect(localizeMobileString("Updating 3 environments…", "zh-CN")).toBe("正在更新 3 个环境…");
    expect(localizeMobileString("Updating Work Mac…", "zh-CN")).toBe("正在更新 Work Mac…");
    expect(localizeMobileString("EACCES: /private/usage. Showing saved totals.", "zh-CN")).toBe(
      "EACCES: /private/usage. 正在显示已保存的总计。",
    );
    expect(localizeMobileString("Updating 2 providers…", "en")).toBe("Updating 2 providers…");
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
    expect(localizeMobileString('Failed to update "Settings"', "zh-CN")).toBe("无法更新“Settings”");
    expect(localizeMobileString("Settings is still archived. Try again later.", "zh-CN")).toBe(
      "Settings 仍处于归档状态，请稍后重试。",
    );
    expect(
      localizeMobileString(
        "Forget Work Mac and its cached threads on this device.\n\nIt's no longer on your T3 Connect account.",
        "zh-CN",
      ),
    ).toBe("忘记 Work Mac 及其在此设备上缓存的任务。\n\n它已不在你的 T3 Connect 账户中。");
    expect(
      localizeMobileString("It is shared with 2 working threads. Stop those to free it.", "zh-CN"),
    ).toBe("该进程由另外 2 个运行中的任务共享。停止这些任务后即可释放该进程。");
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
    expect(localizeMobileString("Open AI", "zh-CN")).toBe("Open AI");
    for (const value of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      for (const source of [value, ` \t${value}\n `]) {
        expect(localizeMobileString(source, "zh-CN")).toBe(source);
        expect(localizeMobileString(source, "en")).toBe(source);
      }
    }
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

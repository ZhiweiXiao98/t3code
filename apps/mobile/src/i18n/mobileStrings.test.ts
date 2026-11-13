import { CloudSpeechProvider } from "@t3tools/contracts";
import { cloudSpeechDisclosure } from "@t3tools/shared/speech";
import { describe, expect, it } from "vite-plus/test";

import { localizeAlertArguments, localizeMobileString } from "./mobileStrings";
import { mobileCloudSpeechDisclosure, localizeMobileVoiceError } from "./mobileVoiceStrings";

describe("mobile strings", () => {
  it("localizes connection, catalog and native presentation application copy", () => {
    const messages = {
      "Waiting for this connection's permissions.": "正在等待此连接的权限。",
      "Existing terminals will appear here when another client opens one.":
        "其他客户端打开终端后，已有终端将显示在这里。",
      "Startup crash records are only kept in store and TestFlight builds.":
        "仅商店和 TestFlight 构建保留启动崩溃记录。",
      "Nothing has taken the app down during launch in the last 7 days.":
        "过去 7 天内未发生启动崩溃。",
      "The filter checks file names and folder paths.": "筛选器会检查文件名和文件夹路径。",
      "Show a section to add it back to navigation.": "显示一个分区即可将其重新加入导航。",
      "Edit navigation tabs": "编辑导航标签",
      "Manage hidden models": "管理隐藏的模型",
      "Enter code {0} on the sign-in page.": "在登录页面输入验证码 {0}。",
      "Even pace: {0}% left by now": "均匀使用进度：此时应剩余 {0}%",
      "Connecting to {0}...": "正在连接 {0}…",
      "Reconnecting to {0}...": "正在重新连接 {0}…",
      "{0} is unavailable": "{0} 不可用",
      "{0} is disconnected": "{0} 已断开连接",
      "The app will keep retrying automatically. {0}": "应用将继续自动重试。{0}",
      "Cached data remains available. The {0} will load when your connection returns.":
        "缓存数据仍然可用。连接恢复后将加载{0}。",
      "The {0} will load as soon as the environment is ready.": "环境就绪后将立即加载{0}。",
      "Reconnect the environment to load the {0}.": "重新连接环境以加载{0}。",
      "Use compatible versions of the app and server to connect.":
        "请使用兼容版本的应用和服务器进行连接。",
      "Theme preview": "主题预览",
      "Lists and selection": "列表与选择",
      "Selected option": "已选选项",
      "Selected filter": "已选筛选条件",
      Buttons: "按钮",
      Primary: "主要",
      Secondary: "次要",
      Contrast: "对比",
      Forms: "表单",
      Count: "数量",
      "Example count": "示例数量",
      "Example slider": "示例滑块",
      "Feedback and presentation": "反馈与展示",
      "Show notice": "显示提示",
      Sheet: "面板",
      Dialog: "对话框",
      Alert: "提醒",
      "Example menu": "示例菜单",
      "Example upload": "示例上传",
      "Example sheet": "示例面板",
      "Native app bar": "原生应用栏",
      "Allow T3 Code to add photos in Settings.": "请在设置中允许 T3 Code 添加照片。",
      "Photos could not save this image.": "照片应用无法保存此图片。",
      "The app is not active.": "应用当前不在前台。",
      "Saving images needs Android 10 or later.": "保存图片需要 Android 10 或更高版本。",
      "Could not create the image in Pictures.": "无法在图片目录中创建图片。",
      "The image is no longer available.": "此图片已不可用。",
      "Could not write the image.": "无法写入图片。",
      "Voice transcription does not support any of your languages.":
        "语音转写不支持你选择的任何语言。",
      "Old line {0}": "原第 {0} 行",
      "Line {0}": "第 {0} 行",
      "{0} comment": "{0} 条评论",
      "{0} comments": "{0} 条评论",
      "Send Message": "发送消息",
      Queue: "排队",
      Restart: "重新开始",
      "Steer now": "立即引导",
      "Restart turn": "重新开始此轮",
      "Update queued message": "更新排队消息",
    };
    for (const [source, translated] of Object.entries(messages)) {
      expect(localizeMobileString(source, "zh-CN")).toBe(translated);
      expect(localizeMobileString(source, "en")).toBe(source);
    }
  });

  it("localizes v0.1.8 session, transcription, merge-back and diagram controls", () => {
    const messages = {
      "Keep the current session": "保留当前会话",
      "Start a fresh session": "开始全新会话",
      "Merge back to source": "合并回源任务",
      "Transcribe on": "转写位置",
      "Audio stays on this device and is transcribed here.": "音频保留在此设备上，并在此处转写。",
      "Show diagram": "显示图表",
      "Close inspector": "关闭检查面板",
      "Open file": "打开文件",
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
      Paused: "已暂停",
      "Paste the secret": "粘贴密钥",
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
      "Open example sheet": "打开示例面板",
      "Example name": "示例名称",
      "Search examples": "搜索示例",
      "Example back": "示例返回",
      "Example search": "示例搜索",
      "Watch and control devices open in this thread": "查看和控制此任务中打开的设备",
      "New chat": "新建对话",
      "Discussion reply": "讨论回复",
      "Inline review comment": "行内审查评论",
      "Choose pull request environment": "选择拉取请求环境",
      "Filter by state": "按状态筛选",
      "Filter by involvement": "按参与情况筛选",
      "Filter by label": "按标签筛选",
      "Filter by author": "按作者筛选",
      "Double tap to open. Touch and hold for quick actions.": "轻点两次打开，长按显示快捷操作。",
      "Loading pull request details": "正在加载拉取请求详情",
      "Reviewer ID": "审查者 ID",
      "Loading more pull requests": "正在加载更多拉取请求",
      "Retry loading more pull requests": "重试加载更多拉取请求",
      "Opens the project website": "打开项目网站",
      "Save project name": "保存项目名称",
      "Copy webhook URL": "复制 Webhook URL",
      "Copies the URL to the clipboard": "将 URL 复制到剪贴板",
      "Sets both light and dark appearances": "同时设置浅色和深色外观",
      "Branch prefix": "分支前缀",
      "Branch naming instructions": "分支命名说明",
      "ChatGPT token sharing is active": "ChatGPT 令牌共享已启用",
      "Cancel editing queued message": "取消编辑排队消息",
      "Copy plan": "复制方案",
      "Move up and Move down reorder within this section. Other actions move between sections.":
        "“上移”和“下移”可在此分区内重新排序，其他操作可在分区之间移动。",
      "Choose how to send this message": "选择此消息的发送方式",
      "Fork from this response": "从此回复创建分支对话",
      "Edit pending message": "编辑待发送消息",
      "Opens this turn's subagents": "打开本轮对话的子 Agent",
      Compacting: "正在压缩",
      "New branch name": "新分支名称",
      "Worktree base branch": "工作树基础分支",
      "Worktree branch name": "工作树分支名称",
      "Show provider account": "显示提供商账户",
      "Close thread": "关闭任务",
      "Long press to copy.": "长按复制。",
      "Cancel worktree setup": "取消工作树设置",
      "Setup script output": "设置脚本输出",
      "Shows dictation controls": "显示听写控件",
      "Hides dictation controls": "隐藏听写控件",
      "Saved comments are private until you submit your review.":
        "提交审查前，已保存的评论仅你可见。",
      "Notifications require T3 Connect in this app build.":
        "此应用版本需要 T3 Connect 才能使用通知。",
      "License notices are unavailable in this build.": "此版本中无法查看许可证声明。",
      "Editing queued message": "正在编辑排队消息",
      "Compacting…": "正在压缩…",
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

it("translates finite reset-credit choices while preserving unrecognized provider descriptions", () => {
  expect(localizeMobileString("Fable reset · 2 left · expires in 1d 2h", "zh-CN")).toBe(
    "Fable 额度重置 · 剩余 2 个 · 将在 1 天 2 小时后过期",
  );
  expect(
    localizeMobileString(
      "Fable reset: Refills your Fable allowance and gives back what Fable used on your weekly limit. It doesn't reset your whole week. This cannot be undone.",
      "zh-CN",
    ),
  ).toContain("这不会重置整周额度。此操作无法撤销。");
  const opaque = "Fable reset: Provider-specific instruction. This cannot be undone.";
  expect(localizeMobileString(opaque, "zh-CN")).toBe(opaque);
});

it("preserves cloud disclosure recipients and English semantics for every provider", () => {
  const name = "Settings {1} $& /host";
  for (const provider of CloudSpeechProvider.literals) {
    expect(mobileCloudSpeechDisclosure(provider, name, "en")).toBe(
      cloudSpeechDisclosure(provider, name),
    );
    expect(mobileCloudSpeechDisclosure(provider, name, "zh-CN")).toContain(name);
  }
  expect(mobileCloudSpeechDisclosure("openrouter", name, "zh-CN")).toContain(
    "可能允许出于安全目的留存数据",
  );
});

it("translates the known unsupported-languages voice error without touching unknown diagnostics", () => {
  const source = "Voice transcription does not support any of your languages.";
  expect(localizeMobileVoiceError(source, "zh-CN")).toBe("语音转写不支持你选择的任何语言。");
  expect(localizeMobileVoiceError(source, "en")).toBe(source);
  expect(localizeMobileVoiceError("Settings", "zh-CN")).toBe("Settings");
});

it("localizes exact live microphone failures while preserving prefixes and unknown errors", () => {
  const messages = {
    "The microphone could not start.": "无法启动麦克风。",
    "The microphone returned incomplete audio.": "麦克风返回的音频不完整。",
    "The microphone stopped supplying audio.": "麦克风已停止提供音频。",
    "The microphone audio queue did not drain.": "麦克风音频队列未处理完毕。",
    "Speech recognition fell behind capture.": "语音识别未能跟上音频采集进度。",
  };
  for (const [source, translated] of Object.entries(messages)) {
    expect(localizeMobileVoiceError(source, "zh-CN")).toBe(translated);
    expect(localizeMobileVoiceError(source, "en")).toBe(source);
    const prefixed = `NativeError: ${source}`;
    expect(localizeMobileVoiceError(prefixed, "zh-CN")).toBe(prefixed);
    const suffixed = `${source} trace: Settings/{0}/$&`;
    expect(localizeMobileVoiceError(suffixed, "zh-CN")).toBe(suffixed);
  }
  expect(localizeMobileVoiceError("Settings", "zh-CN")).toBe("Settings");
});

it("localizes diff summaries without changing unrecognized content", () => {
  const messages = {
    "Some file contents are unavailable. Open the change request on its provider to see the full changes.":
      "部分文件内容不可用，请在托管平台打开更改请求以查看全部更改。",
    "This diff is too large to show in full.": "此差异内容过大，无法完整显示。",
    "Unsupported format. Diff contents are not available.": "格式不受支持，无法显示差异内容。",
    "This file was renamed without modifications.": "此文件仅被重命名，内容未修改。",
    "Old file has no newline at end of file.": "原文件末尾没有换行符。",
    "New file has no newline at end of file.": "新文件末尾没有换行符。",
    "Old and new files have no newline at end of file.": "原文件和新文件末尾都没有换行符。",
    "File preview exceeds the size limit. Counts include all changes.":
      "文件预览超过大小限制，统计包含全部更改。",
    "Could not display file preview.": "无法显示文件预览。",
    "Could not load diff. Select the file to retry.": "无法加载差异，请选择此文件重试。",
    "Loading diff…": "正在加载差异…",
    "Diff output hit the server size cap. Showing the available excerpt.":
      "差异输出已达到服务器大小上限，当前仅显示可用片段。",
    "Diff was truncated before it could be parsed completely. Showing the raw excerpt.":
      "差异在完整解析前已被截断，当前显示原始片段。",
    "Unsupported diff format. Showing raw patch.": "差异格式不受支持，当前显示原始补丁。",
    "Failed to parse patch. Showing raw patch.": "无法解析补丁，当前显示原始补丁。",
    "This preview exceeds the size limit. Changes shown are incomplete.":
      "此预览超过大小限制，显示的更改不完整。",
    "This preview exceeds the size limit. Changes shown are incomplete. Counts include all changes.":
      "此预览超过大小限制，显示的更改不完整，统计包含全部更改。",
    "Some file contents are unavailable. Open the pull request on its provider to see the full changes.":
      "部分文件内容不可用，请在托管平台打开拉取请求以查看全部更改。",
    "Some file contents are unavailable. Open the merge request on its provider to see the full changes.":
      "部分文件内容不可用，请在托管平台打开合并请求以查看全部更改。",
  };
  for (const [source, translated] of Object.entries(messages)) {
    expect(localizeMobileString(source, "zh-CN")).toBe(translated);
    expect(localizeMobileString(source, "en")).toBe(source);
  }
  expect(
    localizeMobileString(
      "Some file contents are unavailable. Open the custom {request} on its provider to see the full changes.",
      "zh-CN",
    ),
  ).toBe(
    "Some file contents are unavailable. Open the custom {request} on its provider to see the full changes.",
  );
});

it("localizes review guide application copy", () => {
  const messages = {
    "Reconnect or ask someone with write access to retry.": "请重新连接，或请有写入权限的人重试。",
    "Writing a guide requires a connection and write access.":
      "编写导览需要连接环境并具有写入权限。",
    "The environment request failed.": "环境请求失败。",
    "Couldn't advance the list. Try again.": "无法继续加载列表，请重试。",
    "Could not start the review guide.": "无法启动审查导览。",
    "Rewriting guide": "正在重写导览",
    "You can keep reading this guide while the agent writes the update.":
      "智能体更新导览时，你仍可继续阅读当前导览。",
    "An agent is reading the change and writing the tour. You can leave and come back when it’s ready.":
      "智能体正在阅读更改并编写导览，你可以先离开，准备好后再回来。",
    "Rewriting…": "正在重写…",
    "Writing guide…": "正在编写导览…",
    "Could not write guide": "无法编写导览",
    "Could not refresh guide": "无法刷新导览",
    "Review guide": "审查导览",
    "Checking for a saved guide…": "正在检查已保存的导览…",
    "Loading guide…": "正在加载导览…",
    "New changes since this guide": "此导览之后有新更改",
    "You can read the previous guide, or rewrite it for the latest changes.":
      "你可以阅读原导览，或针对最新更改重新编写。",
    "Rewrite guide": "重写导览",
    "Get a tour of the change, with code excerpts and notes on what needs a closer look.":
      "通过代码片段和重点审查提示，了解此次更改。",
    "Write guide": "编写导览",
    "Couldn't load pull requests.": "无法加载拉取请求。",
  };
  for (const [source, translated] of Object.entries(messages)) {
    expect(localizeMobileString(source, "en")).toBe(source);
    expect(localizeMobileString(source, "zh-CN")).toBe(translated);
  }
});

it("localizes native presentation and recovery application copy", () => {
  const messages = {
    "{0}% error": "错误率 {0}%",
    "Resumes {0}.": "将于 {0} 恢复。",
    "Resets {0}.": "将于 {0} 重置。",
    "Usage limit reached. {0}": "已达到使用限额。{0}",
    "The reset time has passed. Retry the thread manually.": "重置时间已过，请手动重试此任务。",
    "Could not change limit recovery.": "无法更改额度恢复设置。",
    "Could not copy the request. Try again.": "无法复制请求，请重试。",
    "Could not open ChatGPT. Go to chatgpt.com → Settings → Usage.":
      "无法打开 ChatGPT，请前往 chatgpt.com → 设置 → 用量。",
    "Request copied. Send it to your workspace admin.": "请求已复制，请发送给工作区管理员。",
    "You've reached your workspace's limit for using your ChatGPT plan in other apps. Copy a request to ask your workspace admin for increased usage limits.":
      "你已达到工作区在其他应用中使用 ChatGPT 套餐的限额。请复制请求，向工作区管理员申请提高使用限额。",
    "Review your usage settings in ChatGPT.": "请在 ChatGPT 中查看用量设置。",
    "Usage limit reached. The provider did not report a reset time. Retry manually when your limit is available.":
      "已达到使用限额，提供商未报告重置时间。额度恢复后请手动重试。",
    "Unable to render diagram: {0}": "无法渲染图表：{0}",
    "On {0}": "在 {0} 上",
    "this machine": "这台设备",
    "New thread in {0}": "在 {0} 中新建任务",
    "New thread · {0}": "新建任务 · {0}",
    "Go to file": "转到文件",
    "Copy PR link or thread": "复制拉取请求链接或任务",
    "ID or link": "ID 或链接",
    "Linked {0}": "关联于 {0}",
    "Link date unavailable": "关联日期不可用",
    "Managed tunnel": "托管隧道",
    "Activity publishing only": "仅发布活动",
    "Deregister server?": "取消注册服务器？",
    "Could not deregister server": "无法取消注册服务器",
    "Could not deregister the server.": "无法取消注册服务器。",
    "Link a server from its local Settings to reach it through T3 Connect.":
      "在服务器的本地设置中关联服务器，即可通过 T3 Connect 访问。",
    "“{0}” will be removed from this account. T3 Connect access will be revoked, any managed tunnel will be removed, and a host space will become available. Local connections on your devices are not changed.":
      "将从此账户中移除“{0}”。T3 Connect 访问权限将被撤销，所有托管隧道将被移除，并释放一个主机名额。你设备上的本地连接不会改变。",
  };
  for (const [source, translated] of Object.entries(messages)) {
    expect(localizeMobileString(source, "en")).toBe(source);
    expect(localizeMobileString(source, "zh-CN")).toBe(translated);
  }
});

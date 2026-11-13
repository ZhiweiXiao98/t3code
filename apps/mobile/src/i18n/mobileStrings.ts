import type { AlertButton, AlertOptions } from "react-native";

export type MobileLocale = "en" | "zh-CN";

export const MOBILE_LOCALE: MobileLocale =
  process.env.EXPO_PUBLIC_APP_LOCALE === "zh-CN" ? "zh-CN" : "en";

const ZH_CN_MESSAGES = {
  "Remove review request from {0}": "撤销对 {0} 的审核请求",
  "Request review from {0}": "请求 {0} 审核",
  "Remove review request from {0} team": "撤销对 {0} 团队的审核请求",
  "Request review from {0} team": "请求 {0} 团队审核",
  "Stack, {0} of {1}": "堆栈，第 {0} 项，共 {1} 项",
  "showing saved stack": "正在显示已保存的堆栈",
  "Collapse description": "收起描述",
  "Expand description": "展开描述",
  "Expand user input, {0} question": "展开用户输入，{0} 个问题",
  "Expand user input, {0} questions": "展开用户输入，{0} 个问题",
  "{0}, {1} models": "{0}，{1} 个模型",
  "Hide connection details for {0}": "隐藏 {0} 的连接详情",
  "Show connection details for {0}": "显示 {0} 的连接详情",
  "{0}, tool call failed": "{0}，工具调用失败",
  "Opens this agent's thread. Long press to copy.": "打开此智能体的任务。长按以复制。",
  "Double tap to hide full details. Long press to copy.": "轻点两下以隐藏完整详情。长按以复制。",
  "Double tap to show full details. Long press to copy.": "轻点两下以显示完整详情。长按以复制。",
  "Double tap to hide {0} tool call.": "轻点两下以隐藏 {0} 次工具调用。",
  "Double tap to hide {0} tool calls.": "轻点两下以隐藏 {0} 次工具调用。",
  "Double tap to show {0} tool call.": "轻点两下以显示 {0} 次工具调用。",
  "Double tap to show {0} tool calls.": "轻点两下以显示 {0} 次工具调用。",
  "{0} reference in {1}": "{1} 中的 {0} 引用",
  "Filters, {0} active": "筛选器，{0} 项已启用",
  "More filters": "更多筛选器",
  "Review summary": "审核摘要",
  "Summary required to request changes…": "请求修改需要填写摘要…",
  "Summarize your review…": "概述你的审核意见…",
  "Write a comment…": "撰写评论…",
  "No conflicts with {0}": "与 {0} 没有冲突",
  "{0} waiting for approval": "{0} 项等待批准",
  "{0} status": "{0} 状态",
  "{0} reviewer": "{0} 位审核者",
  "{0} reviewers": "{0} 位审核者",
  "Approved by {0}": "由 {0} 批准",
  "{0} approved": "{0} 项已批准",
  "{0} commented": "{0} 项已评论",
  "{0} requested": "已请求 {0} 位",
  Reviews: "审核",
  "Awaiting review": "等待审核",
  "Request a review": "请求审核",
  "None assigned": "尚未分配",
  "Checks, {0}": "检查，{0}",
  "Branch, {0}": "分支，{0}",
  "{0} status, {1}": "{0} 状态，{1}",
  "Unknown reviewer": "未知审核者",
  Approved: "已批准",
  Commented: "已评论",
  "by {0}": "作者：{0}",
  "unknown author": "未知作者",
  "stack {0} of {1}": "堆栈第 {0} 项，共 {1} 项",
  "{0} additions, {1} deletions": "新增 {0} 行，删除 {1} 行",
  "Checks {0}": "检查：{0}",
  "Open resolved discussion in {0}": "打开 {0} 中已解决的讨论",
  "Open unresolved discussion in {0}": "打开 {0} 中未解决的讨论",
  "View diff for {0}, {1} additions, {2} deletions": "查看 {0} 的差异，新增 {1} 行，删除 {2} 行",
  viewed: "已查看",
  "Double tap to hide the message.": "轻点两下以隐藏消息。",
  "Double tap to show the message.": "轻点两下以显示消息。",
  "Double tap to hide the prompt.": "轻点两下以隐藏提示词。",
  "Double tap to show the prompt.": "轻点两下以显示提示词。",
  "Review {0} file changed, {1} additions, {2} deletions":
    "审查 {0} 个文件的更改，新增 {1} 行，删除 {2} 行",
  "Review {0} files changed, {1} additions, {2} deletions":
    "审查 {0} 个文件的更改，新增 {1} 行，删除 {2} 行",
  running: "运行中",
  done: "已完成",
  skipped: "已跳过",
  warning: "警告",
  "{0} check failing": "{0} 项检查失败",
  "{0} checks failing": "{0} 项检查失败",
  "{0} need attention": "{0} 项需要处理",
  "{0} awaiting action": "{0} 项等待操作",
  "{0} pending": "{0} 项待处理",
  "{0} of {1} passed": "{0} 项通过，共 {1} 项",
  "{0} of {1}": "{0} / {1}",
  "No checks reported": "未报告检查结果",
  "Checks need attention": "检查需要处理",
  "Checks running": "检查运行中",
  "All checks passed": "所有检查均通过",
  "Checks completed": "检查已完成",
  "{0} behind {1}": "落后于 {1} {0} 个提交",
  "behind {0}": "落后于 {0}",
  "No conflicts": "没有冲突",
  "Not reported": "未报告",
  "Discovering sign-in methods…": "正在查找登录方式…",
  "No in-app sign-in advertised. Follow the provider's docs to finish setup.":
    "未提供应用内登录方式。请按照提供商文档完成设置。",
  "Connect to load models": "连接以加载模型",
  "Unable to open {0}": "无法打开 {0}",
  "The {0} could not be opened.": "无法打开{0}。",
  passing: "通过",
  failing: "失败",
  pending: "待处理",
  "Has conflicts": "存在冲突",
  "Conflicts with {0}": "与 {0} 冲突",
  "Changes requested": "已请求修改",
  "Reviews approved": "审核已批准",
  "Your review requested": "已请求你审核",
  "Review required": "需要审核",
  "Its thread is not available yet": "其任务尚不可用",
  working: "运行中",
  completed: "已完成",
  failed: "失败",
  stopped: "已停止",
  queued: "已排队",
  "Tab {0}": "标签页 {0}",
  "Show {0}": "显示 {0}",
  "Hide {0}": "隐藏 {0}",
  "Move {0} up": "上移 {0}",
  "Move {0} down": "下移 {0}",
  "Phones show the first four enabled sections; Android tablet rails show all enabled sections. Remaining sections appear at the top of Settings. Hidden sections appear only here. Settings always stays last. Saved on this device.":
    "手机显示前四个已启用的分区；Android 平板导航栏显示所有已启用的分区。其余分区显示在设置顶部。隐藏的分区仅在此处显示。设置始终位于最后。此配置保存在本设备上。",
  "Sets the light appearance only": "仅设置浅色外观",
  "Sets the dark appearance only": "仅设置深色外观",
  "{0} light theme": "{0} 浅色主题",
  "{0} dark theme": "{0} 深色主题",
  "{0} theme": "{0} 主题",
  "{0} appearance": "{0} 外观",
  "Hides the account email": "隐藏账户邮箱",
  "Reveals the account email": "显示账户邮箱",
  "Hide account label": "隐藏账户标签",
  "Reveal account label": "显示账户标签",
  "{0} folder": "{0} 文件夹",
  "Show model: {0}, {1}": "显示模型：{0}，{1}",
  "Hide model: {0}, {1}": "隐藏模型：{0}，{1}",
  "Remove from favorites: {0}, {1}": "从收藏中移除：{0}，{1}",
  "Add to favorites: {0}, {1}": "添加到收藏：{0}，{1}",
  "Long press to remove from this device": "长按以从本设备移除",
  "Manage {0}": "管理 {0}",
  "Remove {0} from this device": "从本设备移除 {0}",
  "{0}, dictating into {1}": "{0}，正在向 {1} 听写",
  "{0} workflow, {1}": "{0} 工作流，{1}",
  "Collapses the workflow": "收起工作流",
  "Opens the current phase": "打开当前阶段",
  "{0} phase, {1}": "{0} 阶段，{1}",
  "{0} completed": "已完成 {0}",
  "waiting for host state": "等待主机状态",
  "stack of {0}": "包含 {0} 项的堆栈",
  watching: "正在监视",
  "checks {0}": "检查：{0}",
  "Pull request": "拉取请求",
  "Merge request": "合并请求",
  "Picture in picture is unavailable": "画中画不可用",
  "Picture in picture is unavailable.": "画中画不可用。",
  "Exit picture in picture": "退出画中画",
  "Picture in picture": "画中画",
  "Could not open this address": "无法打开此地址",
  "Enter an http or https URL.": "请输入 http 或 https URL。",
  "Could not change this browser tab": "无法更改此浏览器标签页",
  "Could not change the viewport": "无法更改视口",
  "The upload was refused.": "上传被拒绝。",
  "Not now": "暂不",
  "Could not save the download": "无法保存下载",
  "Connecting to browser...": "正在连接浏览器…",
  "Could not send the files to the page": "无法将文件发送到页面",
  "Browser viewer could not start. Reconnect to try again.":
    "浏览器查看器无法启动。请重新连接后重试。",
  "Browser viewer stopped. Reconnect to try again.": "浏览器查看器已停止。请重新连接后重试。",
  "Release control": "释放控制权",
  "Take control": "获取控制权",
  "Browser viewer could not load. Reconnect to try again.":
    "浏览器查看器无法加载。请重新连接后重试。",
  "This session can't open the browser stream. Reconnect to try again.":
    "此会话无法打开浏览器画面流。请重新连接后重试。",
  "This tab was closed.": "此标签页已关闭。",
  "Browser stream failed.": "浏览器画面流出错。",
  "Browser viewer stopped unexpectedly.": "浏览器查看器意外停止。",
  "View browser": "查看浏览器",
  "One tab open": "已打开 1 个标签页",
  "New tab": "新标签页",
  "The page has not shown yet. Try again in a moment.": "页面尚未显示。请稍后重试。",
  "Could not shut down device": "无法关闭设备",
  "Check device tool versions": "检查设备工具版本",
  "Device tool versions": "设备工具版本",
  "Shutting down…": "正在关闭…",
  "Shut down device": "关闭设备",
  "Device viewer could not start. Reconnect to try again.":
    "设备查看器无法启动。请重新连接后重试。",
  "Device viewer stopped. Reconnect to try again.": "设备查看器已停止。请重新连接后重试。",
  "Device viewer could not load. Reconnect to try again.": "设备查看器无法加载。请重新连接后重试。",
  "Device stream failed.": "设备画面流出错。",
  "Device viewer stopped unexpectedly.": "设备查看器意外停止。",
  "View device": "查看设备",
  "One device open": "已打开 1 台设备",
  "One thread, same conversation": "同一任务，延续对话",
  "One thread, fresh session": "同一任务，全新会话",
  "On webhook": "收到 Webhook 时",
  "Every day": "每天",
  "Choose days": "选择日期",
  "Connect an environment to view and create scheduled tasks.": "连接环境以查看和创建定时任务。",
  "No environments match these filters. Change the filter above.":
    "没有符合这些筛选条件的环境。请更改上方筛选条件。",
  "Saving task": "正在保存任务",
  "Wait for the task to finish saving before leaving.": "请等待任务保存完成后再离开。",
  "Your unsaved changes will be lost.": "未保存的更改将丢失。",
  "Keep editing": "继续编辑",
  "Discard changes": "放弃更改",
  "Connect an environment to create a scheduled task.": "连接环境以创建定时任务。",
  "No environments match the current filters. Change the filters to create a task.":
    "没有符合当前筛选条件的环境。请更改筛选条件以创建任务。",
  "Invalid age limit": "无效的时限",
  "Incomplete task": "任务信息不完整",
  "Add a name, prompt, project, model, valid schedule, and checkout path if needed.":
    "请添加名称、提示词、项目、模型、有效的计划，以及必要的检出路径。",
  "Project unavailable": "项目不可用",
  "Choose a project in this environment.": "请选择此环境中的项目。",
  "Could not save task": "无法保存任务",
  "Could not update task": "无法更新任务",
  "Could not delete task": "无法删除任务",
  "Could not run task": "无法运行任务",
  "No projects available": "没有可用项目",
  "No models available": "没有可用模型",
  "Each run starts a new thread.": "每次运行都会启动新任务。",
  "Runs continue one conversation.": "每次运行延续同一个对话。",
  "Runs share one thread, each in a fresh session without earlier runs' context.":
    "每次运行共用同一任务，但使用全新会话，不包含之前运行的上下文。",
  "The first run starts the thread.": "首次运行时启动任务。",
  "Deleting it also deletes this task.": "删除该对话任务也会删除此定时任务。",
  "Started by the first run": "首次运行时启动",
  "Project checkout": "项目检出目录",
  "Specific checkout": "指定检出目录",
  "At a time": "指定时间",
  "Webhook URL": "Webhook URL",
  "Webhook path": "Webhook 路径",
  "Rotate URL?": "更换 URL？",
  "The current URL stops working immediately.": "当前 URL 将立即失效。",
  "Could not rotate URL": "无法更换 URL",
  "No scheduled tasks yet.": "尚无定时任务。",
  "No tasks in this project.": "此项目中没有定时任务。",
  "Run now": "立即运行",
  "Delete task?": "删除定时任务？",
  "Next run unavailable": "下次运行时间不可用",
  "Next run due": "已到下次运行时间",
  "Next run in less than a minute": "下次运行在不到一分钟后",
  "Next run in {0} minutes": "下次运行在 {0} 分钟后",
  "Next run in {0} hours": "下次运行在 {0} 小时后",
  "Next run tomorrow at {0}": "下次运行在明天 {0}",
  "Next run {0} at {1}": "下次运行在 {0} {1}",
  "Every {0}": "每隔 {0}",
  "{0} at {1}": "{0} {1}",
  "View {0} browser tabs": "查看 {0} 个浏览器标签页",
  "View {0} devices": "查看 {0} 台设备",
  "{0} tabs open": "已打开 {0} 个标签页",
  "{0} devices open": "已打开 {0} 台设备",
  "Enter whole minutes from 1 to {0}, or leave it blank.":
    "请输入 1 到 {0} 之间的整数分钟数，或留空。",

  "Use the repository's t3.json, or initialize recursively.":
    "使用仓库的 t3.json 配置，或递归初始化。",
  "Initialize nested submodules too.": "同时初始化嵌套的子模块。",
  "Top level only": "仅顶层",
  "Skip submodules declared inside other submodules.": "跳过其他子模块内部声明的子模块。",
  "Leave submodules empty for a setup script.": "将子模块留空，由设置脚本处理。",
  "Use the repository's t3.json, or the current checkout.":
    "使用仓库的 t3.json 配置，或当前检出目录。",
  "Current checkout": "当前检出目录",
  "Start new threads in the existing workspace.": "在现有工作区中启动新任务。",
  "Give each new thread a separate checkout.": "为每个新任务分配独立的检出目录。",
  "After the turn": "轮次结束后",
  "Show the answer when the agent finishes.": "在智能体完成后显示回答。",
  "Finished paragraphs": "已完成的段落",
  "Show each paragraph or code block as it completes.": "在每个段落或代码块完成时显示。",
  "Select a project with a checkout on a connected environment.":
    "请选择在已连接环境中有检出目录的项目。",
  "Use the filter above to select a connected environment.": "使用上方筛选器选择已连接的环境。",
  "Keep the default branch current when there are no local changes.":
    "没有本地更改时，保持默认分支为最新状态。",
  "Server and provider updates": "服务器和提供商更新",
  "Environment-wide setting. Select All projects to change it.":
    "此设置应用于整个环境。选择“所有项目”以更改它。",
  "Check installed provider CLIs for newer versions and fetch model catalog updates. When off, new models may not appear.":
    "检查已安装的提供商 CLI 是否有更新版本，并获取模型目录更新。关闭后，新模型可能不会显示。",
  "Selected project checkouts use different values": "所选项目的检出目录使用不同的值",
  "Selected environments use different values": "所选环境使用不同的值",
  "Static prefix": "固定前缀",
  "Add your prefix to the generated branch name.": "将你的前缀添加到生成的分支名称。",
  "Semantic prefix": "语义前缀",
  "Let the model choose feat/, fix/, refactor/, or another prefix.":
    "让模型选择 feat/、fix/、refactor/ 或其他前缀。",
  "Custom instructions": "自定义指令",
  "Generate the complete name with no added prefix or suffix.":
    "生成完整名称，不额外添加前缀或后缀。",
  "No prefix": "无前缀",
  "Mixed. Enter instructions for all selected targets.":
    "值不一致。请输入适用于所有所选目标的指令。",
  "Use julius/ followed by the issue ID and a short description.":
    "使用 julius/，后接问题 ID 和简短描述。",
  "This environment": "此环境",
  "Earbuds, headsets, and cars, including Android Auto, not listed here":
    "此处未列出的耳塞、耳机和汽车（包括 Android Auto）",
  "AirPods, headsets, and cars not listed here": "此处未列出的 AirPods、耳机和汽车",
  "Dictation on this device needs Android 12 or later and Google speech services that support your language. Your keyboard’s voice typing is separate.":
    "此设备上的听写需要 Android 12 或更高版本，以及支持你所用语言的 Google 语音服务。键盘的语音输入是独立功能。",
  "Dictation on this device needs iOS 26 or later, a supported device, and a supported language. Your keyboard’s dictation is separate.":
    "此设备上的听写需要 iOS 26 或更高版本，以及受支持的设备和语言。键盘的听写是独立功能。",
  "Could not save transcription choice": "无法保存转写选择",
  "Dictation on an environment is off for this session. Save again before closing the app, or your previous choice may return when it restarts.":
    "本次会话的环境听写已关闭。请在关闭应用前重新保存，否则重启后可能恢复为之前的选择。",
  "Use environment": "使用环境",
  "Allow microphone access to record and to see your microphones.":
    "允许麦克风访问权限，以便录音并查看可用麦克风。",
  "Turn on microphone access for T3 Code in Settings to use voice input.":
    "在设置中为 T3 Code 开启麦克风访问权限，以使用语音输入。",
  "Android may still use a different microphone if the preferred one can’t be routed.":
    "如果无法路由到首选麦克风，Android 仍可能使用其他麦克风。",
  "Automatically resume threads when their usage limits reset. You can cancel auto-resume in each thread.":
    "用量限制重置后自动恢复任务。你可以在各任务中取消自动恢复。",
  "Snooze threads until their usage limits reset. Enable auto-resume to continue the agent after the reset.":
    "将任务暂停至用量限制重置。启用自动恢复可在重置后让智能体继续工作。",
  "Could not download the model": "无法下载模型",
  "Could not select the model": "无法选择模型",
  "Could not cancel the download": "无法取消下载",
  "Verifying download…": "正在验证下载…",

  "The local file is unavailable. Attach it again.": "本地文件不可用。请重新添加附件。",
  "Reconnect to the environment and try again.": "请重新连接环境后重试。",
  "Could not open attachment": "无法打开附件",
  "Attachment unavailable. Reconnect and try again.": "附件不可用。请重新连接后重试。",
  "Opening attachment…": "正在打开附件…",
  "Open or share attachment": "打开或分享附件",
  "No description is available for this skill.": "此技能暂无描述。",
  "Try again when connected.": "请在连接后重试。",
  "Could not paste context": "无法粘贴上下文",
  "Remove some attachments or context items from the draft, then paste again.":
    "请移除草稿中的部分附件或上下文项目，然后重新粘贴。",
  "Try copying again.": "请重新复制。",
  "This screen couldn't be displayed": "无法显示此页面",
  "Could not open document": "无法打开文档",
  "A compatible viewer must be installed. Check your connection and try again.":
    "必须安装兼容的查看器。请检查连接后重试。",
  "Try another search or environment.": "请尝试其他搜索条件或环境。",
  "Threads you archive will appear here.": "已归档的任务将显示在这里。",
  "No archived threads": "没有已归档的任务",
  "Trace ID:": "跟踪 ID：",
  "Long press to copy the trace ID": "长按以复制跟踪 ID",
  "Copies the trace ID": "复制跟踪 ID",
  "Turned off": "已关闭",
  "Not signed in": "未登录",
  "Default config folder": "默认配置文件夹",
  "Account name": "账户名称",
  "Name, e.g. Work": "名称，例如：工作",
  "Config folder, e.g. ~/.claude-work": "配置文件夹，例如：~/.claude-work",
  "Could not enable cloud dictation": "无法启用云端听写",
  "Check device storage and choose the provider again.": "请检查设备存储空间，然后重新选择提供商。",
  "Could not update the API key": "无法更新 API 密钥",
  "Check the environment connection and your settings permissions.":
    "请检查环境连接和你的设置权限。",
  "Update the environment to use this provider": "请更新环境以使用此提供商",
  "Tap to manage key": "点按以管理密钥",
  "API key saved · choose a model to use it": "API 密钥已保存 · 选择模型以使用它",
  "Add an API key to use this provider": "添加 API 密钥以使用此提供商",
  "Ask an environment administrator to add an API key": "请环境管理员添加 API 密钥",
  "API key": "API 密钥",
  "Remove key": "移除密钥",
  "Not granted": "未授权",
  "Found automatically": "自动发现",
  "Update required": "需要更新",
  "Restarting and reconnecting…": "正在重启并重新连接…",
  "Installing update…": "正在安装更新…",
  "Downloading update…": "正在下载更新…",
  "No newer version is available yet.": "暂无更新版本。",
  "This app needs a newer version of T3 Code on this machine.":
    "此应用需要这台设备上的 T3 Code 更新到较新版本。",
  "Retry update": "重试更新",
  "This project is no longer available.": "此项目已不可用。",
  "Up to date": "已是最新版本",
  "Clear All Caches": "清除所有缓存",
  "Clear caches": "清除缓存",
  "The action could not be completed. Try again.": "无法完成操作。请重试。",
  "The desktop app will close and relaunch.": "桌面应用将关闭并重新启动。",
  "The server will restart and reconnect.": "服务器将重启并重新连接。",
  "You are up to date.": "已是最新版本。",
  "Update the desktop app on this machine.": "更新这台设备上的桌面应用。",
  "Update and restart T3 Code on this machine.": "更新并重启这台设备上的 T3 Code。",
  "Provider status refreshed.": "提供商状态已刷新。",
  "Version unknown": "版本未知",
  "Your message waits and runs after the current turn finishes.":
    "你的消息将等待当前轮次完成后执行。",
  "Your message reaches the agent right away, changing what it is working on.":
    "你的消息会立即发送给智能体，调整它当前的工作。",
  "Send message": "发送消息",
  "Return sends the message. Shift-Return inserts a new line.":
    "Return 发送消息。Shift-Return 插入换行。",
  "Insert new line": "插入换行",
  "Tab customization becomes available when there are six sections, including Settings.":
    "当包含“设置”在内共有六个分区时，即可自定义标签页。",
  "In Settings": "位于设置中",
  "Group by repository": "按仓库分组",
  "Matching repositories appear as one project.": "相同仓库将显示为一个项目。",
  "Group by repository path": "按仓库路径分组",
  "Keep monorepo paths separate.": "将单体仓库中的不同路径分开显示。",
  "Keep separate": "保持独立",
  "Show every workspace as its own project.": "将每个工作区显示为独立项目。",
  "Install a newer app build to enable notifications": "安装较新版本的应用以启用通知",
  "Could not request notification permission.": "无法请求通知权限。",
  "Agent notifications are enabled for this device.": "已为此设备启用智能体通知。",
  "Couldn't finish enabling notifications": "未能完成通知启用",
  "Notification access was granted, but this device could not be registered with T3 Connect. Notifications will start once registration succeeds.":
    "已授予通知权限，但无法将此设备注册到 T3 Connect。注册成功后将开始接收通知。",
  "Agent notifications are unavailable on this platform.": "此平台不支持智能体通知。",
  "Live Activity updates require T3 Connect so relay can deliver updates to this device.":
    "实时活动更新需要 T3 Connect，以便中继服务向此设备推送更新。",
  "Ongoing activity unavailable": "持续活动不可用",
  "Could not enable agent notifications.": "无法启用智能体通知。",
  "Notification permission needed": "需要通知权限",
  "Enable notifications in system Settings to show ongoing agent activity.":
    "在系统设置中启用通知以显示智能体持续活动。",
  "Live Activities unavailable": "实时活动不可用",
  "Could not enable agent activity updates.": "无法启用智能体活动更新。",
  "Ongoing activity enabled": "已启用持续活动",
  "Live Activities enabled": "已启用实时活动",
  "Agent activity updates are enabled for environments this connection can configure.":
    "已为此连接有权配置的环境启用智能体活动更新。",
  "Agent activity updates are enabled. Add an environment to start receiving updates.":
    "已启用智能体活动更新。添加环境后即可开始接收更新。",
  "Couldn't finish enabling activity updates": "未能完成活动更新启用",
  "This device could not be registered with T3 Connect, so activity updates won't appear yet. They'll start once registration succeeds.":
    "无法将此设备注册到 T3 Connect，因此暂时不会显示活动更新。注册成功后将开始显示。",
  "Open system Settings to disable notifications for T3 Code.":
    "打开系统设置以停用 T3 Code 的通知。",
  "Agent Live Updates": "智能体实时更新",
  "Ongoing Agent Activity": "智能体持续活动",
  "Couldn't open Settings": "无法打开设置",
  "Open Android Settings, select T3 Code, then enable Live Updates in Notifications.":
    "打开 Android 设置，选择 T3 Code，然后在通知中启用实时更新。",

  "Saved key · enter a new one to replace": "已保存密钥 · 输入新密钥以替换",
  "Save and enable": "保存并启用",
  "Save key": "保存密钥",
  "Transcription unavailable": "转写不可用",
  "Send finished recordings to this environment.": "将完成的录音发送到此环境。",
  "Not available on this environment": "此环境不可用",
  "Copy as Markdown": "复制为 Markdown",

  "5-hour reset": "5 小时额度重置",
  "Weekly reset": "每周额度重置",
  "Fable reset": "Fable 额度重置",
  "Full reset": "全部额度重置",
  "Refills your 5-hour limit.": "恢复你的 5 小时额度。",
  "Refills your weekly limit.": "恢复你的每周额度。",
  "Refills your Fable allowance and gives back what Fable used on your weekly limit. It doesn't reset your whole week.":
    "恢复你的 Fable 额度，并返还 Fable 已使用的每周额度。这不会重置整周额度。",
  "Refills your 5-hour and weekly limits.": "恢复你的 5 小时和每周额度。",
  "This cannot be undone.": "此操作无法撤销。",

  "This app cannot confirm it is one of your machines. The pairing code you paste is sent there.":
    "此应用无法确认该地址是否属于你的设备。你粘贴的配对码将发送到那里。",
  "Send microphone audio to {0}?": "将麦克风音频发送到 {0}？",
  "Finished recordings will be sent to {0} for transcription. You can switch back to This device at any time.":
    "完成的录音将发送到 {0} 进行转写。你可以随时切换回“此设备”。",
  "Method on {0}": "{0} 上的转写方式",
  "After you stop, {0} sends the recording to OpenRouter. OpenRouter chooses who runs your model. T3 requests zero data retention; your OpenRouter account may allow safety retention.":
    "停止录音后，{0} 会将录音发送给 OpenRouter。OpenRouter 决定由谁运行你的模型。T3 请求零数据留存；你的 OpenRouter 账户可能允许出于安全目的留存数据。",
  "After you stop, {0} sends your recording and vocabulary hints, including project names, to {1}.":
    "停止录音后，{0} 会将你的录音和词汇提示（包括项目名称）发送给 {1}。",
  "Select This device to stop sharing.": "选择“此设备”可停止共享。",
  "Use {0} for dictation?": "使用 {0} 进行听写？",
  "Use {0}": "使用 {0}",
  "Remove the {0} key from {1}?": "从 {1} 移除 {0} 密钥？",
  "{0} API key reference": "{0} API 密钥引用",
  "{0} API key": "{0} API 密钥",
  "{0} · Tap to change model": "{0} · 点按以更改模型",
  "{0} · Tap to change model or key": "{0} · 点按以更改模型或密钥",

  "Cloud provider": "云端提供商",
  "Use your own API key": "使用自己的 API 密钥",
  "Environment not connected": "环境未连接",
  "Could not load keys · Retry": "无法加载密钥 · 重试",
  "Checking API keys…": "正在检查 API 密钥…",
  "API key saved": "API 密钥已保存",
  "Could not load models · Retry": "无法加载模型 · 重试",
  "Loading transcription models…": "正在加载转写模型…",
  "Uses the API key saved on this environment. The model choice applies only to this device.":
    "使用此环境中保存的 API 密钥。模型选择仅适用于此设备。",
  "Audio is sent through {0} using its API key.": "音频将通过 {0} 使用其 API 密钥发送。",
  "Anyone with dictation access to {0} can bill this key.":
    "任何有权在 {0} 使用听写的人都可以通过此密钥产生费用。",
  "Updates the {0} key on {1}. Your dictation destination stays the same.":
    "更新 {1} 上的 {0} 密钥。听写目标保持不变。",
  "Local model": "本地模型",
  "No model installed · Choose one to download": "未安装模型 · 选择一个模型下载",
  "No model installed · Add one using T3 Code on {0}":
    "未安装模型 · 请使用 {0} 上的 T3 Code 添加模型",
  "Verifying {0}…": "正在验证 {0}…",
  "Downloading {0} · {1}%": "正在下载 {0} · {1}%",
  "Local model · {0}": "本地模型 · {0}",
  "Check this address": "检查此地址",
  "Disable line wrap": "禁用自动换行",
  "Wrap lines": "自动换行",
  "Steer · waiting to be read": "即时引导 · 等待读取",
  "Steer waiting for the agent to read it after the running command finishes":
    "即时引导正在等待智能体完成当前命令后读取",
  "Steered the active turn": "已引导当前轮次",
  "Originally queued, then promoted to steer the active turn":
    "原为排队消息，现已提升为引导当前轮次",
  "Reconnect to this environment and try again. The file may have been moved or deleted.":
    "请重新连接此环境后重试。文件可能已被移动或删除。",
  "The file was not found at {0}.": "在 {0} 未找到文件。",
  "Link {0}": "连接 {0}",
  "Using…": "正在使用…",
  "Show all {0} models": "显示全部 {0} 个模型",

  files: "多个文件",
  "a file": "一个文件",
  "pull request": "拉取请求",
  "pull requests": "拉取请求",
  "merge request": "合并请求",
  "merge requests": "合并请求",
  "change request": "变更请求",
  "change requests": "变更请求",
  "privacy policy": "隐私政策",
  "terms of service": "服务条款",
  "Choose files": "选择文件",
  "Choose file": "选择文件",
  "Open file": "打开文件",
  "No environments connected yet.\nTap": "尚未连接环境。\n轻点",
  "to add one.": "以添加环境。",
  "% error)": "% 错误率)",
  "in {0}": "在{0}",
  "on {0}": "在 {0} 上",
  "Choose environment, {0}, {1}": "选择环境，{0}，{1}",
  "From {0}": "基于 {0}",
  "From {0} (remote)": "基于 {0}（远程）",
  "The page asks for {0}.": "页面请求选择{0}。",
  "{0} pending line {1}": "{0} 条待提交的行内评论",
  "You can no longer submit line comments on this {0}. Your drafts are kept here.":
    "你已无法对此{0}提交行内评论。草稿将保留在此处。",
  "Requesting reviews requires write access and an open {0}.":
    "请求审查需要写入权限以及一个尚未关闭的{0}。",
  "Base: {0}. Open a layer to review it or merge the stack through that layer.":
    "基础分支：{0}。打开某一层可审查该层，或合并截至该层的堆叠。",
  "{0} isn't installed on {1}, so requests here use your own GitHub login and its lower rate limit.":
    "{0} 未安装在 {1} 上，因此此处的请求使用你自己的 GitHub 登录身份及其较低的速率限制。",
  "Install on {0}": "安装到 {0}",
  "{0} stops": "{0} 个步骤",
  "through {0} {1}": "涵盖 {0} 个文件",
  "OpenRouter no longer lists {0}. Dictation stays off until you choose another model.":
    "OpenRouter 已不再提供 {0}。选择其他模型后才能恢复听写。",
  "Long-press the send button to use the other option for a single message. With a hardware keyboard, hold {0} while sending.":
    "长按发送按钮可为单条消息使用另一选项。使用实体键盘时，请在发送时按住 {0}。",
  "This connection can’t change settings on {0}.": "此连接无权更改 {0} 上的设置。",
  "Couldn't load the {0}": "无法加载{0}",
  "The {0} app is open full screen": "{0} 应用已全屏打开",
  "The {0} app was closed": "{0} 应用已关闭",
  "The {0} app left its page and was stopped": "{0} 应用已离开其页面并停止运行",
  "Unable to load the {0} app": "无法加载 {0} 应用",
  "Next reconnect at {0}": "下次重新连接时间：{0}",
  "{0} open · {1} linked": "{0} 个未关闭 · {1} 个已关联",
  "No linked {0}.": "没有已关联的{0}。",
  "{0} queued": "{0} 条排队中",
  "exit {0}": "退出码 {0}",
  "Open {0}": "打开 {0}",
  "Remove {0}": "移除 {0}",
  "Preview {0}": "预览 {0}",
  "{0} favicon": "{0} 网站图标",
  "Set {0} on for selected environments": "为所选环境启用“{0}”",
  "Decrease {0}": "减少{0}",
  "Increase {0}": "增加{0}",
  "Copy {0}": "复制 {0}",
  "Open browser, {0}": "打开浏览器，{0}",
  "Actions for {0}": "{0} 的操作",
  "Enable {0}": "启用 {0}",
  "Copy trace ID {0}": "复制跟踪 ID {0}",
  "{0} pull request routing": "{0} 的拉取请求路由",
  "Loading {0}": "正在加载 {0}",
  "Open full-screen preview of {0}": "全屏预览 {0}",
  "Activity type, {0}": "活动类型，{0}",
  "Filter activity, {0} hidden": "筛选活动，已隐藏 {0} 项",
  "Insert {0}": "插入 {0}",
  "{0} agent actions": "{0} 的 Agent 操作",
  "View attachment: {0}": "查看附件：{0}",
  "Copy base branch {0}": "复制基础分支 {0}",
  "Copy head branch {0}": "复制源分支 {0}",
  "{0}, Review requested": "{0}，已请求审查",
  "View commit {0}, {1}": "查看提交 {0}，{1}",
  "Stop {0}: {1}": "步骤 {0}：{1}",
  "Open {0} at line {1} in full diff": "在完整差异中打开 {0} 的第 {1} 行",
  "{0} options": "{0} 选项",
  "Remove {0} route": "移除 {0} 连接路径",
  "Version {0}": "版本 {0}",
  "Remove checkout {0}": "移除检出目录 {0}",
  "Cancel {0} sign-in": "取消 {0} 登录",
  "{0} account options": "{0} 账户选项",
  "Sign in to {0}": "登录 {0}",
  "Remove filter {0}": "移除筛选条件 {0}",
  "Time, {0}": "时间，{0}",
  "Edit {0}": "编辑 {0}",
  "Reorder {0}": "重新排序 {0}",
  "Line {0}: {1}": "第 {0} 行：{1}",
  "Reload {0}": "重新加载 {0}",
  "{0} app": "{0} 应用",
  "Project: {0}": "项目：{0}",
  "Open subagent {0}": "打开子 Agent {0}",
  "Use {0} template": "使用“{0}”模板",
  "Automation: {0}": "自动化：{0}",
  "Dismiss message from {0}": "关闭 {0} 的消息",
  "Send message from {0}": "发送来自 {0} 的消息",
  "Actions for queued message {0}": "第 {0} 条排队消息的操作",
  "Send now, queued message {0}": "立即发送第 {0} 条排队消息",
  "Open agents, {0}": "打开 Agent，{0}",
  "Open queue, {0} messages": "打开队列，共 {0} 条消息",
  "{0} (guest)": "{0}（访客）",
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
  Lines: "行",
  "Context unavailable. The reference was copied without its payload. Copy it again from the original message or remove it.":
    "上下文不可用。复制的引用未包含其内容。请从原始消息中重新复制或将其移除。",
  "This context type is not supported by this version of the app. Its payload will be preserved when sent.":
    "此版本的应用不支持这种上下文类型。发送时将保留其内容。",
  "Mixed · Set on": "混合状态 · 全部启用",
  "My MacBook": "我的 MacBook",
  "Choose environments you trust to share PR data and use each other's source control access. Enable both environments. This applies only to this client.":
    "选择你信任的环境，以共享 PR 数据并使用彼此的源代码管理访问权限。请在两个环境中都启用。此设置仅适用于当前客户端。",
  "Startup crashes": "启动崩溃",
  "Reading crash log…": "正在读取崩溃日志…",
  "Crash log unavailable": "崩溃日志不可用",
  "No startup crashes": "没有启动崩溃记录",
  "Paste the report into a GitHub issue. It contains the app version, the JavaScript error message, and the component stack. Error messages can quote values from the app, so read it over before sharing.":
    "将报告粘贴到 GitHub 议题中。报告包含应用版本、JavaScript 错误信息和组件堆栈。错误信息可能包含应用中的数据，请在分享前仔细检查。",
  "When the app crashes or hits an error, it sends the error message, the stack trace, the app version, and the device model and OS version to the T3 Code team. Each launch also sends startup timings. Reports carry a random ID for this install.":
    "应用崩溃或发生错误时，会向 T3 Code 团队发送错误信息、堆栈跟踪、应用版本、设备型号和操作系统版本。每次启动还会发送启动耗时。报告包含此次安装的随机 ID。",
  "Searching messages…": "正在搜索消息…",
  "In messages": "消息内容",
  "This folder does not exist yet. Cloning creates it.": "此文件夹尚不存在，克隆时将创建它。",
  "Clone destination": "克隆目标位置",
  "This connection cannot clone projects.": "此连接无权克隆项目。",
  "Show in activity": "在活动中显示",
  hidden: "已隐藏",
  "AI helpers": "AI 助手",
  "No description provided.": "未提供描述。",
  Attachments: "附件",
  "View file diff": "查看文件差异",
  "This discussion is no longer available.": "此讨论已不可用。",
  "Reply…": "回复…",
  "Renamed from": "原名称",
  "No text changes available.": "没有可显示的文本更改。",
  "Write feedback on this line…": "填写对此行的反馈…",
  "Saved comments are private until you submit your review.": "提交审查前，已保存的评论仅你可见。",
  "The branch changed. Return to the current diff and select the line again.":
    "分支已更改。请返回当前差异并重新选择行。",
  "Delete draft": "删除草稿",
  "This repository has more labels than are listed here. Apply the rest on the provider.":
    "此仓库的部分标签未在此列出。请在源代码托管平台上应用其他标签。",
  "Retry stack lookup": "重试查找堆叠",
  "The branch changed since you wrote a comment. Choose its current line before submitting.":
    "撰写评论后分支发生了更改。请在提交前选择评论当前对应的行。",
  "Tap someone to request a review. Tap a requested reviewer to remove the request.":
    "轻点用户以请求审查，再次轻点已请求的审查者可移除请求。",
  Requested: "已请求",
  "This provider accepts a reviewer ID but cannot list candidates.":
    "此提供商支持输入审查者 ID，但无法列出候选人。",
  "Reviewer login or ID": "审查者登录名或 ID",
  "Remove review request": "移除审查请求",
  "No activity matches these filters.": "没有符合这些筛选条件的活动。",
  "Select a current line, then choose “Move draft to this line” from its menu.":
    "选择当前版本中的一行，然后从菜单中选择“将草稿移到此行”。",
  "The branch changed. Reload before adding line comments.":
    "分支已更改。请重新加载后再添加行内评论。",
  "Reload changes": "重新加载更改",
  "Loading more files…": "正在加载更多文件…",
  Stack: "堆叠",
  "Fix failing checks": "修复失败的检查",
  "Approve workflows": "批准工作流",
  "No checks reported.": "未报告检查结果。",
  "Open checks on provider": "在托管平台上打开检查",
  "View reviewers on provider": "在托管平台上查看审查者",
  "started a discussion": "发起了讨论",
  "More activity is available on the provider.": "可在源代码托管平台上查看更多活动。",
  "Load more": "加载更多",
  Started: "已启动",
  "Review guides are disabled for this server.": "此服务器已禁用审查指南。",
  "This guide was rewritten. Go back to start the new tour.":
    "此指南已重写。请返回以开始新的导览。",
  "Excerpts are hidden until the guide is rewritten for the current head.":
    "在根据当前最新提交重写指南前，相关摘录将保持隐藏。",
  "Notes on this stop": "此步骤的说明",
  "Questions to consider": "需要考虑的问题",
  "Native diff view unavailable. Showing the raw patch.": "原生差异视图不可用，正在显示原始补丁。",
  "No transcription model matches.": "没有匹配的转写模型。",
  Routes: "连接路径",
  "Your permissions": "你的权限",
  "Applies to the route marked In use. Other routes may have different permissions and have not been checked.":
    "适用于标记为“使用中”的连接路径。其他路径可能具有不同权限，尚未检查。",
  "Add route": "添加连接路径",
  "In use": "使用中",
  "Check for updates": "检查更新",
  "Scheduled task": "计划任务",
  "Open a scheduled task form first.": "请先打开计划任务表单。",
  "No matching threads": "没有匹配的任务",
  About: "关于",
  "This environment is no longer saved on this device.": "此设备上已不再保存此环境。",
  Connection: "连接",
  "Connect this environment to manage it.": "连接此环境后即可管理。",
  "Update this provider on the environment's machine.": "请在环境所在的机器上更新此提供商。",
  Chat: "聊天",
  "Return key": "回车键",
  "Applies to the composer when a hardware keyboard is connected.":
    "适用于连接实体键盘时的消息输入框。",
  "Notifications require T3 Connect in this app build.": "此应用版本需要 T3 Connect 才能使用通知。",
  "Agent activity": "Agent 活动",
  "Turn off Live Activity preference": "关闭实时活动偏好设置",
  "Live Update Settings": "实时更新设置",
  "License notices are unavailable in this build.": "此版本中无法查看许可证声明。",
  "No licenses match that search.": "没有与该搜索匹配的许可证。",
  "This license notice is unavailable.": "此许可证声明不可用。",
  "Project source": "项目源代码",
  "Project grouping": "项目分组",
  "Choose a project with the filter above to manage its name, checkouts and removal.":
    "请使用上方的筛选器选择项目，以管理其名称、检出目录或移除项目。",
  "This project has no checkout on the selected connected environments. Change the filter above.":
    "此项目在所选的已连接环境中没有检出目录。请更改上方的筛选条件。",
  Checkouts: "检出目录",
  Danger: "危险操作",
  "Remove checkout": "移除检出目录",
  "Select a connected environment.": "请选择已连接的环境。",
  "Limited permissions": "权限受限",
  "Configure a provider with in-app sign-in in web or desktop Settings.":
    "请在网页版或桌面版设置中配置支持应用内登录的提供商。",
  "Enter code": "输入验证码",
  "Open sign-in page": "打开登录页面",
  "This environment is disconnected. Reconnect before saving.":
    "此环境已断开连接，请重新连接后再保存。",
  "Intervals must be at least 1 minute. Update this interval before saving.":
    "间隔必须至少为 1 分钟，请修改后再保存。",
  "Time uses the environment's time zone, which may differ from your phone's.":
    "时间采用环境所在的时区，可能与你的手机时区不同。",
  "Save the task to get its webhook URL.": "保存任务后即可获取其 Webhook URL。",
  "Signature check configured on desktop/web.": "签名验证已在桌面版或网页版配置。",
  "Loading tasks…": "正在加载任务…",
  Updates: "更新",
  Mixed: "混合",
  Voice: "语音",
  "Voice input uses the first connected microphone in this list. A wired or Bluetooth microphone is added by name the first time you dictate with it connected; until then it falls under Other. Swipe left on a named microphone to forget it.":
    "语音输入使用此列表中第一个已连接的麦克风。首次连接有线或蓝牙麦克风进行听写时，会按名称添加该设备；在此之前，它归类于“其他”。向左滑动已命名的麦克风即可将其忘记。",
  "Select a setting": "选择设置项",
  Labs: "实验室",
  "Auto-settle": "自动收起",
  "Auto-settle inactive threads": "自动收起不活跃任务",
  "Inactive days": "不活跃天数",
  "Across environments": "跨环境",
  "Auto-settle defaults differ": "自动收起的默认设置不同",
  "Apply auto-settle defaults": "应用自动收起默认设置",
  Sidebar: "侧栏",
  "Working section": "进行中分区",
  "Fold working and monitoring threads into a Working section. They return to the top of the list when they need you. While this is on, active threads are ordered by time and cannot be moved.":
    "将运行中和监控中的任务归入“进行中”分区。需要你处理时，它们会返回列表顶部。启用后，活跃任务按时间排序，无法手动移动。",
  "The quick brown fox jumps over the lazy dog.": "敏捷的棕色狐狸跳过了懒狗。",
  "Hide the commands, edits, and searches agents run. Hide successful keeps failures. Zen shows only final answers. Approvals, questions, and errors always show.":
    "隐藏 Agent 执行的命令、编辑和搜索。“隐藏成功项”会保留失败项；“专注”仅显示最终回复。批准请求、问题和错误始终显示。",
  "Days before auto-settle": "自动收起前的天数",
  "Worktree branch naming": "工作树分支命名",
  "Use t3 or t3/ for t3/add-search. Leave empty for no prefix.":
    "输入 t3 或 t3/ 可生成 t3/add-search。留空则不添加前缀。",
  "Append instructions to the naming prompt.": "向分支命名提示词追加说明。",
  "Reclaim database space": "回收数据库空间",
  "What should the agent do each time?": "Agent 每次应该做什么？",
  "Use defaults": "使用默认设置",
  "Tap the first and last line to select a range.": "轻点首行和末行以选择范围。",
  "Select fewer lines to fit the context limit.": "请减少所选行数，以符合上下文限制。",
  "Attach selected output": "附加所选输出",
  "Checking terminal access": "正在检查终端访问权限",
  "No terminal sessions": "没有终端会话",
  "Attach visible output": "附加可见输出",
  "Using ChatGPT plan": "正在使用 ChatGPT 套餐",
  "Editing queued message": "正在编辑排队消息",
  "Page unavailable": "页面不可用",
  "Only a session that manages access here can answer this.":
    "只有能管理此处访问权限的会话才能回应。",
  "This app cannot be shown.": "无法显示此应用。",
  "Reconnect now": "立即重新连接",
  "Your draft is saved on this device. Connect to an environment to choose its first model.":
    "草稿已保存在此设备上。连接环境后即可选择它的首个模型。",
  "This connection cannot submit answers.": "此连接无权提交回答。",
  "Save securely": "安全保存",
  "No agents in this turn.": "本轮对话中没有 Agent。",
  "Drag to reorder, pin, or settle. Changes save when you drop.":
    "拖动可重新排序、置顶或收起。松开后自动保存更改。",
  "Nothing running in the background.": "没有后台运行的任务。",
  "This connection cannot control this task. You can still edit your draft.":
    "此连接无权控制该任务，但你仍可编辑草稿。",
  "The conversation couldn't be displayed": "无法显示对话",
  Automation: "自动化",
  "Open automation": "打开自动化",
  "Context handoff pending": "上下文交接待完成",
  Send: "发送",
  Audio: "音频",
  "No messages waiting in this queue.": "此队列中没有等待发送的消息。",
  Editing: "编辑中",
  Hidden: "已隐藏",
  Unavailable: "不可用",
  "No agents yet": "还没有 Agent",
  "ChatGPT usage limit reached": "已达到 ChatGPT 使用限额",
  "Compacting…": "正在压缩…",
  "Inspect changes, uncommitted edits, and turn diffs": "查看更改、未提交的编辑和轮次差异",
  "Context handoff": "上下文交接",
  Draft: "草稿",
  "Sends on reconnect": "重新连接后发送",
  Unsent: "未发送",
  "This connection cannot manage provider accounts.": "此连接无权管理提供商账户。",
  "Unable to render diagram:": "无法渲染图表：",
  "No subscription limits available.": "没有可用的订阅额度信息。",
  "Close inspector": "关闭检查面板",
  Labels: "标签",
  "Agent work in progress": "Agent 正在工作",
  "Close environments": "关闭环境",
  "UI components": "界面组件",
  "Select text": "选择文本",
  "Opening file...": "正在打开文件…",
  "Checking file access...": "正在检查文件访问权限…",
  "It may be incomplete or damaged.": "文件可能不完整或已损坏。",
  "T3 Code, Threads": "T3 Code，任务",
  "Hide sidebar": "隐藏侧边栏",
  "T3 Code, Pull requests": "T3 Code，拉取请求",
  "Mention a user": "提及用户",
  "Reference an issue or change request": "引用议题或变更请求",
  Closed: "已关闭",
  Merged: "已合并",
  Discussion: "讨论",
  "Search reviewers": "搜索审查者",
  "Close request review": "关闭请求审查",
  "Diff unavailable": "差异不可用",
  "Settled thread": "已结束的任务",
  "Continue thread": "继续任务",
  "Start a new thread": "开始新任务",
  "Settled threads": "已结束的任务",
  "Could not save the description": "无法保存描述",
  "Environment is not connected.": "环境未连接。",
  "Could not save the Claude account.": "无法保存 Claude 账户。",
  "Add Claude account": "添加 Claude 账户",
  "Use a Claude config folder that is already signed in on this server.":
    "使用此服务器上已登录的 Claude 配置文件夹。",
  "Cloud providers": "云端提供商",
  "Search OpenRouter models": "搜索 OpenRouter 模型",
  "Search transcription models": "搜索转写模型",
  "Ask an administrator to add an OpenRouter key": "请管理员添加 OpenRouter 密钥",
  "Enter a valid API key.": "请输入有效的 API 密钥。",
  "Remove key from environment": "从环境移除密钥",
  "Everyone using it for dictation will lose access.":
    "所有使用此密钥进行听写的用户都将失去访问权限。",
  "Back to providers": "返回提供商",
  "Search threads, including older ones": "搜索任务，包括较早的任务",
  "Clear thread search": "清除任务搜索",
  "Untitled thread": "未命名任务",
  Destination: "目标位置",
  "Refresh cloud environments": "刷新云端环境",
  "Search packages": "搜索软件包",
  "Search open-source licenses": "搜索开源许可证",
  "Remove incomplete connection": "移除未完成的连接",
  "Runs go to": "运行目标",
  "Unavailable project": "项目不可用",
  "Default workspace": "默认工作区",
  "Remove agent credits when merging": "合并时移除 Agent 署名",
  "Default branch": "默认分支",
  "Automatically pull": "自动拉取",
  Clones: "克隆",
  "Clone into host folders": "克隆到主机文件夹",
  "Clones go to github.com/owner/repo under the Add project folder, like ghq.":
    "与 ghq 类似，仓库会克隆到“添加项目”文件夹下的 github.com/owner/repo。",
  "Manage environments": "管理环境",
  "Check provider updates": "检查提供商更新",
  "Continue after restart": "重启后继续",
  "Transcription models": "转写模型",
  "Search models or languages": "搜索模型或语言",
  "Close transcription models": "关闭转写模型",
  "No models match": "没有匹配的模型",
  "No transcription models": "没有转写模型",
  "Try another name or language.": "请尝试其他名称或语言。",
  "Headsets and USB microphones not listed here": "此处未列出耳机和 USB 麦克风",
  "Transcribe on": "转写位置",
  "This device": "此设备",
  "Audio stays on this device and is transcribed here.": "音频保留在此设备上，并在此处转写。",
  "Previously selected environment": "之前选择的环境",
  "No longer paired": "已取消配对",
  "Let agents on a machine work on your other machines, and theirs on it. Turn it on for each machine. While off, nothing new starts over a link; running tasks finish.":
    "允许机器上的 Agent 在你的其他机器上工作，反之亦然。请为每台机器启用。关闭后，不会通过关联启动新工作；正在运行的任务会继续完成。",
  "Fast worktree checkout": "快速检出工作树",
  "On a Mac, clone new worktrees from a checkout cached in the T3 home folder instead of writing every file. Uses Git’s normal checkout when it can’t. Turning it off deletes the cache.":
    "在 Mac 上，从 T3 主目录中缓存的检出克隆新工作树，无需逐个写入文件。不支持时使用 Git 的常规检出。关闭此选项会删除缓存。",
  "No model selected": "未选择模型",
  "Show all": "显示全部",
  "Hide successful": "隐藏成功项",
  "Hide all": "全部隐藏",
  Zen: "专注",
  "Tool calls in chat": "聊天中的工具调用",
  "Filter settings environments and projects": "筛选设置中的环境和项目",
  "All connected environments": "所有已连接的环境",
  "Could not start the sign-in": "无法开始登录",
  "Sign-in did not finish": "登录未完成",
  "Could not check for updates.": "无法检查更新。",
  "Checking for updates timed out. Try again.": "检查更新超时，请重试。",
  "New thread each run": "每次运行新建任务",
  "Date and time": "日期和时间",
  Hours: "小时",
  Days: "天",
  "Snooze mode": "稍后提醒模式",
  "Duration amount": "时长数值",
  "Duration unit": "时长单位",
  "Your next message starts a fresh session. The agent won't see earlier messages in this thread.":
    "你的下一条消息将开始全新会话。Agent 将看不到此任务中之前的消息。",
  "Keep the current session": "保留当前会话",
  "Exit full screen": "退出全屏",
  "This app cannot call that tool.": "此应用无法调用该工具。",
  "Declined by the user.": "用户已拒绝。",
  "The link could not be opened.": "无法打开链接。",
  "Sharing is not available on this device.": "此设备不支持分享。",
  "Background work": "后台工作",
  "Wake now": "立即唤醒",
  "New session": "新会话",
  "Merge back to source": "合并回源任务",
  "Bring this thread's latest turn into its source": "将此任务最新一轮对话合并到源任务",
  "Opening thread…": "正在打开任务…",
  "Copy request for admin": "复制请求以发送给管理员",
  "Cancel auto-resume": "取消自动恢复",
  "Resume at reset": "额度重置后恢复",
  "Snooze until reset": "稍后提醒至额度重置",
  "Shows the full Pi status": "显示完整的 Pi 状态",
  "Refresh repository status": "刷新仓库状态",
  "Follow settings": "遵循设置",
  Never: "从不",
  "Copy thread ID": "复制任务 ID",
  Thinking: "思考中",
  Active: "活跃",
  Settled: "已结束",
  "Settled with outbox": "已结束且有待发消息",
  "Plan with Antigravity": "使用 Antigravity 规划",
  "Clear conversation history": "清除对话历史",
  "Switch model": "切换模型",
  "Start a fresh session": "开始全新会话",
  "Side chat not started": "旁支对话未启动",
  "Could not send the side chat message.": "无法发送旁支对话消息。",
  "Your transcription choice changed.": "你的转写选项已更改。",
  "This recording couldn’t be read. Try recording again.": "无法读取此录音，请重新录制。",
  "Add your OpenAI API key": "添加你的 OpenAI API 密钥",
  "Update T3 Code to transcribe on an environment.": "更新 T3 Code 后即可在环境中转写。",
  "Could not read this file.": "无法读取此文件。",
  "The local file is unavailable.": "本地文件不可用。",
  "Copy model reference": "复制模型引用",
  "Share model reference": "分享模型引用",
  "The diagram renderer failed to load.": "图表渲染器加载失败。",
  "The diagram could not be rendered.": "无法渲染图表。",
  "Show diagram": "显示图表",
  "Show code": "显示代码",
  "Mermaid diagram": "Mermaid 图表",
  "Opens the diagram full screen": "全屏打开图表",
  "Voice transcription does not support any of your languages.": "语音转写不支持你选择的任何语言。",
  "The attachment is unavailable.": "附件不可用。",
  "Saving image…": "正在保存图片…",
  "Save image": "保存图片",
  "When you return": "返回时",
  Delivered: "已送达",
  "Side chats start after the first message.": "发送第一条消息后即可开始旁支对话。",
  "No active agents": "没有活跃的 Agent",
  Open: "打开",
  Download: "下载",
  "This connection does not have permission to manage the environment.":
    "此连接没有管理环境的权限。",
  "Failed to update project": "更新项目失败",
  "This connection can no longer change it.": "此连接已无权更改此项目。",
  Organize: "整理",
  "Connect every machine with this project to change this.":
    "请连接所有包含此项目的机器后再更改此设置。",
  "Pinned projects come first in project pickers.": "置顶项目会优先显示在项目选择器中。",
  "Unarchive project": "取消归档项目",
  "Archive project": "归档项目",
  "Hidden from project pickers. Threads and files are kept.":
    "已从项目选择器中隐藏，任务和文件仍会保留。",
  "Hides the project from project pickers. Threads and files are kept.":
    "从项目选择器中隐藏项目，保留任务和文件。",
  "Could not force stop the agent": "无法强制停止 Agent",
  "Turn stopped; the agent is still shutting down": "本轮已停止，Agent 仍在关闭中",
  "Turn stopped; the agent process kept running": "本轮已停止，Agent 进程仍在运行",
  "Not responding to Stop": "未响应停止请求",
  "Stopping…": "正在停止…",
  "Force stopping...": "正在强制停止…",
  "Force stop": "强制停止",
  "Force stop the agent": "强制停止 Agent",
  "Force stop the agent?": "强制停止 Agent？",
  "It has not answered Stop. Force stop ends the turn and kills the agent's processes, unless other working threads share them.":
    "Agent 未响应停止请求。强制停止会结束本轮并终止其进程，但其他运行中的任务共享的进程除外。",
  "Side chats": "旁支对话",
  "Open side chat": "打开旁支对话",
  ", needs approval": "，需要批准",
  ", needs input": "，需要输入",
  ", messages queued to send": "，有消息排队等待发送",
  ", regenerating title": "，正在重新生成标题",
  "Choose a pull request from the sidebar to review it.": "从侧边栏选择一个拉取请求进行审查。",
  "It stays on your T3 Connect account and keeps its host space. Deregister it under T3 Account → T3 Connect to free it.":
    "它仍会保留在你的 T3 Connect 账户中，并占用主机名额。请前往“T3 账户 → T3 Connect”取消注册以释放名额。",
  "It's no longer on your T3 Connect account.": "它已不在你的 T3 Connect 账户中。",
  "This doesn't change your T3 Connect account. To deregister it there, use T3 Account → T3 Connect.":
    "此操作不会更改你的 T3 Connect 账户。如需在账户中取消注册，请前往“T3 账户 → T3 Connect”。",
  "Open T3 Account": "打开 T3 账户",
  "Failed to refresh branches.": "刷新分支失败。",
  Updated: "更新于",
  ago: "前",
  "<1m": "不到 1 分钟",

  Linked: "已关联",
  Declined: "已拒绝",
  "Request ended": "请求已结束",
  Reachable: "可连接",
  "Link a machine": "关联机器",
  "Link a machine to this environment": "将机器关联到此环境",
  "Expired. Link it again with a new pairing code.": "已过期。请使用新配对码重新关联。",
  "Not answering right now.": "当前无响应。",
  "Waiting for an answer in the original thread": "正在等待原任务中的答复",
  "The ZIP wasn't downloaded. Try again to list its files.":
    "ZIP 尚未下载。请重试以查看其中的文件。",
  "Save the ZIP to open it in another app.": "保存 ZIP 后可使用其他应用打开。",
  "Check the connection to this environment and try again.": "请检查与此环境的连接，然后重试。",
  "Agents here can then launch, message and wait on threads there. It appears in that machine's Connections, where it can be revoked.":
    "此处的 Agent 随后可以启动目标环境中的任务、发送消息并等待任务完成。该关联将出现在目标机器的“连接”设置中，可随时撤销。",
  "An agent here never gets more there than its own mode here either. Threads it starts there cannot change that environment's own threads, projects or settings.":
    "Agent 在目标环境中的权限也不会超过它在此处的运行模式所允许的权限。它在目标环境中启动的任务无法更改该环境原有的任务、项目或设置。",
  "Add to chat": "添加到聊天",
  "Allow edits from maintainers": "允许维护者编辑",
  "Another address…": "其他地址…",
  "Beta: Linked environments": "测试版：关联环境",
  "Built-in microphone": "内置麦克风",
  "By speed": "按速度",
  "By type": "按类型",
  "Change account": "切换账户",
  "Clear filter": "清除筛选",
  "Close files": "关闭文件",
  "Copy thread": "复制任务",
  "Couldn't browse this ZIP": "无法浏览此 ZIP",
  "Couldn't download this ZIP": "无法下载此 ZIP",
  "Couldn't read this file": "无法读取此文件",
  "Crash reports": "崩溃报告",
  "Download cancelled": "下载已取消",
  "Earlier work": "此前工作",
  "Extra High": "极高",
  "Filter files in ZIP": "筛选 ZIP 中的文件",
  "Floating navigation with a separate compose button.": "浮动导航与独立撰写按钮。",
  Forget: "忘记",
  "Git action failed": "Git 操作失败",
  "Go to threads list": "前往任务列表",
  "Link a machine this app does not know, by its https or Tailscale address.":
    "通过 HTTPS 或 Tailscale 地址关联此应用尚未连接的机器。",
  Machine: "机器",
  Navigation: "导航",
  "Open link": "打开链接",
  "Opens queued messages to send now, edit, or remove": "打开排队消息以立即发送、编辑或移除",
  "Paste the code": "粘贴代码",
  "Preferred order": "首选顺序",
  Pushed: "已推送",
  "Read only": "只读",
  "Read projects and threads. Cannot start, message or change anything.":
    "读取项目和任务，不能启动任务、发送消息或进行任何更改。",
  "Refreshing source control status": "正在刷新源代码管理状态",
  "Resume interrupted threads after an update or restart.": "更新或重启后恢复中断的任务。",
  "Save ZIP": "保存 ZIP",
  "Save file": "保存文件",
  "Send crash reports": "发送崩溃报告",
  "Send now": "立即发送",
  "Send response": "发送回复",
  "Sent by T3 Code": "由 T3 Code 发送",
  "Share link": "分享链接",
  "Sign in with": "登录方式",
  "Standard Android navigation bar and side rail.": "标准 Android 导航栏与侧边栏。",
  "Start new threads in the last project you used on this device.":
    "在此设备上最近使用的项目中新建任务。",
  "This ZIP is empty": "此 ZIP 为空",
  "It has no files.": "其中没有文件。",
  "Too big to preview": "文件过大，无法预览",
  "Too large to browse here": "文件过大，无法在此浏览",
  Triage: "问题分流",
  "Triage an issue": "对问题进行分流",
  "Turn into project": "转为项目",
  "Use last project": "使用上次项目",
  "What agents here may do there": "此处 Agent 可在目标环境执行的操作",
  "While the agent is running": "Agent 运行期间",
  "ZIP actions": "ZIP 操作",
  "ZIP download progress": "ZIP 下载进度",
  "Stop workflow?": "停止工作流？",
  "Stop agent?": "停止 Agent？",
  "Could not stop workflow": "无法停止工作流",
  "Could not stop agent": "无法停止 Agent",
  "Provider-managed agent. Its work appears in the transcript.":
    "由提供商管理的 Agent，其工作内容显示在记录中。",
  "Choose machine…": "选择机器…",
  "Review link…": "检查关联…",
  "Linking…": "正在关联…",
  "Use this link": "使用此关联",
  "Add a reaction": "添加回应",
  "Agent browser access": "Agent 浏览器访问",
  "All sections are hidden": "所有分区均已隐藏",
  "Allow agents to use the in-app preview browser.": "允许 Agent 使用应用内预览浏览器。",
  "Ask anything": "输入任何问题",
  "Close thread preview": "关闭任务预览",
  "Could not display diff": "无法显示差异",
  "Default permissions": "默认权限",
  "Dismiss Woke notification": "关闭唤醒通知",
  "Edit comment": "编辑评论",
  "Edit description": "编辑描述",
  "Edit labels": "编辑标签",
  "Edit title": "编辑标题",
  "Enter fullscreen": "进入全屏",
  "Exit fullscreen": "退出全屏",
  "Fix checkout": "修复检出",
  Interface: "界面",
  "Keep source control requests on this environment.": "在此环境中处理源代码管理请求。",
  "Load more pull requests": "加载更多拉取请求",
  "Loading changes": "正在加载更改",
  "Maximize device": "最大化设备",
  "Maximize thread": "最大化任务",
  "Navigation tabs": "导航标签页",
  "New worktrees": "新建工作树",
  "Opening changes": "正在打开更改",
  "Preview browser": "预览浏览器",
  "Pull request routing": "拉取请求路由",
  "Refresh providers": "刷新提供商",
  "Remove recognized agent credits from merge and squash messages on hosts that support it, keeping human co-authors. Includes auto-merge. Excludes merge queues, stack merges, and existing commits.":
    "在支持的平台上，从合并和压缩合并消息中移除已识别的 Agent 署名，保留人类共同作者。包含自动合并，不包含合并队列、堆叠合并和现有提交。",
  "Request review": "请求审查",
  "Reset tabs": "重置标签页",
  "Resize inspector": "调整检查器大小",
  "Response streaming": "响应流式传输",
  "Restore drag handles": "恢复拖动手柄",
  "Resume after usage limits": "用量限制解除后继续",
  "Search authors…": "搜索作者…",
  "Search labels": "搜索标签",
  "Search labels…": "搜索标签…",
  "Search settings": "搜索设置",
  "Select range end": "选择范围终点",
  "Server settings": "服务器设置",
  "Snooze until limits reset": "休眠至用量限制重置",
  "Stop sharing": "停止共享",
  "Stop sharing?": "停止共享？",
  "Tab order": "标签页顺序",
  "Worktree submodules": "工作树子模块",
  Agents: "Agent",
  Woke: "已唤醒",
  "Some attachments could not be copied. Reconnect to the source environment and copy them again.":
    "部分附件无法复制。请重新连接来源环境后再次复制。",
  "Some context is unavailable": "部分上下文不可用",
  "Those references are marked unavailable.": "这些引用已标记为不可用。",
  Close: "关闭",
  "New thread": "新建任务",
  "The PDF could not be loaded.": "无法加载 PDF。",
  "Could not load PDF": "无法加载 PDF",
  "Loading PDF...": "正在加载 PDF…",
  "The PDF could not be rendered. It may be damaged or password protected.":
    "无法显示 PDF，它可能已损坏或受密码保护。",
  Success: "成功",
  "Close tab": "关闭标签页",
  Paste: "粘贴",
  "Could not close this browser tab": "无法关闭此浏览器标签页",
  "Could not read the clipboard": "无法读取剪贴板",
  "Refreshing environments": "正在刷新环境",
  "What to try": "建议尝试",
  "Copy diagnostics": "复制诊断信息",
  "More info": "更多信息",
  Collapse: "收起",
  Expand: "展开",
  "This connection still uses the old permissions, so some actions may no longer be available. Pair again using a new link with the permissions you need.":
    "此连接仍使用旧权限，因此部分操作可能已不可用。请使用包含所需权限的新链接重新配对。",
  "Got it": "知道了",
  Overview: "概览",
  Activity: "动态",
  "Discard changes?": "放弃更改？",
  Discard: "放弃",
  Dark: "深色",
  Projects: "项目",
  Notifications: "通知",
  "Updates from your active threads": "来自活跃任务的更新",
  Name: "名称",
  Continue: "继续",
  Prompt: "提示词",
  Rename: "重命名",
  Copy: "复制",
  Menu: "菜单",
  "Back 15 seconds": "后退 15 秒",
  "Loading…": "正在加载…",
  Pause: "暂停",
  Play: "播放",
  "Forward 15 seconds": "前进 15 秒",
  "This audio could not be played. Try again or save it to open in another app.":
    "无法播放此音频。请重试，或保存后用其他应用打开。",
  "File options": "文件选项",
  "Close file search": "关闭文件搜索",
  "Clear file search": "清除文件搜索",
  "Back to document": "返回文档",
  Home: "主页",
  "Filter threads": "筛选任务",
  Code: "代码",
  Tests: "测试",
  Mocks: "模拟数据",
  Generated: "生成的文件",
  Docs: "文档",
  State: "状态",
  Involvement: "参与方式",
  "Copy link": "复制链接",
  "Share…": "分享…",
  "Search pull requests": "搜索拉取请求",
  "Filter pull requests": "筛选拉取请求",
  "Failed to share pull request link.": "无法分享拉取请求链接。",
  "This diff is too large to show in full.": "此差异内容过大，无法完整显示。",
  "Clear package search": "清除包搜索",
  Filter: "筛选",
  Path: "路径",
  Test: "条件",
  "Values, comma-separated": "值，以逗号分隔",
  Value: "值",
  "Add filter": "添加筛选条件",
  "Runs only when every filter matches. Other requests are logged as filtered. Separate “is one of” values with commas; a value can't contain a comma.":
    "仅在所有筛选条件匹配时运行。其他请求会记为已过滤。“属于以下之一”的值请用逗号分隔，单个值不能包含逗号。",
  "Invalid filter": "筛选条件无效",
  "Invalid webhook settings": "Webhook 设置无效",
  "Each dedupe key must contain a valid request placeholder. The coalesce window must be whole seconds from 10 to 3600, or blank.":
    "每个去重键都必须包含有效的请求占位符。合并窗口须为 10 至 3600 之间的整数秒，或留空。",
  "Replay key template": "重放去重键模板",
  "Coalesce key template": "合并键模板",
  "Coalesce window (seconds, 10–3600)": "合并窗口（秒，10–3600）",
  "Replay keys suppress repeats for 7 days. Coalescing runs the latest payload when the window from the first delivery closes. Empty keys run normally.":
    "重放去重键会在 7 天内抑制重复请求。合并操作会在首次投递开始的窗口结束后，使用最新请求内容运行。键留空时按常规运行。",
  "Start from remote": "从远程分支开始",
  "Uses the latest commit of the base branch’s tracked remote branch, even if its name differs. Otherwise uses the same-named branch on origin. Uses your local branch if that remote branch is missing.":
    "使用基础分支所跟踪远程分支的最新提交，即使名称不同也如此。否则使用 origin 上的同名分支；若该远程分支不存在，则使用本地分支。",
  "Render math": "渲染数学公式",
  "Old history is cleaned up automatically, but this database still holds the freed space. Run this command on":
    "旧历史记录会自动清理，但此数据库仍占用已释放的空间。请在以下机器上运行此命令：",
  "Copy command": "复制命令",
  Dismiss: "关闭",
  "Use environment defaults for this project": "为此项目使用环境默认设置",
  Failure: "失败",
  "Could not save settings": "无法保存设置",
  "Could not copy": "无法复制",
  "Source control": "版本控制",
  "Open PR": "打开拉取请求",
  "Touch and hold for actions.": "长按以查看操作。",
  "Waiting for host state": "正在等待主机状态",
  "Clear branch search": "清除分支搜索",
  "Attached thread unavailable": "附加的任务不可用",
  "Client not supported": "客户端不受支持",
  Cloning: "正在克隆",
  "Remove project": "移除项目",
  "Close arrange threads": "关闭任务排序",
  "Resume queue": "恢复队列",
  "Resume thread": "恢复任务",
  "View instructions": "查看指令",
  "Copy skill": "复制技能",
  "Open thread": "打开任务",
  "Linked pull requests": "已关联的拉取请求",
  "No linked pull requests.": "没有已关联的拉取请求。",
  "Link pull request": "关联拉取请求",
  "Queue paused": "队列已暂停",
  "The server did not report whether this project is at the repository root, so this worktree cannot be reused safely. Update the server or choose another branch.":
    "服务器未报告此项目是否位于仓库根目录，因此无法安全复用此工作树。请更新服务器或选择其他分支。",
  "This project is a repository subdirectory. Choose another branch or add the repository root as a project to reuse this worktree.":
    "此项目位于仓库子目录中。请选择其他分支，或将仓库根目录添加为项目以复用此工作树。",
  "Cancel commit": "取消提交",
  "You’re on the default branch. You can create a new branch when committing.":
    "当前位于默认分支。提交时可以创建新分支。",
  "Describe your changes…": "描述你的更改…",
  "Leave empty to generate a message automatically.": "留空以自动生成提交说明。",
  "Deselect all": "取消全选",
  "Select all": "全选",
  "No changed files to commit.": "没有可提交的文件更改。",
  "Commit on a new branch": "提交到新分支",
  "Attach a pull request by URL or number": "通过网址或编号关联拉取请求",
  "Loading output…": "正在加载输出…",
  "No output.": "暂无输出。",
  "Earlier output not shown": "较早的输出未显示",
  "Opens this agent's thread": "打开此 Agent 的任务",
  Thread: "任务",
  "Workflow started": "工作流已启动",
  "Show less": "收起",
  "Show full script": "显示完整脚本",
  "Couldn't link this pull request": "无法关联此拉取请求",
  "Couldn't unlink this pull request": "无法取消关联此拉取请求",
  "Pull request URL or #42": "拉取请求网址或 #42",
  Link: "关联",
  "Use a pull request URL, 123, or #123.": "请输入拉取请求网址、123 或 #123。",
  "Stop watching": "停止关注",
  "Watch for changes": "关注更改",
  "Dismiss from thread": "从任务中隐藏",
  "Unlink from thread": "取消与任务的关联",
  "Couldn't change watching": "无法更改关注状态",
  Steer: "即时引导",
  "Even pace:": "均衡用量：",
  "Close search": "关闭搜索",
  "Pull requests": "拉取请求",
  "The server did not return a PDF. Check the connection and try again.":
    "服务器未返回 PDF。请检查连接后重试。",
  "Your edit is still in the composer.": "你的编辑仍保留在输入框中。",
  "No limits available": "暂无可用额度",
  "Subscription remaining": "订阅剩余额度",
  "Reset time unavailable": "重置时间不可用",
  "As of": "截至",
  "New threads": "新任务",
  "Agent behavior": "Agent 行为",
  "Provider accounts": "服务提供方账户",
  Maintenance: "维护",
  "Thread behavior": "任务行为",
  "About T3 Code": "关于 T3 Code",
  Organization: "组织",
  "Project overview": "项目概览",
  Keyboard: "键盘",
  Microphone: "麦克风",
  "Follow-ups": "后续任务",
  "Scheduled Tasks": "计划任务",
  "Scheduled tasks": "计划任务",
  "New scheduled task": "新建计划任务",
  "Edit scheduled task": "编辑计划任务",
  Diagnostics: "诊断",
  "Open source licenses": "开源许可证",
  "License notice": "许可声明",
  "Go back": "返回",
  "Add Project": "添加项目",
  Page: "页面",
  Selection: "选择内容",
  "Requested changes": "请求的更改",
  Element: "元素",
  Selector: "选择器",
  Styles: "样式",
  File: "文件",
  Skill: "技能",
  Description: "描述",
  "Open attachment": "打开附件",
  "Open pull request": "打开拉取请求",
  "Remove from draft": "从草稿中移除",
  "Copying context…": "正在复制上下文…",
  "Opening document…": "正在打开文档…",
  "Copy details": "复制详细信息",
  "Try again. If it keeps happening, copy the details for a bug report.":
    "请重试。如果问题持续出现，请复制详细信息以报告问题。",
  "More actions": "更多操作",
  Done: "完成",
  "Dismiss message": "关闭消息",
  "Archived threads": "已归档任务",
  Unarchive: "取消归档",
  "Close browser": "关闭浏览器",
  Back: "后退",
  Forward: "前进",
  Address: "地址",
  "Enter a URL": "输入网址",
  "Reload page": "重新加载页面",
  Tabs: "标签页",
  "Browser tab options": "浏览器标签页选项",
  "Fit to screen": "适应屏幕",
  "Hard reload": "强制重新加载",
  "Zoom in": "放大",
  "Zoom out": "缩小",
  "Actual size": "实际大小",
  Viewport: "视口",
  "Site data": "网站数据",
  "Clear cookies": "清除 Cookie",
  "Clear cache": "清除缓存",
  "Dialog response": "对话框响应",
  Accept: "接受",
  "Take control to respond.": "接管控制以响应。",
  "Opens the browser tab full screen": "全屏打开浏览器标签页",
  "Close floating preview": "关闭悬浮预览",
  "Watch and control browser tabs open in this thread": "查看并控制此任务中打开的浏览器标签页",
  "Refresh environments": "刷新环境",
  "No servers registered": "没有已注册的服务器",
  "Registered servers": "已注册的服务器",
  "Connections on this device are managed in Settings.": "此设备上的连接在设置中管理。",
  Deregister: "取消注册",
  "Reconnect environment": "重新连接环境",
  "Remove environment": "移除环境",
  "Reach your machines from anywhere, no network setup.": "随时随地访问你的机器，无需配置网络。",
  "Or enter it": "或手动输入",
  "Tap to scan": "轻点扫描",
  "Scan the code from t3 pair or desktop Connections settings":
    "扫描 t3 pair 命令或桌面端连接设置中的二维码",
  "Or use the managed relay": "或使用托管中继",
  Off: "关闭",
  "Read PRs": "读取拉取请求",
  "Read and act": "读取并操作",
  "Hide device controls": "隐藏设备控制",
  "Close device preview": "关闭设备预览",
  "Show device controls": "显示设备控制",
  "Device options": "设备选项",
  "Connecting to device...": "正在连接设备…",
  "Reload stream": "重新加载画面",
  "App switcher": "应用切换器",
  "Rotate device": "旋转设备",
  Devices: "设备",
  Reconnect: "重新连接",
  "No preview for this file": "此文件无预览",
  "Preview limited to the first 1 MB. Save or share the file to read it in full.":
    "预览仅显示前 1 MB。保存或分享文件以查看完整内容。",
  "Table limited to the first 100 rows and 30 columns. Source shows the rest.":
    "表格仅显示前 100 行和 30 列。其余内容可在源文件中查看。",
  "More search results available. Refine your search to see them.":
    "还有更多搜索结果，请缩小搜索范围以查看。",
  "Open PDF": "打开 PDF",
  "Filter threads by environment": "按环境筛选任务",
  "Filter threads by project": "按项目筛选任务",
  "Reset thread filters": "重置任务筛选",
  "Opens environment settings": "打开环境设置",
  "Close command palette": "关闭命令面板",
  "Search commands, projects, and threads": "搜索命令、项目和任务",
  "Search commands, projects, and threads…": "搜索命令、项目和任务…",
  "New thread in…": "在以下位置新建任务…",
  "The sidebar couldn't be displayed": "无法显示侧栏",
  "The inspector couldn't be displayed": "无法显示检查面板",
  "Make pane wider": "加宽面板",
  "Make pane narrower": "缩窄面板",
  "Review files": "审查文件",
  "Filter review files": "筛选审查文件",
  "Test files are hidden from this review.": "此次审查已隐藏测试文件。",
  "Show test files": "显示测试文件",
  "Loading changed files": "正在加载已更改文件",
  "Hide test files": "隐藏测试文件",
  "Diff options": "差异选项",
  "Word wrap": "自动换行",
  "Only test files changed": "仅测试文件有更改",
  "Retry loading remaining files": "重试加载其余文件",
  "Submit review": "提交审查",
  "Add comment": "添加评论",
  "Copy line": "复制行",
  "Start tour": "开始导览",
  "Guide options": "导览选项",
  "Runs on": "运行环境",
  Task: "任务",
  "Check for issues": "检查问题",
  Context: "上下文",
  Model: "模型",
  Workspace: "工作区",
  "Run in": "运行位置",
  "Checkout path": "检出路径",
  Schedule: "计划",
  Repeat: "重复",
  "Skip requests older than (minutes)": "跳过早于此时间的请求（分钟）",
  "Run every request": "运行每个请求",
  "Minutes between runs": "运行间隔（分钟）",
  "Task enabled": "任务已启用",
  "This task no longer exists.": "此任务已不存在。",
  Time: "时间",
  Edit: "编辑",
  "Save changes": "保存更改",
  "Create task": "创建任务",
  "Rotating…": "正在轮换…",
  "Rotate URL": "轮换网址",
  "Terminal output": "终端输出",
  "Attach output": "附加输出",
  "Could not load terminals": "无法加载终端",
  "Loading terminals": "正在加载终端",
  "Reading existing terminal sessions.": "正在读取已有终端会话。",
  "Custom snooze": "自定义稍后处理",
  "Cancel custom snooze": "取消自定义稍后处理",
  "Show app": "显示应用",
  "Model unavailable. Open model settings.": "模型不可用。请打开模型设置。",
  "Open parent": "打开父任务",
  "Arrange threads": "排列任务",
  "Load earlier activity": "加载更早的动态",
  "Loading earlier activity…": "正在加载更早的动态…",
  "Open terminal": "打开终端",
  "Retry workspace preparation": "重试准备工作区",
  "Worktree setup": "工作树设置",
  "Cancel setup": "取消设置",
  "Work locally": "在本地工作",
  "Close setup details": "关闭设置详情",
  "Select a pull request": "选择拉取请求",
  PRs: "拉取请求",
  "24h": "24 小时",
  "7d": "7 天",
  "30d": "30 天",
  "90d": "90 天",
  "New project": "新建项目",
  "Start a new Git repository from a name": "输入名称以创建新的 Git 仓库",
  "Created without a first commit": "项目已创建，但未完成首次提交",
  "Could not create the GitHub repository": "无法创建 GitHub 仓库",
  "The project was created but has not reached this device yet. It will appear in the project list once the connection catches up.":
    "项目已创建，但尚未同步到此设备。连接恢复同步后，它将出现在项目列表中。",
  "Project name": "项目名称",
  "Create private repository on GitHub": "在 GitHub 上创建私有仓库",
  "Create project": "创建项目",
  "Add existing project": "添加已有项目",
  "Open a folder or clone a repository": "打开文件夹或克隆仓库",
  Creates: "创建位置：",
  "Goes in": "存放位置：",
  "Could not switch machine": "无法切换机器",
  "The folder for threads without a project could not be created.":
    "无法创建未关联项目任务的文件夹。",
  "It has not reached this device yet. Try again.": "尚未同步到此设备，请重试。",
  "Could not start without a project": "无法在不关联项目的情况下启动",
  "It has not reached this device yet. Pick No project from the list once it appears.":
    "尚未同步到此设备。同步完成后，请在列表中选择“不关联项目”。",
  "No project": "不关联项目",
  "Start a task without a project": "创建不关联项目的任务",
  "Start without a project": "不关联项目并开始",
  "What should we work on?": "我们来做些什么？",
  "Choose a project": "选择项目",
  "Opens the project picker": "打开项目选择器",
  "Search projects": "搜索项目",
  "Try a different project name or workspace path.": "请尝试其他项目名称或工作区路径。",
  "No matching projects": "没有匹配的项目",
  "Clear model search": "清除模型搜索",
  Enable: "启用",
  "Requires access to your Cursor login in macOS Keychain.":
    "需要访问 macOS 钥匙串中的 Cursor 登录信息。",
  "Manage usage": "管理用量",
  "ChatGPT shared usage": "ChatGPT 共享用量",
  Account: "账户",
  Actions: "操作",
  "Add attachment": "添加附件",
  "Add Comment": "添加评论",
  "Add Environment": "添加环境",
  "Add environment": "添加环境",
  "Add image": "添加图片",
  "Add new project": "添加新项目",
  "Add project": "添加项目",
  "Add an environment before creating a task.": "请先添加环境，再创建任务。",
  "Add an environment to load projects and start coding sessions.":
    "添加环境以加载项目并开始编程会话。",
  "All environments": "所有环境",
  "All projects": "所有项目",
  "All providers": "所有服务提供方",
  "Allow camera": "允许使用相机",
  "Allow camera access to scan an environment pairing QR code.": "允许使用相机扫描环境配对二维码。",
  "Allow once": "仅允许一次",
  "Allow session": "本次会话允许",
  App: "应用",
  Appearance: "外观",
  "Approval needed": "需要批准",
  Approval: "待批准",
  Archive: "归档",
  "Archived thread options": "归档任务选项",
  "Archived Threads": "已归档任务",
  "Ask anything…": "输入任何问题…",
  "Ask the agent to inspect the repo, run a command, or continue the active thread.":
    "让 Agent 检查仓库、运行命令或继续当前任务。",
  "Ask the repo agent, or run a command…": "向仓库 Agent 提问，或运行命令…",
  "Auto-settle merged threads": "合并后自动收起任务",
  "Auto-accept edits": "自动接受编辑",
  Auto: "自动",
  Available: "可用",
  "Awaiting Input": "等待输入",
  "Back to chat": "返回对话",
  Branch: "分支",
  "Base branch": "基础分支",
  "Branch changes": "分支更改",
  "Branches & worktrees": "分支与工作树",
  "Browse a folder on disk": "浏览磁盘上的文件夹",
  "Browse folders": "浏览文件夹",
  "By model": "按模型",
  "Cache savings": "缓存节省",
  "Cached input": "缓存输入",
  "Camera access needed": "需要相机权限",
  "Camera access was denied for this app. Open Settings to enable it.":
    "此应用的相机权限已被拒绝。请前往系统设置启用。",
  "Camera permission is required to scan a QR code.": "扫描二维码需要相机权限。",
  Cancel: "取消",
  "Cancel new task": "取消新任务",
  "Cancel thread settings": "取消任务设置",
  Catalog: "目录",
  "Changed files": "已更改文件",
  "Choose project": "选择项目",
  "Choose model": "选择模型",
  "Choose a thread from the sidebar or start a new task.": "从侧栏选择任务，或新建任务。",
  "Choose another environment or create a new task.": "选择其他环境，或新建任务。",
  "Choose another project or create a new task.": "选择其他项目，或新建任务。",
  "Choose branch": "选择分支",
  "Choose Files": "选择文件",
  Clear: "清除",
  "Clear all client caches?": "清除所有客户端缓存？",
  "Clear search": "清除搜索",
  "Clearing caches never removes environment connections, credentials, account data, or appearance preferences.":
    "清除缓存不会移除环境连接、凭据、账户数据或外观偏好。",
  Clean: "干净",
  "Client Storage": "客户端存储",
  "Client storage is temporarily unavailable. Try again after restarting the app.":
    "客户端存储暂时不可用。请重启应用后重试。",
  "Clone project": "克隆项目",
  "Close scanner": "关闭扫码器",
  "Close legal document": "关闭法律文档",
  "Close new task": "关闭新任务",
  "Code & Diffs": "代码与差异",
  "Collapse user input": "收起用户输入",
  "Color scheme": "配色方案",
  Commands: "命令",
  Comment: "评论",
  Commit: "提交",
  "Commit changes": "提交更改",
  "Commit message": "提交说明",
  "Commit on new branch": "提交到新分支",
  "Commit, files, branches": "提交、文件和分支",
  Configuration: "配置",
  Confirm: "确认",
  "Confirm action": "确认操作",
  "Connect an environment to see usage.": "连接环境后即可查看用量。",
  Connected: "已连接",
  Connecting: "正在连接",
  "Connecting to environment": "正在连接环境",
  "Connection failed": "连接失败",
  Copied: "已复制",
  "Copy code": "复制代码",
  "Copy message": "复制消息",
  "Copy path": "复制路径",
  "Copy trace ID": "复制跟踪 ID",
  "Could not cancel import": "无法取消导入",
  "Could not change project": "无法更改项目",
  "Could not delete pending task": "无法删除待处理任务",
  "Could not import shared content": "无法导入共享内容",
  "Could not load every archive": "部分归档加载失败",
  "Could not load T3 Connect environments": "无法加载 T3 Connect 环境",
  "Could not load conversation": "无法加载对话",
  "Could not read limits.": "无法读取额度。",
  "Could not archive thread": "无法归档任务",
  "Could not delete thread": "无法删除任务",
  "Could not settle thread": "无法收起任务",
  "Could not unarchive thread": "无法取消归档任务",
  "Could not un-settle thread": "无法恢复任务",
  "Could not move thread": "无法移动任务",
  "Could not pin thread": "无法置顶任务",
  "Could not queue task": "无法将任务加入队列",
  "Could not regenerate title": "无法重新生成标题",
  "could not report usage.": "无法报告用量。",
  "Could not snooze thread": "无法稍后处理任务",
  "Could not start task": "无法启动任务",
  "Could not switch branch": "无法切换分支",
  "Could not restore draft": "无法恢复草稿",
  "Could not unpin thread": "无法取消置顶任务",
  "Could not update environment": "无法更新环境",
  "Could not wake thread": "无法唤醒任务",
  "Create & checkout": "创建并切换",
  "Create a task to start a new coding session.": "创建任务以开始新的编程会话。",
  "Create worktree": "创建工作树",
  "Created at": "创建时间",
  "Custom font size": "自定义字号",
  Decline: "拒绝",
  Default: "默认",
  "Default grouping": "默认分组",
  "Delete pending task?": "删除待处理任务？",
  "Device Notifications": "设备通知",
  "Dismiss voice input error": "关闭语音输入错误",
  "Disable notifications": "关闭通知",
  "Dismiss keyboard": "收起键盘",
  Environment: "环境",
  "Environment caches": "环境缓存",
  "Environment unavailable": "环境不可用",
  Error: "错误",
  "Excluded from this commit": "未包含在本次提交中",
  "Existing branches": "现有分支",
  Failed: "失败",
  "Feature branch & continue": "创建功能分支并继续",
  "File actions": "文件操作",
  "File unavailable": "文件不可用",
  Files: "文件",
  "Files unavailable": "文件列表不可用",
  "Fill in the pending answers": "填写待回答内容",
  "Filter and sort archived threads": "筛选和排序已归档任务",
  "Filter and sort threads": "筛选和排序任务",
  "Filter models": "筛选模型",
  "Find a branch": "查找分支",
  "Find a model": "查找模型",
  "Full access": "完全访问",
  "Font size": "字号",
  General: "常规",
  Host: "主机",
  "Image unavailable": "图片不可用",
  "Markdown image": "Markdown 图片",
  Input: "待输入",
  "Inspect turn diffs, worktree changes, and base branch diff":
    "检查轮次差异、工作树更改和基础分支差异",
  "Inspecting cached data…": "正在检查缓存数据…",
  "Invalid QR code": "无效的二维码",
  Label: "名称",
  "Latest turn": "最新轮次",
  "Last user message": "最近用户消息",
  "Live Activity Updates": "实时活动更新",
  Light: "浅色",
  "Leave a comment...": "留下评论…",
  "Leave empty to auto-generate": "留空以自动生成",
  Legacy: "旧版功能",
  "Legacy models": "旧版模型",
  "Legacy Thread List": "旧版任务列表",
  Legal: "法律信息",
  "Loading archive...": "正在加载归档…",
  "Loading branches...": "正在加载分支…",
  "Loading branches…": "正在加载分支…",
  "Loading diff…": "正在加载差异…",
  "Loading file...": "正在加载文件…",
  "Loading image...": "正在加载图片…",
  "Loading image…": "正在加载图片…",
  "Loading linked cloud environments.": "正在加载关联的云端环境。",
  "Loading environments": "正在加载环境",
  "Loading messages...": "正在加载消息…",
  "Loading projects and threads from the saved environment.": "正在从已保存的环境加载项目和任务。",
  "Loading projects from the saved environment.": "正在从已保存的环境加载项目。",
  "Loading task": "正在加载任务",
  Limits: "额度",
  "Local folder": "本地文件夹",
  "Managed by T3 Connect. Tunnel details update automatically.":
    "由 T3 Connect 管理，隧道信息会自动更新。",
  "Messages, labels, and headings scale with this size.": "消息、标签和标题会随此字号缩放。",
  "Mobile control surface for your live coding environments": "随时控制正在运行的编程环境",
  "Cloud VM": "云端虚拟机",
  "Mac mini": "Mac mini",
  "Mac Studio": "Mac Studio",
  "Model and reasoning settings": "模型与推理设置",
  "Model filters": "模型筛选",
  "Microphone unavailable": "麦克风不可用",
  "Move down": "下移",
  "Move up": "上移",
  "Messages not cached": "消息尚未缓存",
  More: "更多",
  "more files": "个其他文件",
  "Navigate up": "返回上一级",
  "Native terminal unavailable. Using text fallback.": "原生终端不可用，正在使用文本模式。",
  "New branch": "新建分支",
  "New task": "新建任务",
  "New Task": "新建任务",
  "New Thread": "新建任务",
  "New worktree": "新建工作树",
  "Newest first": "最新优先",
  "No activity in this window.": "此时间范围内没有活动。",
  "No additional linked cloud environments.": "没有其他关联的云端环境。",
  "No cached data": "没有缓存数据",
  "No changed files are available to commit.": "没有可提交的文件更改。",
  "No changes": "没有更改",
  "No conversation yet": "还没有对话",
  "No environments connected yet.": "尚未连接环境。",
  "No environments connected": "尚未连接环境",
  "No files found": "未找到文件",
  "No local branches found.": "未找到本地分支。",
  "No matching models": "没有匹配的模型",
  "No matching commands.": "没有匹配的命令。",
  "No matching files or folders.": "没有匹配的文件或文件夹。",
  "No open PR": "没有打开的 PR",
  "No project scripts": "没有项目脚本",
  "No projects found": "未找到项目",
  "No results": "没有结果",
  "No review diffs": "没有可审查的差异",
  "No selection": "尚未选择内容",
  "No threads yet": "还没有任务",
  "No skills found.": "未找到技能。",
  "No results.": "没有结果。",
  "Not a git repository": "不是 Git 仓库",
  "Not a repo": "不是仓库",
  "Not connected": "未连接",
  "Notifications disabled": "通知已关闭",
  "Notifications enabled": "通知已启用",
  "Notifications unavailable": "通知不可用",
  "Notifications were denied for this app. Open Settings to enable them.":
    "此应用的通知权限已被拒绝。请前往系统设置启用。",
  "Notifications were not enabled.": "通知未能启用。",
  "Offline cache records will appear here after environments are used.":
    "使用环境后，离线缓存记录会显示在这里。",
  "Oldest first": "最早优先",
  "Open files": "打开文件",
  "Open in Browser": "在浏览器中打开",
  "Open in browser": "在浏览器中打开",
  "Open in Safari": "在浏览器中打开",
  "Open legal documents in external browser": "在外部浏览器中打开法律文档",
  "Open new terminal": "打开新终端",
  "Open terminal to start a shell.": "打开终端以启动 Shell。",
  "Open settings": "打开设置",
  "Open microphone settings": "打开麦克风设置",
  Offline: "离线",
  "Opt into retired interfaces kept for compatibility. Plan Mode restores the Build/Plan control; otherwise every task runs in Build mode.":
    "启用为兼容性保留的旧版界面。计划模式会恢复构建/计划控制；否则所有任务均以构建模式运行。",
  Options: "选项",
  "Or type a custom answer": "或输入自定义回答",
  Output: "输出",
  "Pairing code": "配对码",
  "Partial diff": "差异内容不完整",
  "Partial file": "文件内容不完整",
  Pending: "等待中",
  "Plain text": "纯文本",
  "Plan Mode": "计划模式",
  Plan: "方案",
  Build: "执行",
  "Plan Ready": "计划已就绪",
  "Photo Library": "照片图库",
  Preparing: "正在准备",
  "Preparing voice input": "正在准备语音输入",
  Pin: "置顶",
  "Preparing image preview...": "正在准备图片预览…",
  "Preparing preview...": "正在准备预览…",
  Preview: "预览",
  "Preview failed": "预览失败",
  "Preview limited to the first 1 MB of a truncated file.": "截断文件仅预览前 1 MB。",
  "Processed tokens": "已处理 Token",
  Photos: "照片",
  Project: "项目",
  "Project already exists": "项目已存在",
  "Project Grouping": "项目分组",
  Provider: "服务提供方",
  Providers: "服务提供方",
  Reasoning: "推理强度",
  Reconnecting: "正在重新连接",
  "Reconnect this environment to load the conversation.": "重新连接此环境以加载对话。",
  "Regenerate title": "重新生成标题",
  "Regenerating…": "正在重新生成…",
  "Pull latest": "拉取最新更改",
  Queued: "已排队",
  "queued message": "条排队消息",
  Refresh: "刷新",
  "Refresh models": "刷新模型",
  "Refresh archived threads": "刷新已归档任务",
  "Refresh files": "刷新文件",
  "Remove environment?": "移除环境？",
  Repository: "仓库",
  Reset: "重置",
  "Resize detail pane": "调整详情面板大小",
  "Restart the app and try again.": "请重启应用后重试。",
  "Retry now": "立即重试",
  "Return home": "返回首页",
  "Return to chat": "返回对话",
  "Review changes": "审查更改",
  "Review unavailable": "审查不可用",
  "Run command": "运行命令",
  "Route not found": "找不到页面",
  Runtime: "运行环境",
  Save: "保存",
  "Scan QR Code": "扫描二维码",
  "Scan QR code": "扫描二维码",
  "Scanning provider transcripts…": "正在扫描服务提供方记录…",
  "Scroll to end": "滚动到底部",
  Search: "搜索",
  "Search archived threads": "搜索已归档任务",
  "Search files": "搜索文件",
  "Search threads": "搜索任务",
  "Select a diff line or range first.": "请先选择一行或一段差异。",
  "Select a thread": "选择任务",
  "Select diff": "选择差异",
  "Select review diff": "选择要审查的差异",
  "Set up T3 Connect": "设置 T3 Connect",
  Settle: "收起",
  Settings: "设置",
  "Shared content unavailable": "共享内容不可用",
  "Show keyboard": "显示键盘",
  "Show legacy models": "显示旧版模型",
  "Show threads from every environment": "显示所有环境的任务",
  "Show threads from every project": "显示所有项目的任务",
  "Sign in to T3 Connect": "登录 T3 Connect",
  "Sign in to your T3 account to set up T3 Connect.": "登录 T3 账户以设置 T3 Connect。",
  "Sign in": "登录",
  Skills: "技能",
  Snooze: "稍后处理",
  "Snooze until": "稍后处理至",
  "Some environments are still reporting. Totals are partial.":
    "部分环境仍在上报，用量汇总暂不完整。",
  "Some shared content was skipped": "部分共享内容已跳过",
  "Sort by archived date": "按归档日期排序",
  "Sort projects": "排序项目",
  "Sort threads": "排序任务",
  Source: "来源",
  "Start another shell for this thread": "为此任务启动另一个终端",
  "Start dictation": "开始语音输入",
  "Start from origin": "从 origin 开始",
  "Start or reconnect an environment before adding a project.":
    "添加项目前，请先启动或重新连接环境。",
  Stop: "停止",
  "Stop agent": "停止 Agent",
  Supervised: "监督模式",
  System: "跟随系统",
  "Syncing messages...": "正在同步消息…",
  Transcribing: "正在转写",
  "Storage unavailable": "存储不可用",
  "Submit answers": "提交回答",
  "Switch branch, create branch, or move to a worktree": "切换或创建分支，或移动到工作树",
  "T3 Account": "T3 账户",
  "T3 Code works locally without signing in. Cloud features are optional.":
    "无需登录即可在本地使用 T3 Code，云端功能为可选项。",
  Tap: "点击",
  Terminal: "终端",
  "Terminal options": "终端选项",
  "Terminal unavailable": "终端不可用",
  Text: "文本",
  "Text size": "文本字号",
  "That snooze time has passed. Choose another time.": "该稍后处理时间已经过去，请选择其他时间。",
  "The image could not be loaded into the local cache.": "无法将图片加载到本地缓存。",
  "The pull request could not be opened.": "无法打开 Pull Request。",
  "The shared content is no longer in the inbox. You can continue editing this task draft.":
    "共享内容已不在收件箱中，你仍可继续编辑此任务草稿。",
  Themes: "主题",
  "This branch does not have an open pull request.": "此分支没有打开的 Pull Request。",
  "The connected environment did not report any projects.": "已连接的环境没有返回任何项目。",
  "The pending task could not be removed.": "无法移除待处理任务。",
  "This thread was deleted or is no longer available.": "此任务已删除或不再可用。",
  "This environment's server does not support pinned reordering yet. Update the server to reorder pins.":
    "此环境的服务器暂不支持调整置顶顺序，请更新服务器。",
  "This environment's server does not support pinning yet. Update the server to use Pin.":
    "此环境的服务器暂不支持置顶，请更新服务器。",
  "This environment's server does not support settling yet. Update the server to use Settle.":
    "此环境的服务器暂不支持收起任务，请更新服务器。",
  "This environment's server does not support snoozing yet. Update the server to use Snooze.":
    "此环境的服务器暂不支持稍后处理，请更新服务器。",
  "This environment's server does not support snoozing yet. Update the server to wake this thread.":
    "此环境的服务器暂不支持唤醒任务，请更新服务器。",
  "This environment's server does not support title regeneration yet. Update the server to regenerate thread titles.":
    "此环境的服务器暂不支持重新生成标题，请更新服务器。",
  "This file path is invalid.": "文件路径无效。",
  "This project has no saved scripts yet": "此项目还没有已保存的脚本",
  "This removes offline data for every environment. Connections, credentials, account data, and app preferences stay intact.":
    "这会移除所有环境的离线数据，但会保留连接、凭据、账户数据和应用偏好。",
  "This removes offline threads, server metadata, and cached branches for this environment. The saved connection and credentials stay intact.":
    "这会移除此环境的离线任务、服务器元数据和缓存分支，但会保留连接与凭据。",
  "This terminal route needs an active thread and workspace.": "打开终端需要有效的任务和工作区。",
  "This thread does not have a workspace root yet, so there is nowhere to open a shell.":
    "此任务还没有工作区根目录，无法打开终端。",
  "This thread does not have an active workspace path.": "此任务没有有效的工作区路径。",
  "This thread has no ready turn diffs and the worktree diff is empty.":
    "此任务没有可用的轮次差异，工作树差异也为空。",
  "This thread is not available in the current mobile snapshot.": "当前移动端快照中没有此任务。",
  "This thread is working. Interrupt it first, then try again.": "此任务仍在运行，请先中断后重试。",
  "This thread still needs attention. Resolve or interrupt it first, then try again.":
    "此任务仍需处理，请先解决或中断后重试。",
  "Thread list options": "任务列表选项",
  "Thread settings": "任务设置",
  "Thread unavailable": "任务不可用",
  Threads: "任务",
  Totals: "汇总",
  "Try again": "重试",
  "Try Again": "重试",
  Turn: "轮次",
  "Turn diffs and worktree changes": "轮次差异与工作树更改",
  "type and press return": "输入后按回车",
  "Unable to open PR": "无法打开 PR",
  "Uncached input": "未缓存输入",
  Unpriced: "未计价",
  "Update failed": "更新失败",
  "Update ready": "更新已就绪",
  "Use template": "使用模板",
  "Start a Codex thread first": "请先启动 Codex 任务",
  "Send a message before you submit feedback.": "发送一条消息后才能提交反馈。",
  "Could not send feedback to OpenAI": "无法向 OpenAI 发送反馈",
  "Feedback sent to OpenAI": "反馈已发送给 OpenAI",
  "Sending feedback to OpenAI...": "正在向 OpenAI 发送反馈...",
  "An error occurred.": "发生了错误。",
  "Copy ID": "复制 ID",
  "Codex feedback thread ID": "Codex 反馈任务 ID",
  "Install Now": "立即安装",
  Later: "稍后",
  Delete: "删除",
  "Clear Cache": "清除缓存",
  Usage: "用量",
  "User input needed": "需要用户输入",
  "Un-settle": "恢复任务",
  Unpin: "取消置顶",
  Version: "版本",
  "Warning: this is the default branch.": "警告：这是默认分支。",
  Wake: "唤醒",
  "Wake thread": "唤醒任务",
  "What should we build": "想要构建什么",
  "Word break": "自动换行",
  "work log": "工作日志",
  "Working for": "已运行",
  "Working tree": "工作树",
  Working: "运行中",
  "You are offline": "当前处于离线状态",
  "Compact and continue": "压缩并继续",
  "Don't ask again": "不再询问",
  "Keep full history": "保留完整历史",
  "Keep full history and skip future resume prompts.": "保留完整历史，并跳过以后继续会话时的提示。",
  "Resume session": "继续会话",
  "Resume with a summary and use fewer tokens.": "生成摘要后继续，以减少令牌用量。",
  "Resume without changing the conversation.": "保留对话不变并继续。",
  "Cancel dictation": "取消语音输入",
  "Finish dictation": "完成语音输入",
  "All accounts are shown by connected providers.": "所有账户均已由已连接的服务提供方显示。",
  "Antigravity cannot be installed on this environment. Use a supported server host or set an executable path in provider settings.":
    "此环境无法安装 Antigravity。请使用受支持的服务器主机，或在服务提供方设置中指定可执行文件路径。",
  "Attach the file again and retry.": "请重新附加文件后重试。",
  "Cancel install": "取消安装",
  "Cancel sign-in": "取消登录",
  "Checking credentials.": "正在检查凭据。",
  "Checking environment access.": "正在检查环境访问权限。",
  "Checking Google sign-in.": "正在检查 Google 登录状态。",
  "Checking the Antigravity installation.": "正在检查 Antigravity 安装。",
  "Close image": "关闭图片",
  "Close video": "关闭视频",
  "Complete sign-in": "完成登录",
  Connect: "连接",
  "Connect with the credentials set in provider settings on web or desktop.":
    "使用网页版或桌面版服务提供方设置中配置的凭据进行连接。",
  "Copy full path": "复制完整路径",
  "Copy relative path": "复制相对路径",
  "Copy sign-in link": "复制登录链接",
  "Copy URL": "复制 URL",
  "Could not cancel sign-in. Try again.": "无法取消登录，请重试。",
  "Could not cancel the install. Try again.": "无法取消安装，请重试。",
  "Could not change this provider. Reconnect and try again.":
    "无法更改此服务提供方，请重新连接后重试。",
  "Could not check your environment access.": "无法检查环境访问权限。",
  "Could not complete Google sign-in. Check the return URL and try again.":
    "无法完成 Google 登录，请检查返回 URL 后重试。",
  "Could not copy the sign-in link.": "无法复制登录链接。",
  "Could not load this video.": "无法加载此视频。",
  "Could not load this video. Check the connection and try again.":
    "无法加载此视频，请检查连接后重试。",
  "Could not open Google sign-in. Copy the link and open it in your browser.":
    "无法打开 Google 登录页面，请复制链接并在浏览器中打开。",
  "Could not open PDF": "无法打开 PDF",
  "Could not open preview": "无法打开预览",
  "Could not open video": "无法打开视频",
  "Could not remove the managed install. Try again.": "无法移除托管安装，请重试。",
  "Could not share file": "无法共享文件",
  "Could not sign out of Google. Try again.": "无法退出 Google 登录，请重试。",
  "Could not start Google sign-in. Try again.": "无法启动 Google 登录，请重试。",
  "Could not start the install. Try again.": "无法启动安装，请重试。",
  "Could not use the reset credit.": "无法使用重置额度。",
  "Disable Antigravity": "停用 Antigravity",
  "Disable Antigravity?": "停用 Antigravity？",
  Disabled: "已停用",
  Disable: "停用",
  Disconnect: "断开连接",
  "Disconnect Antigravity?": "断开 Antigravity 连接？",
  Enabled: "已启用",
  "Enable Antigravity": "启用 Antigravity",
  "Enable Antigravity to sign in.": "请先启用 Antigravity 再登录。",
  "Extracting Antigravity files.": "正在解压 Antigravity 文件。",
  "Google account": "Google 账户",
  "Gemini Enterprise": "Gemini 企业版",
  "Gemini API key": "Gemini API 密钥",
  "Agent Platform (Vertex AI)": "Agent Platform（Vertex AI）",
  "Google sign-in return URL": "Google 登录返回 URL",
  Image: "图片",
  "Install Antigravity": "安装 Antigravity",
  "Install Antigravity to sign in.": "请先安装 Antigravity 再登录。",
  "Install status is unavailable. Reconnect and try again.": "无法获取安装状态，请重新连接后重试。",
  Installed: "已安装",
  Loading: "正在加载",
  "Loading provider settings.": "正在加载服务提供方设置。",
  "Loading video": "正在加载视频",
  "Loading video...": "正在加载视频...",
  "Media actions": "媒体操作",
  "No accounts reported.": "未报告任何账户。",
  "No limits reported.": "未报告额度。",
  "No reset credit left.": "没有剩余的重置额度。",
  "No reset credits banked": "没有可用的重置额度",
  "Not installed": "未安装",
  ". Not installed": "。未安装",
  "Nothing to reset right now.": "当前没有需要重置的额度窗口。",
  "Open Google sign-in": "打开 Google 登录页面",
  "Open in file viewer": "在文件查看器中打开",
  "Opening share sheet…": "正在打开共享面板…",
  "Opening share sheet...": "正在打开共享面板...",
  "Please try again.": "请重试。",
  "Preview unavailable": "预览不可用",
  "Reconnect to this environment and open the video again.": "请重新连接此环境后再次打开视频。",
  "Reconnect to this environment and try again.": "请重新连接此环境后重试。",
  "Reconnect to this environment to continue setup.": "请重新连接此环境以继续设置。",
  Remove: "移除",
  "Remove managed install": "移除托管安装",
  "Remove the Antigravity install?": "移除 Antigravity 安装？",
  "Reset applied. Your windows have cleared.": "重置已生效，当前额度窗口已清空。",
  "Retry connection": "重试连接",
  "Retry Google sign-in": "重试 Google 登录",
  "Retry install": "重试安装",
  "Retry video": "重试播放视频",
  Retry: "重试",
  "Save or share": "保存或共享",
  "Save or share video": "保存或共享视频",
  "Sign in with Google": "使用 Google 登录",
  "Sign in with the Google account you use for Antigravity.":
    "使用你用于 Antigravity 的 Google 账户登录。",
  "Sign-in has not been checked.": "尚未检查登录状态。",
  "Sign-in is open on another client. Complete it there or wait for it to expire.":
    "登录流程已在另一客户端打开，请在那里完成，或等待其过期。",
  "Sign-in status is unavailable. Reconnect and try again.": "无法获取登录状态，请重新连接后重试。",
  "Signed in. Credentials stay on this environment.": "已登录，凭据将保存在此环境中。",
  "Sign out": "退出登录",
  "Sign out of Google": "退出 Google 登录",
  "Sign out of Google?": "退出 Google 登录？",
  "Starting Google sign-in.": "正在启动 Google 登录。",
  "That credit was already redeemed.": "该重置额度已被使用。",
  "The file could not be loaded. It may have been moved or deleted.":
    "无法加载该文件，它可能已被移动或删除。",
  "The file could not be loaded. Please try again.": "无法加载该文件，请重试。",
  "The file could not be loaded. Reconnect and try again.": "无法加载该文件，请重新连接后重试。",
  "The local attachment file is missing.": "本地附件文件已丢失。",
  "The rest of this setup can be completed from web or desktop.":
    "其余设置可在网页版或桌面版中完成。",
  "This account has no subscription limits.": "此账户没有订阅额度。",
  "This attachment is no longer available. Attach the file again.":
    "此附件已不可用，请重新附加该文件。",
  "This connection cannot manage providers. Pair again with permission to operate this environment.":
    "此连接无权管理服务提供方。请重新配对，并授予操作此环境的权限。",
  "This file may be missing, unsupported, or unavailable on this environment.":
    "此文件可能已丢失、格式不受支持，或在该环境中不可用。",
  "This provider is not available on this environment.": "此环境中没有该服务提供方。",
  "This provider link is not valid.": "此服务提供方链接无效。",
  "This video couldn't be loaded or played. Check the connection, or touch and hold the video to save or share the original.":
    "无法加载或播放此视频。请检查连接，或长按视频以保存或共享原文件。",
  "Touch and hold for media actions": "长按以显示媒体操作",
  "Try again.": "请重试。",
  "Upload failed. Tap to retry.": "上传失败，点击重试。",
  "Use a reset credit": "使用重置额度",
  "Use a reset credit?": "使用一个重置额度？",
  "Use credit": "使用额度",
  "Using credit…": "正在使用额度…",
  "Use reset": "使用重置额度",
  "Usage limits": "用量限额",
  "Dismiss usage limits": "关闭用量限额",
  "Dismiss feedback notice": "关闭反馈提示",
  "Dismiss without answering": "不回答并关闭",
  "Ahead of pace": "用量偏快",
  "On pace": "用量正常",
  "Under pace": "用量偏慢",
  left: "剩余",
  now: "现在",
  "Show account details": "显示账号详情",
  "Select an environment to see limits.": "选择一个环境以查看限额。",
  "No provider on the selected environments reports subscription limits.":
    "所选环境中没有服务提供方报告订阅限额。",
  "Hide account email": "隐藏账号邮箱",
  "Reveal account email": "显示账号邮箱",
  "This account is no longer reporting limits on the selected environments.":
    "此账号已不再报告所选环境的限额。",
  Resets: "重置时间",
  Restores: "恢复额度",
  "Signed in": "登录位置",
  "Reset credits": "重置额度",
  "Raw token cost": "原始 Token 成本",
  "* if billed at full API rate": "* 按完整 API 费率估算",
  "Past 24 hours": "过去 24 小时",
  "Past 7 days": "过去 7 天",
  "Past 30 days": "过去 30 天",
  "Past 90 days": "过去 90 天",
  Cost: "成本",
  Tokens: "Token",
  Environments: "环境",
  "Filter usage environments": "筛选用量环境",
  "Filter usage environments, some environments are loading": "筛选用量环境，部分环境仍在加载",
  "Select an environment to see usage.": "选择一个环境以查看用量。",
  "Older server · excluded from usage totals": "服务器版本较旧 · 未计入用量总计",
  "Disconnected · showing saved usage": "连接已断开 · 正在显示已保存的用量",
  "Waiting for connection…": "正在等待连接…",
  "Usage unavailable · showing saved totals": "用量不可用 · 正在显示已保存的总计",
  "Usage unavailable": "用量不可用",
  "Updating usage…": "正在更新用量…",
  "Loading usage…": "正在加载用量…",
  "Usage up to date": "用量已是最新",
  "Cache read": "缓存读取",
  "Cache write": "缓存写入",
  "of records, excluded from cost": "记录未计价，已从成本中排除",
  "Video unavailable": "视频不可用",
  "Waiting for the environment.": "正在等待环境响应。",
  "Complete sign-in in your browser.": "请在浏览器中完成登录。",
  "After sign-in, the browser will open a 127.0.0.1 address that cannot load on your phone. Copy that full address and paste it here.":
    "登录后，浏览器会打开一个手机无法访问的 127.0.0.1 地址。请复制完整地址并粘贴到这里。",
  "This redeems one credit on your account and clears the current rate-limit windows. It cannot be undone.":
    "这会使用账户中的一个重置额度并清空当前速率限制窗口，且无法撤销。",
  "Attachment still uploading": "附件仍在上传",
  "Retry or remove the failed attachment": "请重试或移除上传失败的附件",
  Worktree: "工作树",
  "Switching branch...": "正在切换分支…",
  "The branch could not be checked out.": "无法检出该分支。",
  "The task could not be saved to the outbox.": "无法将任务保存到发送队列。",
  "Your prompt was kept in the project draft.": "你的提示词已保留在项目草稿中。",
  "Edit task": "编辑任务",
  "Setting up worktree…": "正在设置工作树…",
  "Starting…": "正在启动…",
  "Starting the task…": "正在启动任务…",
  "New thread on branch": "基于分支新建任务",
  "Approval from": "批准请求来自",
  "Failed to submit approval decision.": "提交批准决定失败。",
  "Subagent work": "子 Agent 工作",
  "Read only. These subagents cannot take messages.": "仅供查看。这些子 Agent 无法接收消息。",
  "The provider has no record of which subagents this call started.":
    "提供商未记录此次调用启动了哪些子 Agent。",
  Subagent: "子 Agent",
  "Earlier steps are not shown.": "更早的步骤未显示。",
  "No transcript yet.": "暂无记录。",
  Work: "工作记录",
  "Runs on its own": "独立运行",
  "It runs on its own and cannot take messages.": "此子 Agent 独立运行，无法接收消息。",
  Starting: "正在启动",
  Idle: "空闲",
  Waiting: "等待中",
  Completed: "已完成",
  Interrupted: "已中断",
  Cancelled: "已取消",
  "Switch this thread's mode to continue.": "请切换此任务的运行模式后继续。",
  "Managed by": "管理方：",
  "Provider not allowed": "不允许使用此提供商",
  "Ask before commands and file changes.": "执行命令和更改文件前先询问。",
  "Auto-approve edits, ask before other actions.": "自动批准编辑，执行其他操作前先询问。",
  "Supported providers approve routine actions; others still ask.":
    "支持此功能的提供商会批准常规操作，其他提供商仍会询问。",
  "Allow commands and edits without prompts.": "无需询问即可执行命令和编辑文件。",
  "Switch the task to a timer, or turn it off, to save it.":
    "请将任务改为定时触发或停用任务后再保存。",
  "Once is not available here": "此处不支持单次任务",
  "This environment runs an older T3 Code. Update it to schedule a one-time task, or pick another schedule.":
    "此环境运行的是旧版 T3 Code。请更新后再设置单次任务，或选择其他计划。",
  Once: "单次",
  Date: "日期",
  "Duplicate request key": "重复请求识别键",
  "Requests with the same key run only once within 7 days.":
    "相同识别键的请求在 7 天内仅执行一次。",
  "Coalescing runs the latest payload when the window from the first delivery closes. Empty keys run normally.":
    "合并窗口从首次送达时开始计时，窗口结束后执行最新载荷。识别键为空的请求正常执行。",
  "This task previously ran more than once per minute. Saving requires an interval of at least 1 minute.":
    "此任务此前每分钟运行多次。保存时需将间隔设为至少 1 分钟。",
  "The provider process for this request is no longer available. Interrupt or restart the run to continue.":
    "处理此请求的提供商进程已不可用。请中断或重启本次运行后继续。",
  "On-device voice transcription is not available for this device language.":
    "此设备语言不支持设备端语音转写。",
  "Not enough storage for on-device dictation. Free device storage and retry.":
    "存储空间不足，无法进行设备端听写。请释放设备存储空间后重试。",
  "On-device speech quota reached. Let the device rest or charge it, then retry.":
    "已达到设备端语音用量限制。请让设备休息或充电后重试。",
  "No speech was detected. Speak again and retry dictation.":
    "未检测到语音。请重新说话并重试听写。",
  "On-device speech is busy. Wait for it to finish, then retry dictation.":
    "设备端语音服务正忙。请等待其完成后重试听写。",
  "Update Android and its on-device speech services, then retry dictation.":
    "请更新 Android 及其设备端语音服务，然后重试听写。",
  "Speech model download failed. Check your network connection and retry.":
    "语音模型下载失败。请检查网络连接后重试。",
  "The speech engine could not process the complete recording. No text was added. Retry dictation.":
    "语音引擎无法处理完整录音，未添加任何文本。请重试听写。",
  "Speech recognition could not process the complete recording. No text was added. Retry dictation.":
    "语音识别无法处理完整录音，未添加任何文本。请重试听写。",
  "Voice transcription could not prepare this language. Check Google speech services and try again.":
    "语音转写无法准备此语言。请检查 Google 语音服务后重试。",
  "Voice transcription failed.": "语音转写失败。",
  "Voice transcription requires a supported device with iOS 26 or later.":
    "语音转写需要受支持且运行 iOS 26 或更新版本的设备。",
  "Voice transcription does not support this device language.": "语音转写不支持此设备语言。",
  "Voice transcription could not prepare this language.": "语音转写无法准备此语言。",
  Wired: "有线",
  "Other wired": "其他有线麦克风",
  "Headsets and USB microphones not listed": "未列出的耳麦和 USB 麦克风",
  Bluetooth: "蓝牙",
  "Other Bluetooth": "其他蓝牙麦克风",
  "Earbuds, headsets, and cars, including Android Auto, not listed":
    "未列出的耳机、耳麦和车载设备（包括 Android Auto）",
  "AirPods, headsets, and cars not listed": "未列出的 AirPods、耳麦和车载设备",
  "The microphone on this device": "此设备的麦克风",
  "The car’s microphone": "车载麦克风",
  "Voice input": "语音输入",
  "Not available on this device": "此设备不支持",
  "Microphone access": "麦克风访问权限",
  "Allow microphone access": "允许访问麦克风",
  "Open Settings": "打开设置",
  "Voice input needs microphone access before it can record or list your microphones.":
    "语音输入需要麦克风访问权限才能录音或列出麦克风。",
  "Microphone access is off for T3 Code. Turn it on in Settings to use voice input.":
    "T3 Code 的麦克风访问权限已关闭。请在设置中开启后使用语音输入。",
  "Voice input prefers the first connected microphone in this list. Wired and Bluetooth devices are added by name after you use voice input with them connected; until then, the Other row ranks them. Swipe a device left to forget it.":
    "语音输入优先使用此列表中排序最靠前且已连接的麦克风。有线和蓝牙设备连接后使用过语音输入，才会按名称加入列表；在此之前，其优先级由“其他”行决定。向左轻扫设备即可将其忘记。",
  "Voice transcription is still finishing. Try again shortly.": "语音转写仍在完成中。请稍后重试。",
  "Voice transcription is not available for this language.": "此语言不支持语音转写。",
  "Could not prepare voice transcription.": "无法准备语音转写。",
  "Could not transcribe this recording.": "无法转写此录音。",
  "This draft is no longer available.": "此草稿已不可用。",
  "Another voice recording is already active.": "已有另一段语音录音正在进行。",
  "Voice transcription is not available.": "语音转写不可用。",
  "Microphone access is required for voice input.": "语音输入需要麦克风访问权限。",
  "Could not start voice recording.": "无法开始语音录音。",
  "Voice recording was interrupted.": "语音录音已中断。",
  "Voice input stopped when the app moved to the background.": "应用转入后台时，语音输入已停止。",
  "Could not finish voice recording.": "无法完成语音录音。",
  "The draft changed while voice input was running. The transcript was not added.":
    "语音输入期间草稿发生了更改，未添加转写文本。",
  "No speech was detected.": "未检测到语音。",
  "Provider-managed agent": "由提供商管理的 Agent",
  subagent: "子 Agent",
  "This connection cannot respond to approvals.": "此连接无权回应批准请求。",
  "Why am I being asked this?": "为什么仍然需要询问我？",
  "Full access skips approvals, but an ask rule in the agent's own settings matches this action, so it still asks. Remove or narrow that rule to stop these prompts.":
    "完全访问模式会跳过批准，但 Agent 自身设置中的询问规则匹配了此操作，因此仍会询问。移除该规则或缩小其适用范围即可停止这些提示。",
  "Full access skips approvals, but the agent still stops for a few safety checks of its own that no setting can skip, such as a delete whose path it can't verify. T3 Code can't turn these off, so check the request and approve it if it's what you expect.":
    "完全访问模式会跳过批准，但 Agent 仍会执行一些无法通过设置跳过的安全检查，例如无法验证路径的删除操作。T3 Code 无法关闭这些检查，请核对请求，确认符合预期后再批准。",
  "Managed by {organization}.": "由 {organization} 管理。",
  "Some settings are managed by {organizations} and cannot be changed here.":
    "部分设置由 {organizations} 管理，无法在此更改。",
  "Get help from {organization}": "向 {organization} 寻求帮助",
  "{organization} manages T3 Code updates.": "{organization} 管理 T3 Code 更新。",
  "{organization} limits threads to {mode}.": "{organization} 将任务的运行模式限制为{mode}。",
  "Switch to {mode}": "切换为{mode}",
  "{organization}'s policy does not allow {capability}.":
    "{organization} 的策略不允许{capability}。",
  "{organization}'s policy does not allow the {provider} provider.":
    "{organization} 的策略不允许使用 {provider} 提供商。",
  "Your organization policy does not allow the {provider} provider.":
    "你所在组织的策略不允许使用 {provider} 提供商。",
  "Choose another model.": "请选择其他模型。",
  "Last run failed:": "上次运行失败：",
  "T3 Code's voice input uses Google's on-device speech recognition, which needs Android 12 or later with compatible Google speech services for the device language. Without it, the composer has no microphone button, and allowing microphone access won't add one. Keyboard voice typing is separate and isn't affected.":
    "T3 Code 的语音输入使用 Google 的设备端语音识别，需要 Android 12 或更新版本，以及支持设备语言的兼容 Google 语音服务。如果设备不满足条件，输入框中就不会显示麦克风按钮，授予麦克风权限也不会添加该按钮。键盘语音输入是独立功能，不受影响。",
  "T3 Code's voice input uses Apple's on-device speech transcription, which needs iOS 26 or later on a device that supports it. Without it, the composer has no microphone button, and allowing microphone access won't add one. Apple keyboard dictation is separate and isn't affected.":
    "T3 Code 的语音输入使用 Apple 的设备端语音转写，需要支持此功能且运行 iOS 26 或更新版本的设备。如果设备不满足条件，输入框中就不会显示麦克风按钮，授予麦克风权限也不会添加该按钮。Apple 键盘听写是独立功能，不受影响。",
  "Once, {date} at {time}": "单次，{date} {time}",
  "{position} of {count}": "第 {position} 项，共 {count} 项",
  "Runs on {environment}": "运行于 {environment}",
} as const satisfies Readonly<Record<string, string>>;

function translateDynamicMessage(value: string): string | null {
  const archivedProject = /^(.+) is still archived\. Try again later\.$/.exec(value);
  if (archivedProject) return `${archivedProject[1]} 仍处于归档状态，请稍后重试。`;
  const projectUpdate = /^Failed to update "(.+)"$/.exec(value);
  if (projectUpdate) return `无法更新“${projectUpdate[1]}”`;
  const projectTitle = /^Project · (.+)$/.exec(value);
  if (projectTitle) return `项目 · ${projectTitle[1]}`;
  const sharedAgent =
    /^It is shared with (other|\d+) working threads?\. Stop those to free it\.$/.exec(value);
  if (sharedAgent)
    return `该进程由${sharedAgent[1] === "other" ? "其他" : `另外 ${sharedAgent[1]} 个`}运行中的任务共享。停止这些任务后即可释放该进程。`;
  const forgetRelay = /^Forget (.+) and its cached threads on this device\.\n\n(.+)$/.exec(value);
  if (forgetRelay)
    return `忘记 ${forgetRelay[1]} 及其在此设备上缓存的任务。\n\n${localizeMobileString(forgetRelay[2]!, "zh-CN")}`;
  const relativeTime = /^(\d+)(m|h|d)$/.exec(value);
  if (relativeTime)
    return `${relativeTime[1]} ${relativeTime[2] === "m" ? "分钟" : relativeTime[2] === "h" ? "小时" : "天"}`;

  const linkFrom = /^Linked from (.+)$/.exec(value);
  if (linkFrom) return `来自 ${linkFrom[1]} 的关联`;
  const linkTo = /^Link (.+) to this environment$/.exec(value);
  if (linkTo) return `将 ${linkTo[1]} 关联到此环境`;
  const linkMachine = /^Link (.+)$/.exec(value);
  if (linkMachine) return `关联 ${linkMachine[1]}`;
  const linkedMachine = /^Linked (.+)$/.exec(value);
  if (linkedMachine) return `已关联 ${linkedMachine[1]}`;
  const linkFailure = /^Could not link: (.+)$/.exec(value);
  if (linkFailure) return `无法关联：${linkFailure[1]}`;
  const linkExpiry = /^Expires in (\d+) days?$/.exec(value);
  if (linkExpiry) return `${linkExpiry[1]} 天后过期`;
  const fileCount = /^(\d+) files?$/.exec(value);
  if (fileCount) return `${fileCount[1]} 个文件`;
  const zipLimit = /^Browsing works up to (.+)\. Save the ZIP to open it in another app\.$/.exec(
    value,
  );
  if (zipLimit) return `最多可浏览 ${zipLimit[1]} 的 ZIP。请保存后使用其他应用打开。`;
  const previewLimit = /^Previews stop at (.+)\. Save the file to open it in another app\.$/.exec(
    value,
  );
  if (previewLimit) return `预览上限为 ${previewLimit[1]}。请保存文件后使用其他应用打开。`;
  const linkAddress =
    /^This app has no address for (.+) that another machine can reach\. Enter its https or Tailscale address\.$/.exec(
      value,
    );
  if (linkAddress)
    return `此应用没有可供其他机器访问 ${linkAddress[1]} 的地址。请输入其 HTTPS 或 Tailscale 地址。`;
  const linkExisting =
    /^This environment is already linked to (.+)\. The agent can use that link as it is; change its access in Settings → Connections\.$/.exec(
      value,
    );
  if (linkExisting)
    return `此环境已关联到 ${linkExisting[1]}。Agent 可使用现有的关联；如需更改权限，请前往“设置 → 连接”。`;
  const createLink =
    /^Create a link on (.+): Settings → Connections → Create link, then paste its code here\.$/.exec(
      value,
    );
  if (createLink)
    return `在 ${createLink[1]} 上前往“设置 → 连接 → 创建关联”，然后将配对码粘贴到此处。`;

  const zipFilter = /^Filter (\d+) files?$/.exec(value);
  if (zipFilter) return `筛选 ${zipFilter[1]} 个文件`;
  const zipNoMatch = /^No files match “(.*)”$/.exec(value);
  if (zipNoMatch) return `没有文件匹配“${zipNoMatch[1]}”`;
  const remoteAgent = /^Runs on (.+)\. Connect to it to open its thread\.$/.exec(value);
  if (remoteAgent) return `运行于 ${remoteAgent[1]}。连接后可打开其任务。`;
  const stopNamed = /^(Stop|Stopping) (workflow|agent) (.+)$/.exec(value);
  if (stopNamed)
    return `${stopNamed[1] === "Stopping" ? "正在停止" : "停止"}${stopNamed[2] === "workflow" ? "工作流" : " Agent"} ${stopNamed[3]}`;
  const stopWorkflow = /^Every running agent in (.+) stops\.$/.exec(value);
  if (stopWorkflow) return `停止 ${stopWorkflow[1]} 中所有运行中的 Agent。`;

  const createPrivateRepository = /^Create private repository on (.+)$/.exec(value);
  if (createPrivateRepository) return `在 ${createPrivateRepository[1]} 上创建私有仓库`;
  const createRepositoryFailure = /^Could not create the (.+) repository$/.exec(value);
  if (createRepositoryFailure) return `无法创建 ${createRepositoryFailure[1]} 仓库`;

  const updatingProviders = /^Updating (\d+) providers…$/.exec(value);
  if (updatingProviders) return `正在更新 ${updatingProviders[1]} 个服务提供方…`;
  const updatingEnvironments = /^Updating (\d+) environments…$/.exec(value);
  if (updatingEnvironments) return `正在更新 ${updatingEnvironments[1]} 个环境…`;
  const updatingSource = /^Updating (.+)…$/.exec(value);
  if (updatingSource) return `正在更新 ${updatingSource[1]}…`;
  const savedUsageTotals = /^(.+) Showing saved totals\.$/.exec(value);
  if (savedUsageTotals)
    return `${localizeMobileString(savedUsageTotals[1]!, "zh-CN")} 正在显示已保存的总计。`;

  const environmentLabel = /^Environment: (.+)$/.exec(value);
  if (environmentLabel) return `环境：${environmentLabel[1]}`;
  const onMachine = /^on (.+)$/.exec(value);
  if (onMachine) return `在 ${onMachine[1]} 上`;

  const enableCursor = /^Enable Cursor usage from (.+)$/.exec(value);
  if (enableCursor) return `启用 ${enableCursor[1]} 的 Cursor 用量统计`;
  const enableOn = /^Enable on (.+)$/.exec(value);
  if (enableOn) return `在 ${enableOn[1]} 上启用`;
  const chatGptAccount = /^(.+)\. Open ChatGPT with the account you connected\.$/.exec(value);
  if (chatGptAccount) return `${chatGptAccount[1]}。请使用已连接的账户打开 ChatGPT。`;
  const unknownRates = /^no known rates · (.+) tokens$/.exec(value);
  if (unknownRates) return `暂无已知费率 · ${unknownRates[1]} 个令牌`;

  const percentUsed = /^(\d+)% used$/.exec(value);
  if (percentUsed) return `已使用 ${percentUsed[1]}%`;

  const percentLeft = /^(\d+)% left$/.exec(value);
  if (percentLeft) return `剩余 ${percentLeft[1]}%`;

  const sessions = /^Across (.+) sessions$/.exec(value);
  if (sessions) return `共 ${sessions[1]} 个会话`;

  const share = /^(.+) of (cost|tokens) · (.+?)(?: tokens)?$/.exec(value);
  if (share)
    return `${share[1]} 的${share[2] === "cost" ? "成本" : "Token"}占比 · ${share[3]} Token`;

  const periodAverage = /^(.+) per active (hour|day)$/.exec(value);
  if (periodAverage)
    return `每个活跃${periodAverage[2] === "hour" ? "小时" : "日期"} ${periodAverage[1]}`;

  const rawCost = /^(.+)x the raw cost$/.exec(value);
  if (rawCost) return `为原始成本的 ${rawCost[1]} 倍`;

  const observedInput = /^(.+) of observed input$/.exec(value);
  if (observedInput) return `占观测输入的 ${observedInput[1]}`;

  const cacheWrites = /^(.+) cache writes$/.exec(value);
  if (cacheWrites) return `${cacheWrites[1]} 个缓存写入 Token`;

  const reasoning = /^incl\. (.+) reasoning$/.exec(value);
  if (reasoning) return `其中推理 Token 为 ${reasoning[1]}`;

  const restoresPool = /^Restores (\d+)% of the pool$/.exec(value);
  if (restoresPool) return `恢复池额度的 ${restoresPool[1]}%`;

  const resetAt = /^Resets (.+)$/.exec(value);
  if (resetAt) return `重置时间：${resetAt[1]}`;

  const refreshLimits = /^(.+) could not refresh limits\. Showing the last known values\.$/.exec(
    value,
  );
  if (refreshLimits) return `${refreshLimits[1]} 无法刷新限额，正在显示上次已知值。`;

  const segment = /^Segment (\d+), (.+), (\d+)% left(.*)$/.exec(value);
  if (segment) {
    const timeLeft = /^, ([\d.]+)% of the window left$/.exec(segment[4] ?? "");
    const suffix = timeLeft ? `，额度周期剩余 ${timeLeft[1]}%` : segment[4];
    return `区段 ${segment[1]}，${segment[2]}，剩余 ${segment[3]}%${suffix}`;
  }

  const duplicateUsage =
    /^Counted once across environments sharing a transcript directory: (.+)$/.exec(value);
  if (duplicateUsage) return `共享同一记录目录的环境仅计一次：${duplicateUsage[1]}`;

  const playMedia = /^Play (.+)$/.exec(value);
  if (playMedia) return `播放 ${playMedia[1]}`;

  const providerSetup = /^(Set up|Manage) (.+)$/.exec(value);
  if (providerSetup) {
    return providerSetup[1] === "Set up" ? `设置 ${providerSetup[2]}` : `管理 ${providerSetup[2]}`;
  }

  const localizeDuration = (duration: string) =>
    duration
      .replace(/(\d+)d/g, "$1 天")
      .replace(/(\d+)h/g, "$1 小时")
      .replace(/(\d+)m/g, "$1 分钟");

  if (value === "resets now") return "即将重置";
  const inDuration = /^in (.+)$/.exec(value);
  if (inDuration) return `${localizeDuration(inDuration[1]!)}后`;
  const resetsIn = /^resets in (.+)$/.exec(value);
  if (resetsIn) return `${localizeDuration(resetsIn[1]!)}后重置`;

  const pace = /^(ahead of pace|on pace|under pace)(?: · (resets now|resets in .+))?$/.exec(value);
  if (pace) {
    const paceLabel =
      pace[1] === "ahead of pace" ? "用量偏快" : pace[1] === "under pace" ? "用量偏慢" : "用量正常";
    const resetLabel = pace[2] ? translateDynamicMessage(pace[2]) : null;
    return resetLabel ? `${paceLabel} · ${resetLabel}` : paceLabel;
  }

  const creditOptionSummary =
    /^(5-hour reset|Weekly reset|Fable reset|Full reset) · (\d+) left(?: · expires in (\d+d \d+h|\d+h \d+m|\d+m))?$/.exec(
      value,
    );
  if (creditOptionSummary)
    return `${localizeMobileString(creditOptionSummary[1]!, "zh-CN")} · 剩余 ${creditOptionSummary[2]} 个${creditOptionSummary[3] ? ` · 将在 ${localizeDuration(creditOptionSummary[3])}后过期` : ""}`;

  const creditOptionConfirmation =
    /^(5-hour reset|Weekly reset|Fable reset|Full reset): (.+) This cannot be undone\.$/.exec(
      value,
    );
  if (creditOptionConfirmation) {
    const descriptions: Readonly<Record<string, string>> = {
      "5-hour reset": "Refills your 5-hour limit.",
      "Weekly reset": "Refills your weekly limit.",
      "Fable reset":
        "Refills your Fable allowance and gives back what Fable used on your weekly limit. It doesn't reset your whole week.",
      "Full reset": "Refills your 5-hour and weekly limits.",
    };
    const [_, label, description] = creditOptionConfirmation;
    if (description === descriptions[label!])
      return `${localizeMobileString(label!, "zh-CN")}：${localizeMobileString(description!, "zh-CN")}此操作无法撤销。`;
  }

  const resetCredits = /^(\d+) reset credits? banked(?: · next expires in (.+))?$/.exec(value);
  if (resetCredits) {
    const expiry = resetCredits[2]
      ? ` · 下一额度将在 ${localizeDuration(resetCredits[2])}后过期`
      : "";
    return `有 ${resetCredits[1]} 个重置额度${expiry}`;
  }

  const limitsEnvironment = /^Limits · (.+)$/.exec(value);
  if (limitsEnvironment) return `额度 · ${limitsEnvironment[1]}`;

  const branchSelection = /^(Base branch|Branch): (.+)$/.exec(value);
  if (branchSelection)
    return `${branchSelection[1] === "Base branch" ? "基础分支" : "分支"}：${branchSelection[2]}`;

  const switchesWorkspace = /^Switches to (a new worktree|the current checkout)$/.exec(value);
  if (switchesWorkspace)
    return switchesWorkspace[1] === "a new worktree" ? "切换到新工作树" : "切换到当前检出目录";

  const newThreadOnBranch = /^New thread on (.+)$/.exec(value);
  if (newThreadOnBranch) return `基于 ${newThreadOnBranch[1]} 新建任务`;

  const installState = /^(Enabled|Disabled)\. (Installed)(?: (.+))?$/.exec(value);
  if (installState) {
    const enabled = installState[1] === "Enabled" ? "已启用" : "已停用";
    return `${enabled} · 已安装${installState[3] ? ` ${installState[3]}` : ""}`;
  }
  const notInstalledState = /^(Enabled|Disabled)\. Not installed$/.exec(value);
  if (notInstalledState) {
    return `${notInstalledState[1] === "Enabled" ? "已启用" : "已停用"} · 未安装`;
  }

  const downloading = /^Downloading (\d+)(?: of (\d+))? MB$/.exec(value);
  if (downloading) {
    return downloading[2]
      ? `正在下载 ${downloading[1]} / ${downloading[2]} MB`
      : `正在下载 ${downloading[1]} MB`;
  }

  const signInExpiry = /^Sign-in expires at (.+)\.$/.exec(value);
  if (signInExpiry) return `登录将在 ${signInExpiry[1]} 过期。`;

  const disableProvider =
    /^This stops Antigravity sessions on (.+)\. Google credentials stay saved\.$/.exec(value);
  if (disableProvider)
    return `这会停止 ${disableProvider[1]} 上的 Antigravity 会话，并保留 Google 凭据。`;

  const removeManagedInstall =
    /^This removes T3's managed install from (.+)\. Providers that use it will need it installed again\. Google credentials and threads stay\.$/.exec(
      value,
    );
  if (removeManagedInstall) {
    return `这会从 ${removeManagedInstall[1]} 移除 T3 托管的安装。使用它的服务提供方需要重新安装；Google 凭据和任务会保留。`;
  }

  const disconnectProvider =
    /^This stops Antigravity sessions for (.+) on (.+)\. Threads and files stay\.$/.exec(value);
  if (disconnectProvider) {
    return `这会停止 ${disconnectProvider[2]} 上 ${disconnectProvider[1]} 的 Antigravity 会话，并保留任务和文件。`;
  }

  const recording = /^Recording (\d+:\d{2})$/.exec(value);
  if (recording) return `正在录音 ${recording[1]}`;

  const working = /^Working for (.+)$/.exec(value);
  if (working) return `已运行 ${working[1]}`;

  const useTemplate = /^Use (.+) template$/.exec(value);
  if (useTemplate) return `使用“${useTemplate[1]}”模板`;

  const interactionMode = /^Interaction mode: (Plan|Build)$/.exec(value);
  if (interactionMode) return `交互模式：${interactionMode[1] === "Plan" ? "方案" : "执行"}`;

  const switchMode = /^Switches to (Plan|Build) mode$/.exec(value);
  if (switchMode) return `切换到${switchMode[1] === "Plan" ? "方案" : "执行"}模式`;

  const claudeResumeQuestion =
    /^This session is (?:(\d+)h (\d+)m|(\d+)m) old and uses (\d{1,3}(?:,\d{3})*) tokens\. Compact it before continuing\?$/.exec(
      value,
    );
  if (claudeResumeQuestion) {
    const age = claudeResumeQuestion[3]
      ? `${claudeResumeQuestion[3]} 分钟`
      : `${claudeResumeQuestion[1]} 小时 ${claudeResumeQuestion[2]} 分钟`;
    return `此会话已有 ${age}，当前使用 ${claudeResumeQuestion[4]} 个令牌。是否先压缩再继续？`;
  }

  const noThreads = /^No threads matching "(.+)"\.$/.exec(value);
  if (noThreads) return `没有与“${noThreads[1]}”匹配的任务。`;

  const showMore = /^Show more \((\d+) settled hidden\)$/.exec(value);
  if (showMore) return `显示更多（已隐藏 ${showMore[1]} 个已收起任务）`;

  const queuedMessages = /^(\d+) queued messages? will send automatically\.$/.exec(value);
  if (queuedMessages) return `${queuedMessages[1]} 条排队消息将在恢复连接后自动发送。`;

  const questionCount = /^(\d+) questions?$/.exec(value);
  if (questionCount) return `${questionCount[1]} 个问题`;

  const selectedCommitFiles = /^(\d+) of (\d+) selected · \+([\d.,kKmMbB]+) −([\d.,kKmMbB]+)$/.exec(
    value,
  );
  if (selectedCommitFiles)
    return `已选择 ${selectedCommitFiles[1]} / ${selectedCommitFiles[2]} 个文件 · +${selectedCommitFiles[3]} −${selectedCommitFiles[4]}`;

  const selectedFiles = /^(\d+) selected · \+(\d+) −(\d+)$/.exec(value);
  if (selectedFiles)
    return `已选择 ${selectedFiles[1]} 个 · +${selectedFiles[2]} −${selectedFiles[3]}`;

  const feedbackThreadId = /^Thread ID: (.+)$/.exec(value);
  if (feedbackThreadId) return `任务 ID：${feedbackThreadId[1]}`;

  const feedbackSent = /^Feedback sent to OpenAI\.\n\nThread ID: `(.+)`$/.exec(value);
  if (feedbackSent) return `反馈已发送给 OpenAI。\n\n任务 ID：\`${feedbackSent[1]}\``;

  const feedbackFailed = /^Could not send feedback to OpenAI\.\n\n([\s\S]+)$/.exec(value);
  if (feedbackFailed) return `无法向 OpenAI 发送反馈。\n\n${feedbackFailed[1]}`;

  return null;
}

export function localizeMobileString(value: string, locale: MobileLocale = MOBILE_LOCALE): string {
  if (locale !== "zh-CN") return value;

  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? "";
  const source = value.trim();
  if (!source) return value;

  const translated = Object.hasOwn(ZH_CN_MESSAGES, source)
    ? (ZH_CN_MESSAGES as Readonly<Record<string, string>>)[source]
    : translateDynamicMessage(source);
  return translated === undefined || translated === null
    ? value
    : `${leadingWhitespace}${translated}${trailingWhitespace}`;
}

export function localizeAlertArguments(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  locale: MobileLocale = MOBILE_LOCALE,
): {
  readonly title: string;
  readonly message?: string;
  readonly buttons?: AlertButton[];
} {
  return {
    title: localizeMobileString(title, locale),
    message: message === undefined ? undefined : localizeMobileString(message, locale),
    buttons: buttons?.map((button) => ({
      ...button,
      text: button.text === undefined ? undefined : localizeMobileString(button.text, locale),
    })),
  };
}

export type LocalizedAlertApi = {
  prompt: typeof import("react-native").Alert.prompt;
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions): void;
};

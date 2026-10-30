import type { AlertButton, AlertOptions } from "react-native";

export type MobileLocale = "en" | "zh-CN";

export const MOBILE_LOCALE: MobileLocale =
  process.env.EXPO_PUBLIC_APP_LOCALE === "zh-CN" ? "zh-CN" : "en";

const ZH_CN_MESSAGES = {
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
} as const satisfies Readonly<Record<string, string>>;

function translateDynamicMessage(value: string): string | null {
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

  const translated =
    (ZH_CN_MESSAGES as Readonly<Record<string, string>>)[source] ?? translateDynamicMessage(source);
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

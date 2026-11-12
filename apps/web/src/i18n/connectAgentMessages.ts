import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

import { translateWebSource, type WebMessageValues } from "./messages";

const ZH_CN_CONNECT_AGENT_SOURCE: Readonly<Record<string, string>> = {
  "This sign-in link is incomplete": "此登录链接不完整",
  "Open this page in its own window": "请在独立窗口中打开此页面",
  "For your safety, agent sign-ins cannot be approved inside another site.":
    "为保障你的安全，无法在其他网站内批准 Agent 登录。",
  "Connecting to T3 Connect": "正在连接 T3 Connect",
  "One moment while your account loads.": "正在加载你的账号，请稍候。",
  "Sign in to approve": "登录后批准",
  "Sign in to T3 Connect with the account this environment is linked to.":
    "请使用此环境所关联的账号登录 T3 Connect。",
  "Use a sign-in code instead": "改用登录验证码",
  "Use another account": "使用其他账号",
  "The environment returned an address this page will not open.":
    "环境返回的地址不安全，此页面不会打开该地址。",
  "Choose what it may do": "请选择允许执行的操作",
  "whoever runs it gets this access": "运行它的人将获得此访问权限",
  "Open {app} on the web": "在网页中打开 {app}",
  "When {app} opens the sign-in page, choose what it may do and approve with your T3 Connect account.":
    "当 {app} 打开登录页面时，请选择允许执行的操作，并使用你的 T3 Connect 账号批准。",
  "Could not reach that environment through T3 Connect with this account.":
    "无法使用此账号通过 T3 Connect 连接该环境。",
  // OAuth approval grants access; it is not the composer's one-time tool approval.
  Approve: "批准",
  "Approving…": "正在批准…",
  App: "应用",
  "Copy command": "复制命令",
  Access: "访问权限",
  Connect: "连接",
  Back: "返回",
  Next: "下一步",
  Done: "完成",
  Cancel: "取消",
  Remove: "移除",
  Edit: "编辑",
  Refresh: "刷新",
  Service: "服务",
  Custom: "自定义",
  Models: "模型",
  Test: "测试",
  Off: "关闭",
  "Use T3 Code in another app (MCP) · {name}": "在其他应用中使用 T3 Code（MCP）· {name}",
  "Connect to an environment first.": "请先连接一个环境。",
  "T3 Connect is not available in this build.": "此版本不支持 T3 Connect。",
  "the app": "此应用",
  "What can {app} do?": "允许 {app} 做什么？",
  "Runs commands and edits files without asking": "无需询问即可运行命令和编辑文件",
  "This device needs the Manage access permission on {name}.":
    "此设备需要 {name} 上的“管理访问权限”权限。",
  "This device cannot grant this on {name}.": "此设备无法在 {name} 上授予此权限。",
  "Check again": "重新检查",
  "Checking T3 Connect…": "正在检查 T3 Connect…",
  "Sign in to T3 Connect": "登录 T3 Connect",
  "Apps like Poke and Claude run in the cloud. They need a public address to reach {name}.":
    "Poke 和 Claude 等应用在云端运行，需要一个公共地址才能访问 {name}。",
  "T3 Connect gives {name} that address. Each app still needs your approval.":
    "T3 Connect 为 {name} 提供这个地址。每个应用仍需获得你的批准。",
  "Connect to {name} first.": "请先连接 {name}。",
  "{name}'s T3 Connect is offline": "{name} 的 T3 Connect 已离线",
  "Can't check T3 Connect on {name}": "无法检查 {name} 上的 T3 Connect",
  "Update T3 Code on {name}": "请更新 {name} 上的 T3 Code",
  "This device needs the View relay permission on {name}.":
    "此设备需要 {name} 上的“查看中继”权限。",
  "Fix: {fix}": "修复方法：{fix}",
  "Turn on T3 Connect for {name}": "为 {name} 开启 T3 Connect",
  "{name} gets a public https address, with no router setup.":
    "{name} 将获得一个公共 https 地址，无需配置路由器。",
  "Only apps you approve can use it. You can turn it off in Settings.":
    "只有你批准的应用才能使用。你可以在设置中将其关闭。",
  "Connecting…": "正在连接…",
  "Turn on": "开启",
  "Your T3 Connect account is out of tunnels.": "你的 T3 Connect 账号已用完隧道额度。",
  "Manage tunnels": "管理隧道",
  "Restart T3 Code on {name}.": "请重启 {name} 上的 T3 Code。",
  "Which app?": "选择哪个应用？",
  "Something else…": "其他应用…",
  Message: "消息",
  "Apps that require their own client ID cannot connect.": "需要自行提供客户端 ID 的应用无法连接。",
  "{app} help": "{app} 帮助",
  "Back to commands": "返回命令设置",
  "Back to one click": "返回一键设置",
  "Set up another way": "使用其他方式设置",
  "Could not open the link": "无法打开链接",
  "Run these where {app} runs.": "请在运行 {app} 的设备上执行这些命令。",
  "Could not copy": "无法复制",
  "Use Set up another way.": "请使用“使用其他方式设置”。",
  "Open {app}": "打开 {app}",
  "Open in {app}": "在 {app} 中打开",
  "Copy URL and open {app}": "复制 URL 并打开 {app}",
  "Copy message and open {app}": "复制消息并打开 {app}",
  "URL copied": "URL 已复制",
  "Message copied": "消息已复制",
  "Could not get a code from {name}. Try again.": "无法从 {name} 获取验证码。请重试。",
  "Code to approve {access}": "用于批准{access}的验证码",
  "Getting code…": "正在获取验证码…",
  "Get code": "获取验证码",
  "New code": "获取新验证码",
  Code: "验证码",
  "Expires {time} · one use": "{time} 后过期 · 仅限使用一次",
  "The code expired.": "验证码已过期。",
  "Copy {label}": "复制{label}",
  Expired: "已过期",
  "Linked: {names}": "已关联：{names}",
  "Manage access": "管理访问权限",
  "Open poke.com/integrations/new.": "打开 poke.com/integrations/new。",
  "Paste the URL and add the integration.": "粘贴 URL 并添加集成。",
  "In Claude, open Customize, then Connectors.":
    "在 Claude 中，打开 Customize（自定义），然后选择 Connectors（连接器）。",
  "Choose Add custom connector and paste the URL.":
    "选择 Add custom connector（添加自定义连接器），然后粘贴 URL。",
  "The Free plan allows one custom connector.": "免费套餐允许添加一个自定义连接器。",
  "Open chatgpt.com/plugins on the web, then + and Add custom MCP server.":
    "在网页中打开 chatgpt.com/plugins，点击 +，然后选择 Add custom MCP server（添加自定义 MCP 服务器）。",
  "Paste the URL. Choose OAuth.": "粘贴 URL，并选择 OAuth。",
  "Create it as a plugin, then install it.": "将其创建为插件，然后安装。",
  "Send this message to any of your Grok Bots.": "将此消息发送给你的任意一个 Grok Bot。",
  "Shared with all your Grok Bots.": "与你的所有 Grok Bot 共享。",
  "In Gemini, open Settings, then Connected apps.":
    "在 Gemini 中，打开 Settings（设置），然后选择 Connected apps（已连接的应用）。",
  "Choose Custom apps, then Add, and paste the URL.":
    "选择 Custom apps（自定义应用），点击 Add（添加），然后粘贴 URL。",
  "Send this message to Muse.": "将此消息发送给 Muse。",
  "In Instinct, open Settings, then MCP connections, if your account has it.":
    "如果你的账号支持，请在 Instinct 中打开 Settings（设置），然后选择 MCP connections（MCP 连接）。",
  "Open the Control UI, then + and Plugins, and choose Add MCP server.":
    "打开 Control UI（控制界面），点击 + 和 Plugins（插件），然后选择 Add MCP server（添加 MCP 服务器）。",
  "Paste the URL, and choose Streamable HTTP and OAuth.":
    "粘贴 URL，并选择 Streamable HTTP 和 OAuth。",
  "Select Sign in for it under Settings → MCP.":
    "在 Settings（设置）→ MCP 中为其选择 Sign in（登录）。",
  "Add t3code under mcp_servers in ~/.hermes/config.yaml, with the URL and auth: oauth.":
    "在 ~/.hermes/config.yaml 的 mcp_servers 下添加 t3code，填入 URL 和 auth: oauth。",
  "Run hermes mcp login t3code.": "运行 hermes mcp login t3code。",
  "On a remote host, paste the final URL back when asked.":
    "在远程主机上操作时，请按提示粘贴返回的最终 URL。",
  "Add a remote MCP server with OAuth.": "添加使用 OAuth 的远程 MCP 服务器。",
  "name set by the app": "名称由应用设置",
  "Access goes to": "访问权限授予目标",
  "on the computer that opened this page": "位于打开此页面的电脑上",
  "Only approve a sign-in you just started.": "请仅批准你刚刚发起的登录。",
  "Sign-in code": "登录验证码",
  "Paste a code": "粘贴验证码",
  "Get one from Use T3 Code in another app (MCP), Settings → Sharing & access, or {command} on this machine.":
    "可从“在其他应用中使用 T3 Code（MCP）”、“设置 → 共享与访问”获取，或在此设备上运行 {command}。",
  "Beyond read only, it can start, message and stop threads, and none of them can run with more than the mode you pick.":
    "除只读权限外，应用可以启动任务、发送消息和停止任务，但任何任务的运行权限都不会超过你选择的模式。",
  Then: "然后",
  "Skip the install if you already have {command}.": "如果已安装 {command}，可跳过安装。",
  "If {command} is not found after installing, add the folder the installer names to your PATH.":
    "如果安装后找不到 {command}，请将安装程序提示的文件夹添加到 PATH。",
  "Read only": "只读",
  Auto: "自动",
  Supervised: "监督模式",
  "Auto-accept edits": "自动接受编辑",
  "Full access": "完全访问",
  "Read projects and threads. Cannot start, message or change anything.":
    "读取项目和任务，无法启动任务、发送消息或进行任何更改。",
  "Ask before commands and file changes.": "执行命令和更改文件前先询问。",
  "Auto-approve edits, ask before other actions.": "自动批准编辑，执行其他操作前先询问。",
  "Supported providers approve routine actions; others still ask.":
    "支持此模式的提供商会批准常规操作，其他提供商仍会询问。",
  "Allow commands and edits without prompts.": "无需提示即可执行命令和编辑文件。",
  "Add generator": "添加生成器",
  "No text generators yet": "尚无文本生成器",
  "Add a model API to write thread titles, commit messages, and other short text without starting a coding agent.":
    "添加模型 API，无需启动编程 Agent 即可生成任务标题、提交消息和其他短文本。",
  "More actions for {name}": "{name} 的更多操作",
  "Show models": "显示模型",
  "Enable {name}": "启用 {name}",
  "Remove {name}?": "移除 {name}？",
  "This deletes the API key stored on {name}. Anything set to use this generator falls back to the text generation model.":
    "这将删除存储在 {name} 上的 API 密钥。使用此生成器的功能将回退到文本生成模型。",
  "Use it": "使用",
  "Thread titles and other generated text": "任务标题和其他生成文本",
  "Commit messages, pull requests, and branch names": "提交消息、拉取请求和分支名称",
  "Voice transcript cleanup": "语音转写整理",
  "Edit {name}": "编辑 {name}",
  "Add a text generator": "添加文本生成器",
  "Writes thread titles, commit messages, and other short text without starting a coding agent. Your API key is stored on this environment.":
    "无需启动编程 Agent 即可生成任务标题、提交消息和其他短文本。你的 API 密钥将存储在此环境中。",
  "Base URL": "基础 URL",
  "API key": "API 密钥",
  "API key (optional)": "API 密钥（可选）",
  "Name (optional)": "名称（可选）",
  "e.g. My local model": "例如：我的本地模型",
  "{name} is connected and lists {count} model. Switch any of these to it, or keep what they use now.":
    "已连接 {name}，共列出 {count} 个模型。可将下列功能切换为使用它，也可保留当前模型。",
  "{name} is connected and lists {count} models. Switch any of these to it, or keep what they use now.":
    "已连接 {name}，共列出 {count} 个模型。可将下列功能切换为使用它，也可保留当前模型。",
  Connecting: "正在连接",
  "Save and continue": "保存并继续",
  "{model} answered. It works.": "{model} 已响应，可以正常使用。",
  "Follows the text generation model": "跟随文本生成模型",
  "Search models": "搜索模型",
  "No models match.": "没有匹配的模型。",
  "Couldn't load {name} models": "无法加载 {name} 的模型",
  "{name} models": "{name} 的模型",
  "The model list couldn't load.": "无法加载模型列表。",
  "Loading the model list.": "正在加载模型列表。",
  "{count} model available. Pick one in a text generation model picker.":
    "有 {count} 个可用模型。请在文本生成模型选择器中选择一个。",
  "{count} models available. Pick one in a text generation model picker.":
    "有 {count} 个可用模型。请在文本生成模型选择器中选择一个。",
  "Could not add backend": "无法添加后端",
  "Failed to add backend.": "添加后端失败。",
  "Add the backend at {origin}?": "添加位于 {origin} 的后端？",
  "Backend added": "已添加后端",
  "The environment is saved and will reconnect on app startup.":
    "环境已保存，将在应用启动时自动重新连接。",
};

/** Translate UI templates before substituting opaque names, URLs, codes, and diagnostics. */
export function translateConnectAgentSource(
  locale: ResolvedAppLocale,
  source: string,
  values?: WebMessageValues,
): string {
  const message =
    locale === "zh-CN" && Object.hasOwn(ZH_CN_CONNECT_AGENT_SOURCE, source)
      ? ZH_CN_CONNECT_AGENT_SOURCE[source]!
      : translateWebSource(locale, source);
  return values === undefined
    ? message
    : message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) =>
        Object.hasOwn(values, name) ? String(values[name]) : placeholder,
      );
}

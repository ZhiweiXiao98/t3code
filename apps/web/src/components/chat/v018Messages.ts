import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { useI18n } from "~/i18n/WebI18nContext";

const messages: Readonly<Record<string, string>> = {
  "Voice input is ready": "语音输入已就绪",
  "Pick a microphone, then start talking.": "选择麦克风，然后开始说话。",
  "Other models": "其他模型",
  "Needs an admin to download": "需要管理员下载",
  "That microphone is unplugged. Pick another one.":
    "该麦克风已断开连接，请选择其他麦克风。",
  "Searching project models...": "正在搜索项目模型…",
  "Go to quoted response: {text}": "转到引用的回复：{text}",
  "Go to the response this replies to: {text}":
    "转到本条回复所回应的内容：{text}",
  "Agents here can then launch, message and wait on threads there. Revoke it in that machine’s Sharing & access.":
    "此处的智能体即可在那台机器上启动对话、发送消息及等待对话完成。可在那台机器的“共享与访问”中撤销权限。",
  ": Settings → Sharing & access → Authorized clients → Create link, then paste its code here.":
    "：设置 → 共享与访问 → 已授权客户端 → 创建链接，然后将配对码粘贴到此处。",
  ". The agent can use that link as it is; change its access in Settings → Environments.":
    "。智能体可直接使用该链接；如需更改访问权限，请前往设置 → 环境。",
  "Choose editor": "选择编辑器",
  "Draft changed while preparing this message. Review it and save again.":
    "准备此消息时草稿已更改。请检查后重新保存。",
  "The earlier edit was saved. Review your newer changes and save again.":
    "先前的编辑已保存。请检查较新的更改后重新保存。",
  "Added to the composer": "已添加到输入框",
  "The task is in the composer. Read it over, then send.":
    "任务已放入输入框。请检查后发送。",
  "Resolve the conflicts in this thread": "在此对话中解决冲突",
  "Fix the failing checks in this thread": "在此对话中修复失败的检查",
  "Retry transcription": "重试转写",
  "Open voice settings": "打开语音设置",
  "Record again": "重新录音",
  "Your next message starts a fresh session": "下一条消息将开始新会话",
  "The agent won't see earlier messages in this thread.":
    "智能体将无法看到此对话之前的消息。",
  "Keep the current session": "保留当前会话",
  "Microphone access needed": "需要麦克风访问权限",
  "Draft unavailable": "草稿不可用",
  "Another recording active": "已有录音正在进行",
  "Voice input unavailable": "语音输入不可用",
  "Transcription still busy": "仍在转录",
  "Language unsupported": "不支持此语言",
  "Couldn’t prepare dictation": "无法准备听写",
  "Couldn’t start recording": "无法开始录音",
  "Recording interrupted": "录音已中断",
  "Couldn’t finish recording": "无法完成录音",
  "Transcription failed": "转录失败",
  "Draft changed": "草稿已更改",
  "No speech detected": "未检测到语音",
  "Microphone processing failed": "麦克风处理失败",
  "Microphone disconnected": "麦克风已断开",
  "Voice input failed": "语音输入失败",
  "Open voice settings": "打开语音设置",
  "Retry transcription": "重试转录",
  "Record again": "重新录音",
  "Dismiss voice input error": "关闭语音输入错误提示",
  "Cancel voice input": "取消语音输入",
  "Start voice input": "开始语音输入",
  "Finish voice input": "完成语音输入",
  "Voice input is busy": "语音输入正忙",
  Skip: "跳过",
  Preparing: "正在准备",
  Recording: "正在录音",
  Transcribing: "正在转录",
  "Post-processing": "正在后处理",
  "Could not list microphones. You can still use the system default.":
    "无法列出麦克风，仍可使用系统默认设备。",
  "Selected microphone (Unavailable)": "所选麦克风（不可用）",
  "System default": "系统默认",
  "Set up voice input": "设置语音输入",
  Model: "模型",
  "Ready to dictate": "准备听写",
  "your transcription environment": "你的转录环境",
  "Speech model download progress": "语音模型下载进度",
  "Starting download…": "正在开始下载…",
  "Loading transcription models…": "正在加载转录模型…",
  Microphone: "麦克风",
  "Refresh microphones": "刷新麦克风",
  "Choose another model or language": "选择其他模型或语言",
  "Choose a model or language": "选择模型或语言",
  "Retry loading models": "重新加载模型",
  "Cancel download": "取消下载",
  "Downloading…": "正在下载…",
  "Try again": "重试",
  "Download model": "下载模型",
  "Ask an environment admin to download": "请环境管理员下载",
  "Customize in Voice settings": "在语音设置中自定义",
  "Start dictating": "开始听写",
  "Silero (1.2 MB), used for silence filtering and pause detection, downloads alongside the speech model. An installed copy is reused.":
    "用于静音过滤和停顿检测的 Silero（1.2 MB）会随语音模型一起下载。若已安装则直接复用。",
  "The selected microphone is unavailable. Choose another or use the system default.":
    "所选麦克风不可用。请选择其他麦克风或使用系统默认设备。",
  "Speak and transcribe in multiple languages or translate into English, and get names and technical terms right with the dictionary in Voice settings.":
    "支持多语言语音转录或翻译成英语，可在语音设置的词典中添加名称和专业术语以提高准确度。",
  Resumes: "恢复于",
  Resets: "重置于",
  "Reset time unavailable; retry manually": "重置时间不可用，请手动重试",
  "Usage limit reached": "已达到使用上限",
  "ChatGPT usage limit reached": "已达到 ChatGPT 使用上限",
  "You've reached your workspace's limit for using your ChatGPT plan in other apps.":
    "你在其他应用中使用 ChatGPT 套餐的额度已达到工作区上限。",
  "Copy request for admin": "复制给管理员的申请",
  "Could not snooze thread": "无法暂缓对话",
  "The reset time has passed. Retry the thread manually.":
    "重置时间已过，请手动重试此对话。",
  "Could not change auto-resume": "无法更改自动恢复设置",
  "An error occurred.": "发生错误。",
  "Saving...": "正在保存…",
  "Cancel auto-resume": "取消自动恢复",
  "Resume at reset": "重置后恢复",
  "Wake now": "立即唤醒",
  "Snooze until reset": "暂缓至重置",
};

export function translateChatUpdate(
  locale: ResolvedAppLocale,
  source: string,
): string {
  if (locale !== "zh-CN") return source;
  const progress = /^Downloading speech model (\d+)%$/.exec(source);
  if (progress) return `正在下载语音模型 ${progress[1]}%`;
  return messages[source] ?? source;
}

export function useChatUpdateTranslation() {
  const { locale } = useI18n();
  return (source: string) => translateChatUpdate(locale, source);
}

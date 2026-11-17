import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

import { translateWebSource } from "./messages";

// Keep these chat-only labels out of the global source index used for provider-supplied text.
const CHAT_SOURCE_MESSAGES: Readonly<Record<string, string>> = {
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

  "Provider process is gone. Interrupt or restart the child thread to respond.":
    "提供商进程已退出。请中断或重新启动子会话后再响应。",
  "Subagent work": "子 Agent 工作记录",
  "Read only. These subagents cannot take messages.":
    "仅供查看。这些子 Agent 无法接收消息。",
  "The provider has no record of which subagents this call started.":
    "提供商未记录此次调用启动了哪些子 Agent。",
  Subagent: "子 Agent",
  "Earlier steps are not shown.": "未显示更早的步骤。",
  "No transcript yet.": "暂无记录。",
  "More approval options": "更多审批选项",
  "Your typed text was set aside": "已暂存你输入的文字",
  "It will be back in the composer once the question is answered.":
    "回答此问题后，这些文字会恢复到输入框中。",
  "User message": "用户消息",
  "Previous turn": "上一轮",
  "Next turn": "下一轮",
  "Thread details": "会话详情",
  "Thread no longer available": "会话已不可用",
  "Thread on another machine": "另一台设备上的会话",
  "Untitled thread": "未命名会话",
  "Could not stop subagent": "无法停止子 Agent",
  "Could not stop workflow": "无法停止工作流",
  "Context transfer": "上下文转移",
  "Parent agent": "父 Agent",
  Fork: "分支",
  "Parent thread": "父会话",
  Queued: "已排队",
  Reverted: "已还原",
  "Resolved (native)": "已解决（原生）",
  "Resolved (portable)": "已解决（可移植）",
  Consumed: "已使用",
  Superseded: "已被替代",
  "not started": "尚未开始",
  pending: "等待中",
  idle: "空闲",
  completed: "已完成",
  cancelled: "已取消",
  interrupted: "已中断",
  agent: "个 Agent",
  agents: "个 Agent",
  "Idle · resumable": "空闲 · 可继续",
  Finished: "已完成",
  "System message": "系统消息",
  "Planner response": "规划响应",
  "View file": "查看文件",
  Pending: "等待中",
};

export function translateChatSource(
  locale: ResolvedAppLocale,
  source: string,
): string {
  if (locale === "zh-CN") {
    const translated = CHAT_SOURCE_MESSAGES[source];
    if (translated !== undefined) return translated;
  }
  return translateWebSource(locale, source);
}

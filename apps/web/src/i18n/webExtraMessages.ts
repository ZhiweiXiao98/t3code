import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

import { translateWebSource } from "./messages";

// Exact static UI copy only. Do not parse or substitute names, errors, paths, or credentials.
const WEB_EXTRA_SOURCE_MESSAGES: Readonly<Record<string, string>> = {
  "Wait for the full response": "等待完整响应",
  "Show finished paragraphs": "显示已完成的段落",
  "Text appears once the agent finishes its turn.": "Agent 完成本轮后才显示文本。",
  "Each paragraph or code block appears as soon as it is complete.":
    "每个段落或代码块完成后立即显示。",
  "Last user message": "最近一条用户消息",
  "Created at": "创建时间",
  Manual: "手动",

  "Run failed": "运行失败",
  Duplicate: "重复",
  Coalesced: "已合并",
  Filtered: "已过滤",
  "Bad signature": "签名无效",
  "Task paused": "任务已暂停",
  "Rate limited": "请求受限",
  "Too old": "过旧",
  "Not connected:": "未连接：",
  "Could not load scheduled tasks:": "无法加载定时任务：",
  "Loading scheduled tasks on": "正在加载以下环境的定时任务：",
  "No tasks on": "以下环境没有任务：",
  "Body (truncated)": "正文（已截断）",
  Body: "正文",
  "Scheduled task is incomplete": "定时任务不完整",
  "Invalid filter": "筛选条件无效",
  "Signing secret is required": "需要签名密钥",
  "Invalid interval": "间隔无效",
  "Checkout path is required": "需要检出路径",
  "Could not save scheduled task": "无法保存定时任务",

  "Triage an issue": "排查问题",
  "An agent investigates a T3 Code problem and helps file an issue":
    "由 Agent 调查 T3 Code 问题并协助提交问题报告",
  "This PDF page could not render.": "无法呈现此 PDF 页面。",
  "This PDF took too long to load. Try again.": "此 PDF 加载时间过长，请重试。",
  "Preview limited to 2,000 pages. Save this PDF to read it in full.":
    "预览最多显示 2,000 页。请保存此 PDF 以阅读全文。",
  "Unable to open PDF.": "无法打开 PDF。",
  "This PDF has too much text to search. Save it to search in another app.":
    "此 PDF 的文字过多，无法搜索。请保存后在其他应用中搜索。",
  "Could not search this PDF.": "无法搜索此 PDF。",
  "Fit width": "适应宽度",
  "Unable to load folder.": "无法加载文件夹。",
  "Thread completed": "任务已完成",
  "Approval needed": "需要审批",
  "Thread failed": "任务失败",
  "Guest request": "访客请求",
  "Input needed": "需要输入",
  "provider health check interval": "服务提供方健康检查间隔",
  "Provider health check interval": "服务提供方健康检查间隔",
  "provider health interval": "服务提供方健康检查间隔",
  "active host power interval": "活跃时主机电源检查间隔",
  "Active host power interval": "活跃时主机电源检查间隔",
  "idle host power interval": "空闲时主机电源检查间隔",
  "Idle host power interval": "空闲时主机电源检查间隔",
};

/** Translate known static copy, retaining English and unknown text verbatim. */
export function translateWebExtraSource(locale: ResolvedAppLocale, source: string): string {
  if (locale !== "zh-CN") return source;
  if (Object.hasOwn(WEB_EXTRA_SOURCE_MESSAGES, source)) {
    return WEB_EXTRA_SOURCE_MESSAGES[source]!;
  }
  const translated = translateWebSource(locale, source);
  return typeof translated === "string" ? translated : source;
}

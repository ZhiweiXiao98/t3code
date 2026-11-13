import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import type { WorkLogEntry } from "../../session-logic";
import { providerErrorPresentation } from "../../session-logic";

const owned: Readonly<Record<string, string>> = {
  "Usage limit reached": "已达到用量限制",
  "Provider error": "提供方错误",
  "Retrying provider ({0})": "正在重试提供方（{0}）",
  "Provider recovered ({0} retries)": "提供方已恢复（重试 {0} 次）",
  "Usage limit reached after {0} retries": "重试 {0} 次后达到用量限制",
  "Provider error after {0} retries": "重试 {0} 次后提供方出错",
  "Provider retry stopped ({0})": "提供方重试已停止（{0}）",
  " Retrying in {0}ms.": " 将在 {0} 毫秒后重试。",
  " Retrying in {0}s.": " 将在 {0} 秒后重试。",
  "Usage limit reached.": "已达到用量限制。",
  "Usage limit reached. Retry after {0}.": "已达到用量限制。请在 {0} 后重试。",
  "You stopped after {0}": "你在 {0} 后停止了响应",
  "You stopped this response": "你停止了此响应",
  "Worked for {0}": "已工作 {0}",
  Worked: "已完成工作",
  "Continued for {0}": "已继续 {0}",
  Continued: "已继续",
  "Superseded attempt": "已被替代的尝试",
  "Couldn't load work. Click to retry.": "无法加载工作记录。点击重试。",
  "Context compaction failed": "上下文压缩失败",
  "Context compaction stopped": "上下文压缩已停止",
  "Compacting context": "正在压缩上下文",
  "Context compacted": "上下文已压缩",
  "Context compacted {0} → {1} tokens": "上下文已压缩 {0} → {1} 个 Token",
  "Context compaction": "上下文压缩",
  "Compacting before the cache expires…": "正在缓存过期前压缩上下文…",
  "Compacting…": "正在压缩…",
  "Context automatically compacted before cache expiry": "已在缓存过期前自动压缩上下文",
  "Context compacted before sending": "已在发送前压缩上下文",
  "Context compacted after {0} idle": "闲置 {0} 后已压缩上下文",
  "Created thread": "已创建对话",
  "Tasks {0}/{1}": "任务 {0}/{1}",
  Thinking: "正在思考",
  "Web search": "网页搜索",
  Thought: "已思考",
  Running: "正在运行",
  Failed: "失败",
  Declined: "已拒绝",
  Stopped: "已停止",
  Ran: "已运行",
  command: "命令",
  "Searched the web": "已搜索网页",
  "Checkpoint captured": "已保存检查点",
  "Answered questions": "已回答问题",
  "Input requested": "需要输入",
};
/** Called only with local presenter templates; inserted provider/user values are never reprocessed. */
export function timelineOwnedText(
  locale: ResolvedAppLocale,
  template: string,
  values: readonly string[] = [],
): string {
  const text = locale === "zh-CN" ? (owned[template] ?? template) : template;
  return text.replace(/\{(\d+)\}/g, (source, index: string) => values[Number(index)] ?? source);
}
export function presentTimelineWorkEntry<E extends WorkLogEntry>(
  entry: E,
  locale: ResolvedAppLocale,
): E {
  if (locale === "en") return entry;
  const item = entry.projectedItem?.item ?? entry.structuredPayload;
  if (!item) return entry;
  const text = (template: string, values: readonly string[] = []) =>
    timelineOwnedText(locale, template, values);
  if (item.type === "error") return { ...entry, ...providerErrorPresentation(item, text) };
  if (item.type === "thread_created") return { ...entry, label: text("Created thread") };
  if (item.type === "todo_list") {
    const done = item.steps.filter((step) => step.status === "completed").length;
    const current =
      item.steps.find((step) => step.status === "running") ??
      item.steps.find((step) => step.status === "pending");
    return {
      ...entry,
      label:
        text("Tasks {0}/{1}", [String(done), String(item.steps.length)]) +
        (current ? ` · ${current.text}` : ""),
    };
  }
  if (item.title?.trim()) return entry;
  const fallback =
    item.type === "reasoning"
      ? "Thinking"
      : item.type === "web_search"
        ? "Searched the web"
        : item.type === "checkpoint"
          ? "Checkpoint captured"
          : item.type === "user_input_request"
            ? item.questionAnswer
              ? "Answered questions"
              : "Input requested"
            : null;
  return fallback === null
    ? entry
    : {
        ...entry,
        label: text(fallback),
        ...(item.type === "web_search" && entry.toolTitle === "Web search"
          ? { toolTitle: text("Web search") }
          : {}),
      };
}

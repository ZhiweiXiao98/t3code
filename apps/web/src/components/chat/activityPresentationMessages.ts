import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const templates: Readonly<Record<string, string>> = {
  subagent: "子智能体",
  subagents: "子智能体",
  command: "命令",
  commands: "命令",
  monitor: "监控任务",
  monitors: "监控任务",
  "background task": "后台任务",
  "background tasks": "后台任务",
  "Waiting · {0}": "等待中 · {0}",
  "Running · {0}": "运行中 · {0}",
  "Waiting on a {0}": "正在等待一个{0}",
  "Running a {0}": "正在运行一个{0}",
  "{0} {1}": "{0} 个{1}",
  "{0} and {1}": "{0} 和 {1}",
  "Waiting on {0}": "正在等待 {0}",
  "Running {0}": "正在运行 {0}",
  "{0} tokens": "{0} 个 Token",
  "{0} / {1} tokens": "{0} / {1} 个 Token",
  "{0} check": "{0} 次检查",
  "{0} checks": "{0} 次检查",
};
/** Invoked only by the finite shared presenter templates, never with provider descriptions. */
export function activityTemplate(
  locale: ResolvedAppLocale,
  template: string,
  values: readonly string[],
): string {
  const text = locale === "zh-CN" ? (templates[template] ?? template) : template;
  return text.replace(
    /\{(\d+)\}/g,
    (placeholder, index: string) => values[Number(index)] ?? placeholder,
  );
}
export function childInputTitle(
  locale: ResolvedAppLocale,
  values: {
    readonly count: number;
    readonly noun: "side chat" | "subagent" | "thread";
    readonly need: "input" | "approval" | "you";
  },
): string {
  const { count, noun, need } = values;
  if (locale !== "zh-CN")
    return count === 1
      ? `${noun === "side chat" ? "Side chat" : "Subagent"} needs ${need}`
      : `${count} ${noun}s need ${need}`;
  const subject = noun === "side chat" ? "旁支对话" : noun === "subagent" ? "子智能体" : "对话";
  const action = need === "input" ? "输入" : need === "approval" ? "批准" : "处理";
  return `${count === 1 ? "" : `${count} 个`}${subject}需要你${action}`;
}

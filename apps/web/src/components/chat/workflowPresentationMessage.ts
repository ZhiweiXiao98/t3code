import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
const owned = {
  Workflow: "工作流",
  "{0} agent": "{0} 个智能体",
  "{0} agents": "{0} 个智能体",
  "{0} working": "{0} 个运行中",
  "{0} done": "{0} 个已完成",
  "{0} failed": "{0} 个失败",
  "{0} stopped": "{0} 个已停止",
} as const;
export function workflowPresentationMessage(
  locale: ResolvedAppLocale,
  template: string,
  values: readonly string[],
): string {
  const translated =
    locale === "zh-CN" && Object.hasOwn(owned, template)
      ? owned[template as keyof typeof owned]
      : template;
  return translated.replace(
    /\{(\d+)\}/g,
    (source, index: string) => values[Number(index)] ?? source,
  );
}

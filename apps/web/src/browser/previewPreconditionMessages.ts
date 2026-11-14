import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const messages = {
  "settings-read": "无法读取浏览器设置。",
  "runtime-unavailable": "此运行环境无法使用集成浏览器。",
  "environment-disconnected": "环境未连接。",
  "invalid-asset-url": "环境返回了无效的资源 URL。",
} as const;
const sources = new WeakMap<Error, keyof typeof messages>();
export function markPreviewPrecondition<E extends Error>(
  error: E,
  source: keyof typeof messages,
): E {
  sources.set(error, source);
  return error;
}
export function previewPreconditionMessage(
  error: unknown,
  locale: ResolvedAppLocale,
): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const source = sources.get(error);
  return locale === "zh-CN" && source !== undefined ? messages[source] : error.message;
}

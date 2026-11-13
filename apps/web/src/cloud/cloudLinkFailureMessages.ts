import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const preconditions = {
  environment: ["Choose an environment first.", "请先选择环境。"],
  permission: [
    "This connection needs permission to view and manage T3 Connect settings.",
    "此连接需要查看和管理 T3 Connect 设置的权限。",
  ],
  loading: [
    "Wait until the current T3 Connect settings can be read.",
    "请等待当前 T3 Connect 设置加载完成。",
  ],
  signin: ["Sign in to T3 Connect before enabling this.", "请先登录 T3 Connect，再启用此功能。"],
} as const;
const sources = new WeakMap<Error, keyof typeof preconditions>();
export function cloudLinkPreconditionError(source: keyof typeof preconditions): Error {
  const error = new Error(preconditions[source][0]);
  sources.set(error, source);
  return error;
}
export function cloudLinkFailureMessage(
  error: unknown,
  locale: ResolvedAppLocale,
): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const source = sources.get(error);
  return source !== undefined && locale === "zh-CN" ? preconditions[source][1] : error.message;
}

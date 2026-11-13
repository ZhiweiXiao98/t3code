import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
type EditorFailureSource =
  | { readonly kind: "environment-required"; readonly path: string }
  | { readonly kind: "editor-unavailable"; readonly path: string; readonly environment: string }
  | { readonly kind: "permission" };
const sources = new WeakMap<Error, EditorFailureSource>();
export function markEditorFailure<E extends Error>(error: E, source: EditorFailureSource): E {
  sources.set(error, source);
  return error;
}
export function editorFailureMessage(
  error: unknown,
  locale: ResolvedAppLocale,
): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const source = sources.get(error);
  if (locale !== "zh-CN" || !source) return error.message;
  switch (source.kind) {
    case "environment-required":
      return `无法打开 ${source.path}，因为尚未选择环境。`;
    case "editor-unavailable":
      return `没有可用编辑器能在环境 ${source.environment} 中打开 ${source.path}。`;
    case "permission":
      return "此连接无法在该环境中打开编辑器。";
  }
}

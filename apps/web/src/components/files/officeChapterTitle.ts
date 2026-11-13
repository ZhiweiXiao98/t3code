import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

/** Optional metadata comes only from the local Office worker, never from document text. */
export function officeChapterTitle(
  page: { readonly title: string; readonly generatedTitle?: unknown },
  locale: ResolvedAppLocale,
): string {
  const source = page.generatedTitle;
  if (locale !== "zh-CN" || typeof source !== "object" || source === null || Array.isArray(source))
    return page.title;
  if (
    !("kind" in source) ||
    source.kind !== "chapter" ||
    !("index" in source) ||
    typeof source.index !== "number" ||
    !Number.isSafeInteger(source.index) ||
    source.index < 1 ||
    page.title !== `Chapter ${source.index}`
  )
    return page.title;
  return `第 ${source.index} 章`;
}

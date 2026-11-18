/** English count labels; callers retain their existing localized dictionary for Chinese. */
export function englishFilePreviewCount(count: number | "…", unit: "row" | "column" | "line") {
  return `${count.toLocaleString()} ${unit}${count === 1 ? "" : "s"}`;
}

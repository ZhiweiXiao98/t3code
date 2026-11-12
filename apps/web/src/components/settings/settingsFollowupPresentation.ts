import { translateWebSource } from "../../i18n/messages";
import type { ChatWidth, StorageCleanupReport } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { formatBytes } from "../../lib/formatBytes";

export function chatWidthLabel(locale: ResolvedAppLocale, width: ChatWidth): string {
  return (
    locale === "zh-CN"
      ? { comfortable: "舒适", wide: "宽", full: "全宽" }
      : { comfortable: "Comfortable", wide: "Wide", full: "Full" }
  )[width];
}

export function cleanupRunPresentation(
  locale: ResolvedAppLocale,
  report: Pick<StorageCleanupReport, "counts" | "finishedAt" | "bytesFreed">,
  nowMs: number,
) {
  if (locale === "zh-CN") {
    const elapsed = Math.max(0, nowMs - Date.parse(report.finishedAt));
    const time = !Number.isFinite(elapsed)
      ? ""
      : elapsed < 60_000
        ? "刚刚"
        : elapsed < 3_600_000
          ? `${Math.floor(elapsed / 60_000)} 分钟前`
          : elapsed < 86_400_000
            ? `${Math.floor(elapsed / 3_600_000)} 小时前`
            : `${Math.floor(elapsed / 86_400_000)} 天前`;
    return {
      counts: `已删除 ${report.counts.removed} 项，保留 ${report.counts.kept} 项${report.counts.failed > 0 ? `，失败 ${report.counts.failed} 项` : ""}`,
      description: `上次运行：${time}。已回收 ${formatBytes(report.bytesFreed)}。${report.counts.failed > 0 ? `有 ${report.counts.failed} 项无法删除。` : ""}`,
    };
  }
  return {
    counts: `${report.counts.removed} removed, ${report.counts.kept} kept${report.counts.failed > 0 ? `, ${report.counts.failed} failed` : ""}`,
    description: `Last run ${formatRelativeTimeLabel(report.finishedAt, nowMs)}. ${formatBytes(report.bytesFreed)} recovered.${report.counts.failed > 0 ? ` ${report.counts.failed} ${report.counts.failed === 1 ? "item" : "items"} couldn't be removed.` : ""}`,
  };
}

export function cleanupLastRunSummary(
  entries: readonly { readonly label: string; readonly counts: string }[],
  machineCount: number,
  locale: ResolvedAppLocale,
) {
  const first = entries[0];
  if (!first) return "";
  if (machineCount <= 1) return first.counts;
  if (entries.length === machineCount && entries.every((entry) => entry.counts === first.counts)) {
    return locale === "zh-CN" ? `每台机器：${first.counts}` : `${first.counts} on every machine`;
  }
  return entries.map((entry) => `${entry.label}: ${entry.counts}`).join(" · ");
}

/** Pending states are owned UI copy, not server error payloads. */
export function cleanupPendingDescription(
  locale: ResolvedAppLocale,
  query: { readonly failed?: boolean; readonly loading?: boolean } | undefined,
): string {
  return query?.failed
    ? translateWebSource(locale, "Could not load the last run.")
    : query?.loading
      ? translateWebSource(locale, "Loading last run…")
      : translateWebSource(locale, "Cleanup hasn't run yet.");
}

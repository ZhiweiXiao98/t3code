import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage } from "./messages";

export type ThreadUndoAction = "Settled" | "Snoozed" | "Unpinned" | "Archived" | "Discarded";
export type ThreadUndoSummary = { readonly action: ThreadUndoAction; readonly count: number };

export function threadUndoSummary(
  locale: ResolvedAppLocale,
  notice: ThreadUndoSummary,
  compact = false,
): string {
  const action = translateWebMessage(locale, `audit6.undo.${notice.action}`);
  if (compact) return notice.count === 1 ? action : `${action} ${notice.count}`;
  return translateWebMessage(
    locale,
    notice.action === "Discarded"
      ? notice.count === 1
        ? "audit6.undo.oneDraft"
        : "audit6.undo.drafts"
      : notice.count === 1
        ? "audit6.undo.oneThread"
        : "audit6.undo.threads",
    { action, count: notice.count },
  );
}

export function threadUndoShortcutLabel(
  locale: ResolvedAppLocale,
  shortcut: string | null | undefined,
): string {
  return shortcut
    ? translateWebMessage(locale, "audit6.undo.shortcut", { shortcut })
    : translateWebMessage(locale, "common.undo");
}

/** Only these application-owned failure labels are translated; unknown text stays literal. */
export function threadUndoFailureTitle(locale: ResolvedAppLocale, title: string): string {
  switch (title) {
    case "Failed to undo archive":
      return translateWebMessage(locale, "audit6.undo.archiveFailed");
    case "Failed to undo unpin":
      return translateWebMessage(locale, "audit6.undo.unpinFailed");
    case "Failed to undo settle":
      return translateWebMessage(locale, "audit6.undo.settleFailed");
    case "Failed to wake thread":
      return translateWebMessage(locale, "audit6.undo.wakeFailed");
    case "Failed to restore draft":
      return translateWebMessage(locale, "audit6.undo.draftFailed");
    default:
      return title;
  }
}

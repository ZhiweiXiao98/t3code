import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage } from "./messages";

export function terminalCloseMessage(
  locale: ResolvedAppLocale,
  labels: readonly [string, ...string[]],
): string {
  return labels.length === 1
    ? [
        translateWebMessage(locale, "audit5.closeTerminal", { label: labels[0] }),
        translateWebMessage(locale, "audit5.stopTerminal"),
      ].join("\n")
    : [
        translateWebMessage(locale, "audit5.closeTerminals", { count: labels.length }),
        translateWebMessage(locale, "audit5.stopTerminals", {
          labels: labels.map((label) => `"${label}"`).join(", "),
        }),
      ].join("\n");
}

export function browserCloseMessage(locale: ResolvedAppLocale, count: number): string {
  return [
    translateWebMessage(locale, count === 1 ? "audit5.closeBrowser" : "audit5.closeBrowsers", {
      count,
    }),
    translateWebMessage(
      locale,
      count === 1 ? "audit5.interruptBrowser" : "audit5.interruptBrowsers",
    ),
  ].join("\n");
}

/** Use the removal plan's decisions, never parse a message containing user-controlled paths/names. */
export function projectRemovalMessage(
  locale: ResolvedAppLocale,
  plan: {
    readonly confirmationMessage: string;
    readonly targetKind: string;
    readonly targetLabel: string;
    readonly threadCount: number;
    readonly isWholeGroup: boolean;
  },
  members: readonly { readonly workspaceRoot: string; readonly environmentLabel?: string | null }[],
  hasOtherMembers: boolean,
): string {
  if (locale === "en") return plan.confirmationMessage;
  const single = members.length === 1 ? members[0]! : null;
  return [
    translateWebMessage(
      locale,
      plan.threadCount > 0 ? "audit5.removeProjectThreads" : "audit5.removeProject",
      {
        kind: translateWebMessage(
          locale,
          plan.targetKind === "checkout" ? "audit5.checkout" : "audit5.project",
        ),
        name: plan.targetLabel,
        count: plan.threadCount,
      },
    ),
    ...(single
      ? [
          translateWebMessage(locale, "projectSettings.path", { path: single.workspaceRoot }),
          ...(single.environmentLabel
            ? [
                translateWebMessage(locale, "projectSettings.environment", {
                  environment: single.environmentLabel,
                }),
              ]
            : []),
        ]
      : [
          translateWebMessage(locale, "projectSettings.removeGroupedEntries", {
            count: members.length,
          }),
        ]),
    translateWebMessage(
      locale,
      plan.threadCount > 0
        ? "audit5.projectThreadsKeptSessions"
        : "audit5.projectArchivedKeptSessions",
    ),
    translateWebMessage(
      locale,
      plan.isWholeGroup && !hasOtherMembers
        ? "projectSettings.removeEntriesOnly"
        : "projectSettings.otherEntriesUnaffected",
    ),
    translateWebMessage(locale, "projectSettings.cannotUndo"),
  ].join("\n");
}

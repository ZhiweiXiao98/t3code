import type { planProjectRemoval } from "@t3tools/client-runtime/state/projects";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

type RemovalPlan = Pick<
  ReturnType<typeof planProjectRemoval>,
  "targetKind" | "targetLabel" | "threadCount" | "isWholeGroup"
>;

export function projectRemovalConfirmation(
  plan: RemovalPlan,
  members: ReadonlyArray<{
    readonly workspaceRoot: string;
    readonly environmentLabel?: string | null;
  }>,
  hasOtherMembers: boolean,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const template =
    plan.targetKind === "checkout"
      ? plan.threadCount > 0
        ? plan.threadCount === 1
          ? 'Remove checkout "{0}" and delete its {1} thread?'
          : 'Remove checkout "{0}" and delete its {1} threads?'
        : 'Remove checkout "{0}"?'
      : plan.threadCount > 0
        ? plan.threadCount === 1
          ? 'Remove project "{0}" and delete its {1} thread?'
          : 'Remove project "{0}" and delete its {1} threads?'
        : 'Remove project "{0}"?';
  const singleMember = members.length === 1 ? members[0]! : null;
  return [
    formatMobileMessage(template, [plan.targetLabel, plan.threadCount], locale),
    ...(singleMember
      ? [
          formatMobileMessage("Path: {0}", [singleMember.workspaceRoot], locale),
          ...(singleMember.environmentLabel
            ? [formatMobileMessage("Environment: {0}", [singleMember.environmentLabel], locale)]
            : []),
        ]
      : [
          formatMobileMessage(
            "This removes {0} grouped project entries.",
            [members.length],
            locale,
          ),
        ]),
    localizeMobileString(
      plan.threadCount > 0
        ? "Those threads and any archived threads are deleted from T3 Code. Provider sessions are kept."
        : "Any archived threads are deleted from T3 Code. Provider sessions are kept.",
      locale,
    ),
    localizeMobileString(
      plan.isWholeGroup && !hasOtherMembers
        ? "This removes only the project entries, not the files on disk."
        : "Other entries in this grouped project are unaffected.",
      locale,
    ),
    localizeMobileString("This action cannot be undone.", locale),
  ].join("\n");
}

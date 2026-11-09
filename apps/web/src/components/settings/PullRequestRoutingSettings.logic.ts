import type { PullRequestRoutingPermission } from "@t3tools/client-runtime/connection";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage } from "~/i18n/messages";

export function summarizePullRequestRouting(
  entries: ReadonlyArray<{
    readonly label: string;
    readonly permission: PullRequestRoutingPermission;
  }>,
  locale: ResolvedAppLocale = "en",
): string | null {
  const groups = (["read-write", "read"] as const).flatMap((permission) => {
    const labels = entries.filter((entry) => entry.permission === permission);
    return labels.length === 0
      ? []
      : [
          translateWebMessage(
            locale,
            permission === "read-write"
              ? "permissions.routing.summaryWrite"
              : "permissions.routing.summaryRead",
            { names: labels.map((entry) => entry.label).join(locale === "zh-CN" ? "、" : ", ") },
          ),
        ];
  });
  return groups.length === 0 ? null : groups.join(" · ");
}

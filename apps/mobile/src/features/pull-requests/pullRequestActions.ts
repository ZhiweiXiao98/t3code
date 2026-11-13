import {
  sourceControlClients,
  type ChangeRequestTerminology,
} from "@t3tools/client-runtime/source-control-clients";
import type {
  PullRequestAction,
  PullRequestDetail,
  PullRequestMergeMethod,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import type { AppSymbolName } from "../../components/ui/AppSymbol";
import { PullRequestGlyph } from "./pullRequestGlyphs";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, type MobileLocale } from "../../i18n/mobileStrings";

type ActionDetail = Pick<
  PullRequestDetail,
  "state" | "isDraft" | "mergeability" | "autoMergeEnabled" | "workflowApprovalsRequired"
> & {
  readonly capabilities: Pick<
    PullRequestDetail["capabilities"],
    "actions" | "mergeMethods" | "updateMethods" | "deleteBranch"
  >;
  readonly viewerPermissions: Pick<
    PullRequestDetail["viewerPermissions"],
    "actions" | "updateMethods"
  >;
  readonly mergeCapabilities: PullRequestDetail["mergeCapabilities"];
};

export const MERGE_METHODS = {
  squash: { title: "Squash and merge", description: "Combine the commits into one commit." },
  merge: {
    title: "Create a merge commit",
    description: "Keep the commits and add a merge commit.",
  },
  rebase: { title: "Rebase and merge", description: "Add the commits without a merge commit." },
} as const satisfies Record<PullRequestMergeMethod, { title: string; description: string }>;

export function pullRequestActionLabel(
  action: PullRequestAction,
  terminology: ChangeRequestTerminology,
  locale: MobileLocale = "en",
): string {
  const term = localizeMobileString(terminology.singular, locale);
  switch (action) {
    case "merge":
      return formatMobileMessage("Merge {0}", [term], locale);
    case "ready":
      return localizeMobileString("Mark ready for review", locale);
    case "draft":
      return localizeMobileString("Convert to draft", locale);
    case "close":
      return formatMobileMessage("Close {0}", [term], locale);
    case "reopen":
      return formatMobileMessage("Reopen {0}", [term], locale);
    case "update-branch":
      return localizeMobileString("Update branch", locale);
    case "enable-auto-merge":
      return localizeMobileString("Enable auto-merge", locale);
    case "disable-auto-merge":
      return localizeMobileString("Disable auto-merge", locale);
    case "revert":
      return formatMobileMessage("Create revert {0}", [term], locale);
    case "delete-branch":
      return localizeMobileString("Delete branch", locale);
    case "approve-workflows":
      return localizeMobileString("Approve workflows", locale);
  }
}

export const PR_ACTION_ICONS = {
  merge: PullRequestGlyph.merged,
  ready: "checkmark.circle",
  draft: "pencil",
  close: "xmark",
  reopen: "arrow.clockwise",
  "update-branch": "arrow.up.circle",
  "enable-auto-merge": "clock",
  "disable-auto-merge": "xmark",
  revert: "arrow.uturn.backward",
  "delete-branch": "trash",
  "approve-workflows": "checkmark",
} as const satisfies Record<PullRequestAction, AppSymbolName>;

export function allowedMergeMethods(pr: ActionDetail) {
  return pr.capabilities.mergeMethods.filter((method) => pr.mergeCapabilities[method]);
}

export function allowedUpdateMethods(pr: ActionDetail) {
  return (pr.capabilities.updateMethods ?? []).filter((method) =>
    pr.viewerPermissions.updateMethods?.includes(method),
  );
}

export function canPerformPullRequestAction(pr: ActionDetail, action: PullRequestAction) {
  if (!pr.capabilities.actions.includes(action) || !pr.viewerPermissions.actions.includes(action))
    return false;
  if (action === "reopen") return pr.state === "closed";
  if (action === "revert") return pr.state === "merged";
  if (action === "delete-branch")
    return pr.state !== "open" && pr.capabilities.deleteBranch === true;
  if (pr.state !== "open") return false;
  switch (action) {
    case "update-branch":
      return allowedUpdateMethods(pr).length > 0;
    case "approve-workflows":
      return (pr.workflowApprovalsRequired ?? 0) > 0;
    case "ready":
      return pr.isDraft;
    case "draft":
      return !pr.isDraft;
    case "merge":
      return !pr.isDraft && pr.mergeability !== "conflicting" && allowedMergeMethods(pr).length > 0;
    case "enable-auto-merge":
      return !pr.isDraft && pr.autoMergeEnabled === false && allowedMergeMethods(pr).length > 0;
    case "disable-auto-merge":
      return pr.autoMergeEnabled === true;
    default:
      return true;
  }
}

export function mergeUnavailableReason(
  pr: ActionDetail,
  connectionAllowsWrites: boolean,
  terminology: ChangeRequestTerminology,
  locale: MobileLocale = "en",
) {
  const term = localizeMobileString(terminology.singular, locale);
  if (pr.state === "merged")
    return formatMobileMessage("This {0} has been merged.", [term], locale);
  if (pr.state === "closed")
    return formatMobileMessage("Reopen this {0} before merging.", [term], locale);
  if (!connectionAllowsWrites)
    return localizeMobileString("This environment connection is read-only.", locale);
  if (!pr.capabilities.actions.includes("merge"))
    return localizeMobileString("This provider does not support merging here.", locale);
  if (!pr.viewerPermissions.actions.includes("merge"))
    return formatMobileMessage("Your account cannot merge this {0}.", [term], locale);
  if (pr.isDraft)
    return localizeMobileString("Mark this draft ready for review before merging.", locale);
  if (pr.mergeability === "conflicting")
    return localizeMobileString("Resolve the branch conflicts before merging.", locale);
  if (!allowedMergeMethods(pr).length)
    return localizeMobileString("This repository has no available merge methods.", locale);
  return null;
}

export const openOnProviderLabel = (provider: SourceControlProviderKind) =>
  `Open on ${sourceControlClients.get(provider).label}`;

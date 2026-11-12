import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage, translateWebSource } from "~/i18n/messages";
import type {
  GitRunStackedActionResult,
  GitStackedAction,
  VcsStatusResult,
} from "@t3tools/contracts";
import { isTemporaryWorktreeBranch } from "@t3tools/shared/git";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";
import {
  changeRequestTerminologyFor,
  type DefaultBranchActionDialogCopy,
  type DefaultBranchConfirmableAction,
  type GitActionIconName,
  type GitDialogAction,
} from "@t3tools/client-runtime/state/vcs";

export {
  requiresDefaultBranchConfirmation,
  type DefaultBranchConfirmableAction,
  type GitActionIconName,
} from "@t3tools/client-runtime/state/vcs";

export interface GitActionMenuItem {
  id: "commit" | "push" | "pr";
  label: string;
  disabled: boolean;
  icon: GitActionIconName;
  kind: "open_dialog";
  dialogAction?: GitDialogAction;
}

export interface GitQuickAction {
  label: string;
  disabled: boolean;
  kind: "run_action" | "run_pull" | "open_publish" | "show_hint";
  action?: GitStackedAction;
  hint?: string;
}

export interface GitActionProgressPresentation {
  readonly status: string;
  readonly output: string | null;
  readonly startedAtMs: number | null;
}

export interface GitActionResultToastTiming {
  readonly timeout: 0;
  readonly dismissAfterVisibleMs: number | null;
}

export const GIT_ACTION_SUCCESS_VISIBLE_MS = 10_000;

export function resolveGitActionResultToastTiming(
  type: "error" | "success",
): GitActionResultToastTiming {
  return {
    timeout: 0,
    dismissAfterVisibleMs: type === "success" ? GIT_ACTION_SUCCESS_VISIBLE_MS : null,
  };
}

export function resolveGitActionProgressPresentation(
  input: {
    readonly isRunning: boolean;
    readonly operation: string | null;
    readonly currentLabel: string | null;
    readonly lastOutputLine: string | null;
    readonly phaseStartedAtMs: number | null;
    readonly hookStartedAtMs: number | null;
    readonly hookName?: string | null;
  },
  locale: ResolvedAppLocale = "en",
): GitActionProgressPresentation | null {
  if (
    !input.isRunning ||
    (input.operation !== "run_change_request" && input.operation !== "pull")
  ) {
    return null;
  }

  const currentLabel = input.currentLabel?.trim();
  const output = input.lastOutputLine?.trim();
  const isPull = input.operation === "pull";
  return {
    status: input.hookName
      ? translateWebMessage(locale, "gitActions.runningHook", { hook: input.hookName })
      : currentLabel && currentLabel !== "Running source control action"
        ? translateWebSource(locale, currentLabel)
        : isPull
          ? translateWebSource(locale, "Pulling latest changes...")
          : translateWebSource(locale, "Starting source control action..."),
    output: !isPull && output ? output : null,
    startedAtMs: isPull
      ? input.phaseStartedAtMs
      : (input.hookStartedAtMs ?? input.phaseStartedAtMs),
  };
}

export function formatGitActionElapsed(
  startedAtMs: number | null,
  nowMs: number,
  locale: ResolvedAppLocale = "en",
): string | null {
  if (startedAtMs === null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
  if (elapsedSeconds < 60) {
    return translateWebMessage(locale, "gitActions.elapsedSeconds", { seconds: elapsedSeconds });
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return translateWebMessage(locale, "gitActions.elapsedMinutes", { minutes, seconds });
}

export function buildMenuItems(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  hasPrimaryRemote = true,
  locale: ResolvedAppLocale = "en",
): GitActionMenuItem[] {
  if (!gitStatus) return [];
  const terminology = changeRequestTerminologyFor(gitStatus);

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isBehind = gitStatus.behindCount > 0;
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0;
  const canPushWithoutUpstream = hasPrimaryRemote && !gitStatus.hasUpstream;
  const canCommit = !isBusy && hasChanges;
  const canPush =
    !isBusy &&
    hasBranch &&
    !isBehind &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasOpenPr &&
    hasDefaultBranchDelta &&
    !isBehind &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);

  const commitItem: GitActionMenuItem = {
    id: "commit",
    label: translateWebSource(locale, "Commit"),
    disabled: !canCommit,
    icon: "commit",
    kind: "open_dialog",
    dialogAction: "commit",
  };

  if (!hasPrimaryRemote) {
    return [commitItem];
  }

  const pushItem: GitActionMenuItem = {
    id: "push",
    label: translateWebSource(locale, "Push"),
    disabled: !canPush,
    icon: "push",
    kind: "open_dialog",
    dialogAction: "push",
  };

  if (hasOpenPr) {
    return [commitItem, pushItem];
  }

  return [
    commitItem,
    pushItem,
    {
      id: "pr",
      label: translateWebMessage(locale, "gitActions.createRequest", {
        request: terminology.shortLabel,
      }),
      disabled: !canCreatePr,
      icon: "pr",
      kind: "open_dialog",
      dialogAction: "create_pr",
    },
  ];
}

export function hasUsableGitMenuContent(input: {
  readonly menuItems: readonly GitActionMenuItem[];
  readonly canWriteSourceControl: boolean;
  readonly canPublishRepository: boolean;
  readonly hasNotice: boolean;
}): boolean {
  return (
    input.canPublishRepository ||
    input.hasNotice ||
    (input.canWriteSourceControl && input.menuItems.some((item) => !item.disabled))
  );
}

export function resolveQuickAction(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  isDefaultRef = false,
  hasPrimaryRemote = true,
  locale: ResolvedAppLocale = "en",
): GitQuickAction {
  if (isBusy) {
    return {
      label: translateWebSource(locale, "Commit"),
      disabled: true,
      kind: "show_hint",
      hint: translateWebSource(locale, "Git action in progress."),
    };
  }

  if (!gitStatus) {
    return {
      label: translateWebSource(locale, "Commit"),
      disabled: true,
      kind: "show_hint",
      hint: translateWebSource(locale, "Git status is unavailable."),
    };
  }

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0;
  const isBehind = gitStatus.behindCount > 0;
  const isDiverged = isAhead && isBehind;
  const terminology = changeRequestTerminologyFor(gitStatus);

  if (!hasBranch) {
    return {
      label: translateWebSource(locale, "Commit"),
      disabled: true,
      kind: "show_hint",
      hint: translateWebMessage(locale, "gitActions.checkoutBeforeRequest", {
        request: translateWebSource(locale, terminology.singular),
      }),
    };
  }

  if (hasChanges) {
    if (isBehind || (!gitStatus.hasUpstream && !hasPrimaryRemote)) {
      return {
        label: translateWebSource(locale, "Commit"),
        disabled: false,
        kind: "run_action",
        action: "commit",
      };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: translateWebSource(locale, "Commit & push"),
        disabled: false,
        kind: "run_action",
        action: "commit_push",
      };
    }
    return {
      label: translateWebMessage(locale, "gitActions.commitPushRequest", {
        request: terminology.shortLabel,
      }),
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (!gitStatus.hasUpstream) {
    if (!hasPrimaryRemote) {
      return {
        label: translateWebSource(locale, "Publish repository"),
        disabled: false,
        kind: "open_publish",
      };
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return {
          label: translateWebSource(locale, "Commit"),
          disabled: true,
          kind: "show_hint",
          hint: translateWebSource(locale, "Branch is up to date. No action needed."),
        };
      }
      return {
        label: translateWebSource(locale, "Push"),
        disabled: true,
        kind: "show_hint",
        hint: translateWebSource(locale, "No local commits to push."),
      };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: translateWebSource(locale, "Push"),
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
      };
    }
    return {
      label: translateWebMessage(locale, "gitActions.pushCreateRequest", {
        request: terminology.shortLabel,
      }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (isDiverged) {
    return {
      label: translateWebSource(locale, "Sync ref"),
      disabled: true,
      kind: "show_hint",
      hint: translateWebSource(locale, "Branch has diverged from upstream. Rebase/merge first."),
    };
  }

  if (isBehind) {
    return {
      label: translateWebSource(locale, "Pull"),
      disabled: false,
      kind: "run_pull",
    };
  }

  if (isAhead) {
    if (hasOpenPr || isDefaultRef) {
      return {
        label: translateWebSource(locale, "Push"),
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
      };
    }
    return {
      label: translateWebMessage(locale, "gitActions.pushCreateRequest", {
        request: terminology.shortLabel,
      }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (hasOpenPr && gitStatus.hasUpstream) {
    return {
      label: translateWebSource(locale, "Commit"),
      disabled: true,
      kind: "show_hint",
      hint: translateWebSource(locale, "Branch is up to date. No action needed."),
    };
  }

  if (hasDefaultBranchDelta && !isDefaultRef) {
    return {
      label: translateWebMessage(locale, "gitActions.createRequest", {
        request: terminology.shortLabel,
      }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  return {
    label: translateWebSource(locale, "Commit"),
    disabled: true,
    kind: "show_hint",
    hint: translateWebSource(locale, "Branch is up to date. No action needed."),
  };
}

export function resolveDefaultBranchActionDialogCopy(input: {
  action: DefaultBranchConfirmableAction;
  branchName: string;
  includesCommit: boolean;
  terminology: ChangeRequestTerminology;
  locale?: ResolvedAppLocale;
}): DefaultBranchActionDialogCopy {
  const locale = input.locale ?? "en";
  const t = translateWebMessage.bind(null, locale);
  const branch = input.branchName;
  const { terminology } = input;
  const request = translateWebSource(locale, terminology.singular);
  if (input.action === "push" || input.action === "commit_push") {
    return input.includesCommit
      ? {
          title: translateWebSource(locale, "Commit & push to default ref?"),
          description: t("gitActions.default.commitPushDescription", { branch }),
          continueLabel: t("gitActions.default.commitPushContinue", { branch }),
        }
      : {
          title: translateWebSource(locale, "Push to default ref?"),
          description: t("gitActions.default.pushDescription", { branch }),
          continueLabel: t("gitActions.default.pushContinue", { branch }),
        };
  }
  return input.includesCommit
    ? {
        title: t("gitActions.default.commitRequestTitle", { request: terminology.shortLabel }),
        description: t("gitActions.default.commitPushRequestDescription", { branch, request }),
        continueLabel: t("gitActions.default.commitRequestContinue", {
          request: terminology.shortLabel,
        }),
      }
    : {
        title: t("gitActions.default.pushRequestTitle", { request: terminology.shortLabel }),
        description: t("gitActions.default.pushRequestDescription", { branch, request }),
        continueLabel: t("gitActions.pushCreateRequest", { request: terminology.shortLabel }),
      };
}

/** Clean trees cannot create feature branches because the server derives names from uncommitted changes. */
export function resolveFeatureBranchUnavailableReason(input: {
  branchName: string;
  hasWorkingTreeChanges: boolean;
  locale?: ResolvedAppLocale;
}): string | null {
  if (input.hasWorkingTreeChanges) return null;
  return translateWebMessage(input.locale ?? "en", "gitActions.featureBranchUnavailable", {
    branch: input.branchName,
  });
}

export function resolveThreadBranchUpdate(
  result: GitRunStackedActionResult,
): { branch: string } | null {
  if (result.branch.status !== "created" || !result.branch.name) {
    return null;
  }

  return {
    branch: result.branch.name,
  };
}

export function resolveThreadBranchMetadataPatch(
  branch: string | null,
  expectedBranch: string | null,
): {
  branch: string | null;
  expectedBranch: string | null;
} {
  return { branch, expectedBranch };
}

export function resolveLiveThreadBranchUpdate(input: {
  threadBranch: string | null;
  gitStatus: VcsStatusResult | null;
}): { branch: string | null } | null {
  if (!input.gitStatus) {
    return null;
  }

  if (input.gitStatus.refName === null && input.threadBranch !== null) {
    return null;
  }

  if (input.threadBranch === input.gitStatus.refName) {
    return null;
  }

  if (
    input.threadBranch !== null &&
    input.gitStatus.refName !== null &&
    !isTemporaryWorktreeBranch(input.threadBranch) &&
    isTemporaryWorktreeBranch(input.gitStatus.refName)
  ) {
    return null;
  }

  return {
    branch: input.gitStatus.refName,
  };
}

export type ChangesLineTotals = {
  readonly insertions: number;
  readonly deletions: number;
  /** Ref the counts compare against; `null` means they are uncommitted changes against HEAD. */
  readonly baseRef: string | null;
};

// `branchChanges ?? workingTree` treats `{0,0}` as present, so a zero branch total hid a dirty
// working tree and the Changes row read +0 while Diff still showed the work.
export function resolveChangesTotals(
  status: VcsStatusResult | null | undefined,
): ChangesLineTotals | null {
  if (!status) return null;
  const branch = status.branchChanges;
  const tree = { ...status.workingTree, baseRef: null };
  const selected =
    branch && (branch.insertions > 0 || branch.deletions > 0)
      ? branch
      : tree.insertions > 0 || tree.deletions > 0
        ? tree
        : (branch ?? tree);
  return {
    insertions: selected.insertions,
    deletions: selected.deletions,
    baseRef: selected.baseRef,
  };
}

/** A base ref is opaque repository data, not translatable UI copy. */
export function changesBaseLabel(baseRef: string | null, locale: ResolvedAppLocale): string {
  return baseRef === null
    ? translateWebSource(locale, "Uncommitted")
    : locale === "zh-CN"
      ? `对比 ${baseRef}`
      : `vs ${baseRef}`;
}

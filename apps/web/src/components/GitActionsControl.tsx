import { changesBaseLabel as formatChangesBaseLabel } from "./GitActionsControl.logic";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import type { WebTranslate } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";
import { useI18n } from "~/i18n/WebI18nContext";
import { ThreadDetailsControl } from "./chat/ThreadDetailsControl";
import { useAtomMount, useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthSourceControlWriteScope,
  SourceControlProviderKind,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  GitRunStackedActionResult,
  GitStackedAction,
  SourceControlCloneProtocol,
  SourceControlProviderDiscoveryItem,
  SourceControlPublishRepositoryResult,
  SourceControlRepositoryVisibility,
  VcsStatusResult,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useDeadlinePassed } from "../hooks/useDeadline";
import { useNowSecond } from "../hooks/useNowSecond";
import { flushSync } from "react-dom";
import {
  CheckIcon,
  ChevronDownIcon,
  CloudDownloadIcon,
  CloudUploadIcon,
  FileDiffIcon,
  GitBranchPlusIcon,
  GitCommitIcon,
  InfoIcon,
  LockIcon,
  GlobeIcon,
} from "lucide-react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup } from "~/components/ui/radio-group";
import { Spinner } from "~/components/ui/spinner";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";
import {
  buildMenuItems,
  formatGitActionElapsed,
  GIT_ACTION_SUCCESS_VISIBLE_MS,
  hasUsableGitMenuContent,
  type GitActionProgressPresentation,
  type GitActionIconName,
  type GitActionMenuItem,
  type GitQuickAction,
  type DefaultBranchConfirmableAction,
  requiresDefaultBranchConfirmation,
  resolveChangesTotals,
  resolveDefaultBranchActionDialogCopy,
  resolveFeatureBranchUnavailableReason,
  resolveGitActionProgressPresentation,
  resolveGitActionResultToastTiming,
  resolveLiveThreadBranchUpdate,
  resolveThreadBranchMetadataPatch,
  resolveQuickAction,
  resolveThreadBranchUpdate,
} from "./GitActionsControl.logic";
import { WizardPopup, WizardHeader, WizardSteps, WizardPanel, WizardFooter } from "./ui/wizard";
import { StartTruncatedPath } from "./StartTruncatedPath";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Menu, MenuItem, MenuItemLabel, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useOpenInPreferredEditor } from "~/editorPreferences";
import {
  useGitStackedAction,
  useSourceControlActionRunning,
  useSourceControlPublishRepositoryAction,
  useVcsInitAction,
  useVcsPullAction,
} from "../state/sourceControlActions";
import { useQuietThreadProjection, useQuietThreadShell } from "~/state/entities";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsActionManager, vcsEnvironment, vcsStatusRevalidation } from "~/state/vcs";
import { randomUUID } from "~/lib/utils";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";
import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import {
  THREAD_DETAILS_PANEL_CHEVRON_CLASS,
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LABEL_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS,
} from "./chat/threadDetailsPanelStyles";
import { getSourceControlPresentation, sourceControlIcon } from "~/sourceControlPresentation";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { formatDiffCount } from "@t3tools/client-runtime/diff-count";
import { useOpenLink } from "~/browser/useOpenLink";

interface GitActionsControlProps {
  gitCwd: string | null;
  activeThreadRef: ScopedThreadRef | null;
  draftId?: DraftId;
  compact?: boolean;
  showActions?: boolean;
  showChanges?: boolean;
  onOpenChanges?: () => void;
}

interface PendingDefaultBranchAction {
  action: DefaultBranchConfirmableAction;
  branchName: string;
  includesCommit: boolean;
  commitMessage?: string;
  onConfirmed?: () => void;
  filePaths?: string[];
}

interface RunGitActionWithToastInput {
  action: GitStackedAction;
  commitMessage?: string;
  onConfirmed?: () => void;
  skipDefaultBranchPrompt?: boolean;
  statusOverride?: VcsStatusResult | null;
  featureBranch?: boolean;
  filePaths?: string[];
}

interface InlineGitActionSuccess {
  readonly title: string;
  readonly description: string | null;
  readonly scopeKey: string;
  readonly expiresAtMs: number;
}

const inlineSuccessExpiresAt = () => Date.now() + GIT_ACTION_SUCCESS_VISIBLE_MS;

type RefreshVcsStatus = (target: {
  readonly environmentId: ScopedThreadRef["environmentId"];
  readonly input: { readonly cwd: string };
}) => Promise<unknown>;

function requestVcsStatusRefresh(
  refresh: RefreshVcsStatus,
  environmentId: ScopedThreadRef["environmentId"] | null,
  cwd: string | null,
): void {
  if (environmentId === null || cwd === null) {
    return;
  }
  void refresh({ environmentId, input: { cwd } });
}
const RUNNING_SOURCE_CONTROL_ACTIONS = ["runStackedAction", "pull", "publishRepository"] as const;

const PUBLISH_PROVIDER_OPTIONS = sourceControlClients.definitions.map((definition) => ({
  value: definition.kind,
  label: definition.pickerLabel,
  description: definition.publishDescription,
  pathPlaceholder: definition.repositoryPathHint,
  definition,
  Icon: sourceControlIcon(definition),
}));

function publishProviderOption(provider: SourceControlProviderKind) {
  return (
    PUBLISH_PROVIDER_OPTIONS.find((option) => option.value === provider) ??
    PUBLISH_PROVIDER_OPTIONS[0]!
  );
}

function getPublishProviderReadiness(input: {
  provider: SourceControlProviderKind;
  sourceControlProviders: ReadonlyArray<SourceControlProviderDiscoveryItem>;
  locale: ResolvedAppLocale;
  t: WebTranslate;
}): { readonly ready: boolean; readonly hint: string | null } {
  const { locale, t } = input;
  const discovered = input.sourceControlProviders.find(
    (provider) => provider.kind === input.provider,
  );
  if (!discovered) {
    return {
      ready: false,
      hint: translateWebSource(
        locale,
        "Provider status unavailable. Open Settings -> Source control and rescan.",
      ),
    };
  }
  if (discovered.status !== "available") {
    return { ready: false, hint: discovered.installHint };
  }
  if (discovered.auth.status === "unauthenticated") {
    return {
      ready: false,
      hint:
        Option.getOrNull(discovered.auth.detail) ??
        t("gitActions.providerUnauthenticated", { provider: discovered.label }),
    };
  }
  return { ready: true, hint: null };
}

function getMenuActionDisabledReason({
  item,
  gitStatus,
  isBusy,
  hasPrimaryRemote,
  locale,
  t,
}: {
  item: GitActionMenuItem;
  gitStatus: VcsStatusResult | null;
  isBusy: boolean;
  hasPrimaryRemote: boolean;
  locale: ResolvedAppLocale;
  t: WebTranslate;
}): string | null {
  if (!item.disabled) return null;
  if (isBusy) return translateWebSource(locale, "Git action in progress.");
  if (!gitStatus) return translateWebSource(locale, "Git status is unavailable.");

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const isAhead = gitStatus.aheadCount > 0;
  const isBehind = gitStatus.behindCount > 0;
  const terminology = getSourceControlPresentation(gitStatus.sourceControlProvider).terminology;

  if (item.id === "commit") {
    if (!hasChanges) {
      return translateWebSource(locale, "Worktree is clean. Make changes before committing.");
    }
    return translateWebSource(locale, "Commit is currently unavailable.");
  }

  if (item.id === "push") {
    if (!hasBranch) {
      return translateWebSource(locale, "Detached HEAD: check out a branch before pushing.");
    }
    if (hasChanges) {
      return translateWebSource(locale, "Commit or stash local changes before pushing.");
    }
    if (isBehind) {
      return translateWebSource(locale, "Branch is behind upstream. Pull/rebase before pushing.");
    }
    if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
      return translateWebSource(locale, 'Add an "origin" remote before pushing.');
    }
    if (!isAhead) {
      return translateWebSource(locale, "No local commits to push.");
    }
    return translateWebSource(locale, "Push is currently unavailable.");
  }

  if (!hasBranch) {
    return t("gitActions.detachedBeforeRequest", {
      request: translateWebSource(locale, terminology.singular),
    });
  }
  if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
    return t("gitActions.remoteBeforeRequest", {
      request: translateWebSource(locale, terminology.singular),
    });
  }
  if ((gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) <= 0) {
    return t("gitActions.noCommitsForRequest", {
      request: translateWebSource(locale, terminology.singular),
    });
  }
  if (isBehind) {
    return t("gitActions.behindBeforeRequest", {
      request: translateWebSource(locale, terminology.singular),
    });
  }
  return t("gitActions.createRequestUnavailable", {
    request: translateWebSource(locale, terminology.singular),
  });
}

const COMMIT_DIALOG_TITLE = "Commit changes";
const COMMIT_DIALOG_DESCRIPTION =
  "Review and confirm your commit. Leave the message blank to auto-generate one.";

function GitActionItemIcon({
  icon,
  SourceControlIcon,
}: {
  icon: GitActionIconName;
  SourceControlIcon: ReturnType<typeof getSourceControlPresentation>["Icon"];
}) {
  if (icon === "commit") return <GitCommitIcon />;
  if (icon === "push") return <CloudUploadIcon />;
  return <SourceControlIcon />;
}

function GitQuickActionIcon({
  quickAction,
  SourceControlIcon,
  className = "size-3.5",
}: {
  quickAction: GitQuickAction;
  className?: string;
  SourceControlIcon: ReturnType<typeof getSourceControlPresentation>["Icon"];
}) {
  const { locale } = useI18n();
  if (quickAction.kind === "open_publish") return <CloudUploadIcon className={className} />;
  if (quickAction.kind === "run_pull") return <CloudDownloadIcon className={className} />;
  if (quickAction.kind === "run_action") {
    if (quickAction.action === "commit") return <GitCommitIcon className={className} />;
    if (quickAction.action === "push" || quickAction.action === "commit_push") {
      return <CloudUploadIcon className={className} />;
    }
    return <SourceControlIcon className={className} />;
  }
  if (quickAction.label === translateWebSource(locale, "Commit"))
    return <GitCommitIcon className={className} />;
  if (quickAction.label === translateWebSource(locale, "Push"))
    return <CloudUploadIcon className={className} />;
  return <InfoIcon className={className} />;
}

function GitActionElapsedTime({
  startedAtMs,
  className,
}: {
  startedAtMs: number | null;
  className?: string;
}) {
  return startedAtMs === null ? null : (
    <RunningGitActionElapsedTime startedAtMs={startedAtMs} className={className} />
  );
}

function RunningGitActionElapsedTime({
  startedAtMs,
  className,
}: {
  startedAtMs: number;
  className: string | undefined;
}) {
  const { locale } = useI18n();
  const nowMs = useNowSecond();
  const elapsed = formatGitActionElapsed(startedAtMs, nowMs, locale);
  if (!elapsed) {
    return null;
  }

  return <p className={className}>{elapsed}</p>;
}

function GitActionProgressButtonContent({ progress }: { progress: GitActionProgressPresentation }) {
  const hasOutput = progress.output !== null;

  return (
    <div
      aria-atomic="false"
      aria-live="polite"
      className={cn(
        "grid min-w-0 flex-1 items-center",
        "grid-cols-[auto_minmax(0,1fr)] grid-rows-[1.5rem] gap-x-3",
      )}
      role="status"
    >
      <Spinner aria-hidden="true" className="row-start-1 -mx-0.5 shrink-0" />
      <p className={cn("row-start-1 min-w-0 truncate text-left", THREAD_DETAILS_PANEL_LABEL_CLASS)}>
        {progress.status}
      </p>
      <div
        className={cn(
          "col-start-2 grid min-w-0 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          hasOutput ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="truncate pt-0.5 text-left text-2xs font-normal text-muted-foreground" />
              }
            >
              {progress.output}
            </TooltipTrigger>
            <TooltipPopup side="bottom" className="max-w-96 break-words">
              {progress.output}
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function GitActionSuccessButtonContent({ success }: { success: InlineGitActionSuccess }) {
  const hasDescription = success.description !== null;

  return (
    <div
      aria-live="polite"
      className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[1.5rem] items-center gap-x-3"
      role="status"
    >
      <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
      <p className={cn("min-w-0 truncate text-left", THREAD_DETAILS_PANEL_LABEL_CLASS)}>
        {success.title}
      </p>
      <div
        className={cn(
          "col-start-2 grid min-w-0 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          hasDescription ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="truncate pt-0.5 text-left text-2xs font-normal text-muted-foreground" />
              }
            >
              {success.description}
            </TooltipTrigger>
            <TooltipPopup side="bottom" className="max-w-96 break-words">
              {success.description}
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

interface PublishRepositoryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: ScopedThreadRef["environmentId"] | null;
  readonly threadRef: ScopedThreadRef | null;
  readonly gitCwd: string;
}

function PublishRepositoryDialog(props: PublishRepositoryDialogProps) {
  const { locale, t } = useI18n();
  const openLink = useOpenLink(props.threadRef);
  const navigate = useNavigate();
  const sourceControlDiscovery = useEnvironmentQuery(
    props.environmentId === null
      ? null
      : sourceControlEnvironment.discovery({
          environmentId: props.environmentId,
          input: {},
        }),
  );
  const [selectedPublishProvider, setSelectedPublishProvider] =
    useState<SourceControlProviderKind | null>(null);
  const [publishRepositoryOverride, setPublishRepositoryOverride] = useState<string | null>(null);
  const [publishVisibility, setPublishVisibility] =
    useState<SourceControlRepositoryVisibility>("private");
  const [publishRemoteName, setPublishRemoteName] = useState("origin");
  const [publishProtocol, setPublishProtocol] = useState<SourceControlCloneProtocol>("ssh");
  const [publishWizardStep, setPublishWizardStep] = useState(0);
  const [publishAdvancedOpen, setPublishAdvancedOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<SourceControlPublishRepositoryResult | null>(
    null,
  );
  const sourceControlScope = {
    environmentId: props.environmentId,
    cwd: props.gitCwd,
  };
  const publishRepositoryAction = useSourceControlPublishRepositoryAction(sourceControlScope);
  const publishAccountByProvider = new Map<string, string | null>();
  for (const provider of sourceControlDiscovery.data?.sourceControlProviders ?? []) {
    publishAccountByProvider.set(provider.kind, Option.getOrNull(provider.auth.account));
  }
  const publishSourceControlProviders = sourceControlDiscovery.data?.sourceControlProviders ?? [];
  const publishReadinessByProvider = new Map(
    PUBLISH_PROVIDER_OPTIONS.map((option) => [
      option.value,
      getPublishProviderReadiness({
        provider: option.value,
        sourceControlProviders: publishSourceControlProviders,
        locale,
        t,
      }),
    ]),
  );
  const publishProviderReadiness = (provider: SourceControlProviderKind) =>
    publishReadinessByProvider.get(provider) ?? { ready: false, hint: null };
  const hasReadyPublishProvider = PUBLISH_PROVIDER_OPTIONS.some(
    (option) => publishProviderReadiness(option.value).ready,
  );
  const sortedPublishProviderOptions = PUBLISH_PROVIDER_OPTIONS.toSorted((left, right) => {
    const leftReady = publishProviderReadiness(left.value).ready;
    const rightReady = publishProviderReadiness(right.value).ready;
    if (leftReady !== rightReady) {
      return leftReady ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
  const firstReadyPublishProvider = sortedPublishProviderOptions.find(
    (option) => publishProviderReadiness(option.value).ready,
  )?.value;
  const publishProvider =
    selectedPublishProvider !== null && publishProviderReadiness(selectedPublishProvider).ready
      ? selectedPublishProvider
      : (firstReadyPublishProvider ??
        selectedPublishProvider ??
        sourceControlClients.get(undefined).kind);
  const selectedPublishProviderReadiness = publishProviderReadiness(publishProvider);
  const publishAccount = publishAccountByProvider.get(publishProvider) ?? null;
  const publishRepositoryPrefill = publishAccount ? `${publishAccount}/` : "";
  const publishRepository = publishRepositoryOverride ?? publishRepositoryPrefill;
  const currentPublishProvider = publishProviderOption(publishProvider);
  const publishHost = currentPublishProvider.definition.publishHost(
    Option.getOrNull(
      sourceControlDiscovery.data?.sourceControlProviders.find(
        (provider) => provider.kind === publishProvider,
      )?.auth.host ?? Option.none(),
    ),
  );
  const publishPathPlaceholder = currentPublishProvider.pathPlaceholder;
  const publishProviderLabel = currentPublishProvider.label;
  const publishWizardSteps = ["Provider", "Repository", "Summary"].map((step) =>
    translateWebSource(locale, step),
  );
  const publishWizardStepSummaries = [
    publishProviderLabel,
    publishResult?.repository.nameWithOwner ?? null,
    null,
  ] as const;

  const publishRepositoryParts = publishRepository.trim().split("/");
  const publishRepositoryOwner = publishRepositoryParts[0]?.trim() ?? "";
  const publishRepositoryName = publishRepositoryParts.slice(1).join("/").trim();
  const canSubmitPublishRepository =
    publishRepositoryAction.isAllowed &&
    selectedPublishProviderReadiness.ready &&
    !publishRepositoryAction.isPending &&
    publishRepositoryOwner.length > 0 &&
    publishRepositoryName.length > 0;

  const submitPublishRepository = () => {
    if (!canSubmitPublishRepository) {
      return;
    }

    setPublishError(null);

    void (async () => {
      const result = await publishRepositoryAction.run({
        provider: publishProvider,
        repository: publishRepository.trim(),
        visibility: publishVisibility,
        remoteName: publishRemoteName.trim() || "origin",
        protocol: publishProtocol,
      });

      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          setPublishError(
            error instanceof Error
              ? error.message
              : translateWebSource(locale, "An error occurred."),
          );
        }
        return;
      }

      flushSync(() => {
        setPublishResult(result.value);
        setPublishWizardStep(2);
      });
    })();
  };

  const resetState = () => {
    setPublishRemoteName("origin");
    setPublishRepositoryOverride(null);
    setPublishWizardStep(0);
    setPublishAdvancedOpen(false);
    setPublishError(null);
    setPublishResult(null);
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      resetState();
    }
  };

  const openSourceControlSettings = () => {
    handleOpenChange(false);
    void navigate({ to: "/settings/source-control" });
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <WizardPopup>
        <WizardHeader
          title={translateWebSource(locale, "Publish repository")}
          description={translateWebSource(
            locale,
            "Pick where to host it, then point us at a repo to push to.",
          )}
        >
          <WizardSteps
            steps={publishWizardSteps}
            currentStep={publishWizardStep}
            summaries={publishWizardStepSummaries}
            showSummaries
            isStepDisabled={(index) =>
              publishWizardStep === 2 ||
              index >= publishWizardSteps.length - 1 ||
              index > publishWizardStep
            }
            onStepChange={setPublishWizardStep}
          />
        </WizardHeader>

        <WizardPanel>
          <div className={cn("space-y-2", publishWizardStep !== 0 && "hidden")}>
            <span id="publish-provider-cards-label" className="text-xs font-medium text-foreground">
              {translateWebSource(locale, "Provider")}
            </span>
            <RadioGroup
              value={publishProvider}
              onValueChange={(value) => {
                setSelectedPublishProvider(value as SourceControlProviderKind);
                setPublishRepositoryOverride(null);
              }}
              aria-labelledby="publish-provider-cards-label"
              className="grid grid-cols-2"
            >
              {sortedPublishProviderOptions.map((option) => {
                const readiness = publishProviderReadiness(option.value);
                const isSelected = publishProvider === option.value && readiness.ready;
                if (!readiness.ready) {
                  return (
                    <div
                      key={option.value}
                      className="relative flex cursor-not-allowed items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 text-left opacity-64 dark:border-transparent dark:bg-white/[0.035]"
                    >
                      <option.Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="warning-outline"
                              size="micro"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openSourceControlSettings();
                              }}
                            >
                              {translateWebSource(locale, "Setup Required")}
                            </Button>
                          }
                        />
                        <TooltipPopup side="top" align="end">
                          {readiness.hint ??
                            translateWebSource(
                              locale,
                              "Open Settings -> Source control to configure this provider.",
                            )}
                        </TooltipPopup>
                      </Tooltip>
                    </div>
                  );
                }

                return (
                  <RadioPrimitive.Root
                    key={option.value}
                    value={option.value}
                    className={cn(
                      "relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left outline-none transition-[background-color,border-color,box-shadow]",
                      "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                      isSelected
                        ? "border-primary bg-background shadow-sm ring-2 ring-inset ring-primary/35 dark:border-transparent dark:bg-primary/10 dark:shadow-none dark:ring-1 dark:ring-primary/30"
                        : "border-border bg-background hover:border-foreground/20 hover:bg-muted/50 dark:border-transparent dark:bg-white/[0.035] dark:hover:bg-accent",
                    )}
                  >
                    <option.Icon className="size-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                  </RadioPrimitive.Root>
                );
              })}
            </RadioGroup>
          </div>

          <div className={cn("space-y-5", publishWizardStep !== 1 && "hidden")}>
            <div className="space-y-2">
              <label
                htmlFor="publish-repository-path"
                className="text-xs font-medium text-foreground"
              >
                {translateWebSource(locale, "Repository")}
              </label>
              <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ring">
                <span className="flex shrink-0 items-center gap-1.5 border-r border-input bg-muted/50 px-2.5 font-mono text-xs text-muted-foreground">
                  <currentPublishProvider.Icon className="size-3.5" />
                  {publishHost}/
                </span>
                <input
                  id="publish-repository-path"
                  name="publish-repository-path"
                  value={publishRepository}
                  onChange={(event) => {
                    setPublishRepositoryOverride(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitPublishRepository();
                    }
                  }}
                  placeholder={publishPathPlaceholder}
                  disabled={publishRepositoryAction.isPending}
                  className="w-full bg-transparent px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/60 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <span
                id="publish-visibility-cards-label"
                className="text-xs font-medium text-foreground"
              >
                {translateWebSource(locale, "Visibility")}
              </span>
              <RadioGroup
                value={publishVisibility}
                onValueChange={(value) =>
                  setPublishVisibility(value as SourceControlRepositoryVisibility)
                }
                aria-labelledby="publish-visibility-cards-label"
                disabled={publishRepositoryAction.isPending}
                className="grid grid-cols-2"
              >
                {[
                  {
                    value: "private" as const,
                    label: translateWebSource(locale, "Private"),
                    description: translateWebSource(locale, "Only invited people"),
                    Icon: LockIcon,
                  },
                  {
                    value: "public" as const,
                    label: translateWebSource(locale, "Public"),
                    description: translateWebSource(locale, "Anyone on the web"),
                    Icon: GlobeIcon,
                  },
                ].map((option) => {
                  const isSelected = publishVisibility === option.value;
                  return (
                    <RadioPrimitive.Root
                      key={option.value}
                      value={option.value}
                      className={cn(
                        "relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-[background-color,border-color,box-shadow]",
                        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                        isSelected
                          ? "border-primary bg-background shadow-sm ring-2 ring-inset ring-primary/35 dark:border-transparent dark:bg-primary/10 dark:shadow-none dark:ring-1 dark:ring-primary/30"
                          : "border-border bg-background hover:border-foreground/20 hover:bg-muted/50 dark:border-transparent dark:bg-white/[0.035] dark:hover:bg-accent",
                      )}
                    >
                      <option.Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </RadioPrimitive.Root>
                  );
                })}
              </RadioGroup>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setPublishAdvancedOpen((prev) => !prev)}
                aria-expanded={publishAdvancedOpen}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 transition-transform",
                    publishAdvancedOpen ? "" : "-rotate-90",
                  )}
                />
                {translateWebSource(locale, "Advanced")}
              </button>
              {publishAdvancedOpen ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5" htmlFor="publish-remote-name">
                    <span className="text-xs font-medium text-foreground">
                      {translateWebSource(locale, "Remote")}
                    </span>
                    <Input
                      id="publish-remote-name"
                      value={publishRemoteName}
                      onChange={(event) => setPublishRemoteName(event.target.value)}
                      placeholder="origin"
                      disabled={publishRepositoryAction.isPending}
                    />
                  </label>
                  <div className="space-y-1.5">
                    <span
                      id="publish-protocol-label"
                      className="text-xs font-medium text-foreground"
                    >
                      {translateWebSource(locale, "Protocol")}
                    </span>
                    <ToggleGroup
                      value={[publishProtocol]}
                      onValueChange={(next) => {
                        const protocol = next[0];
                        if (protocol === "ssh" || protocol === "https") {
                          setPublishProtocol(protocol);
                        }
                      }}
                      aria-labelledby="publish-protocol-label"
                      disabled={publishRepositoryAction.isPending}
                    >
                      <Toggle value="ssh">SSH</Toggle>
                      <Toggle value="https">HTTPS</Toggle>
                    </ToggleGroup>
                  </div>
                </div>
              ) : null}
            </div>

            {publishRepositoryAction.isPending ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-muted-foreground dark:border-transparent dark:bg-white/[0.035]"
              >
                <Spinner size="sm" aria-hidden />
                {t("gitActions.publishingTo", { provider: publishProviderLabel })}
              </div>
            ) : null}
            {publishError && !publishRepositoryAction.isPending ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <p className="font-medium">{translateWebSource(locale, "Publish failed")}</p>
                <p className="mt-0.5 text-destructive/90">{publishError}</p>
              </div>
            ) : null}
          </div>

          <div className={cn("space-y-4", publishWizardStep !== 2 && "hidden")}>
            {publishResult ? (
              <>
                <div className="flex flex-col items-center gap-2 py-1 text-center">
                  <span className="grid size-8 place-items-center rounded-full bg-success/15 text-success">
                    <CheckIcon className="size-4" aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold text-foreground">
                    {publishResult.status === "pushed"
                      ? translateWebSource(locale, "Repository published")
                      : translateWebSource(locale, "Repository created")}
                  </h3>
                  <p className="max-w-xs text-pretty text-xs text-muted-foreground">
                    {publishResult.status === "pushed"
                      ? t("gitActions.publishedBranch", {
                          branch: publishResult.branch,
                          provider: publishProviderLabel,
                        })
                      : t("gitActions.remoteReady", { remote: publishResult.remoteName })}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 py-2 dark:border-transparent dark:bg-white/[0.035]">
                  <currentPublishProvider.Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {publishResult.repository.nameWithOwner}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    void openLink(publishResult.repository.url).catch(() => undefined);
                  }}
                >
                  {t("gitActions.openOnProvider", { provider: publishProviderLabel })}
                </Button>
              </>
            ) : (
              <div className="rounded-md border border-input bg-background px-3 py-2 text-xs text-muted-foreground dark:border-transparent dark:bg-white/[0.035]">
                {translateWebSource(locale, "Publish result unavailable.")}
              </div>
            )}
          </div>
        </WizardPanel>

        <WizardFooter>
          {publishWizardStep === 2 ? (
            <Button onClick={() => handleOpenChange(false)}>
              {translateWebSource(locale, "Done")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={publishRepositoryAction.isPending}
                onClick={() => {
                  if (publishWizardStep === 0) {
                    handleOpenChange(false);
                    return;
                  }
                  setPublishWizardStep((step) => Math.max(0, step - 1));
                }}
              >
                {publishWizardStep === 0
                  ? translateWebSource(locale, "Cancel")
                  : translateWebSource(locale, "Back")}
              </Button>
              {publishWizardStep < 1 ? (
                <Button
                  disabled={!hasReadyPublishProvider || !selectedPublishProviderReadiness.ready}
                  onClick={() => setPublishWizardStep((step) => Math.min(1, step + 1))}
                >
                  {translateWebSource(locale, "Next")}
                </Button>
              ) : (
                <Button disabled={!canSubmitPublishRepository} onClick={submitPublishRepository}>
                  {publishRepositoryAction.isPending ? (
                    <>
                      <Spinner size="sm" aria-hidden />
                      {translateWebSource(locale, "Publishing...")}
                    </>
                  ) : (
                    translateWebSource(locale, "Publish")
                  )}
                </Button>
              )}
            </>
          )}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}

export default function GitActionsControl({
  gitCwd,
  activeThreadRef,
  draftId,
  compact = false,
  showActions = true,
  showChanges = true,
  onOpenChanges,
}: GitActionsControlProps) {
  const { locale, t } = useI18n();
  const panelAnchorRef = useRef<HTMLDivElement | null>(null);
  const updateThreadMetadata = useAtomCommand(
    threadEnvironment.updateMetadata,
    "thread branch metadata update",
  );
  const activeEnvironmentId = activeThreadRef?.environmentId ?? null;
  const successScopeKey = `${activeEnvironmentId ?? ""}\u0000${gitCwd ?? ""}`;
  const canWriteSourceControl = useEnvironmentScope(
    activeEnvironmentId,
    AuthSourceControlWriteScope,
  );
  const canOperateThread = useEnvironmentScope(activeEnvironmentId, AuthOrchestrationOperateScope);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(activeEnvironmentId));
  const openInPreferredEditor = useOpenInPreferredEditor(
    activeEnvironmentId,
    serverConfig?.availableEditors ?? [],
  );
  const threadToastData = activeThreadRef ? { threadRef: activeThreadRef } : undefined;
  const activeServerThreadShell = useQuietThreadShell(activeThreadRef);
  const activeDraftThread = useComposerDraftStore((store) =>
    draftId
      ? store.getDraftSession(draftId)
      : activeThreadRef
        ? store.getDraftThreadByRef(activeThreadRef)
        : null,
  );
  const activeServerThreadProjection = useQuietThreadProjection(
    activeDraftThread !== null && activeServerThreadShell === null ? null : activeThreadRef,
  );
  const activeServerThread =
    activeServerThreadShell ?? activeServerThreadProjection?.projection.thread ?? null;
  const isLocalDraftThread = activeDraftThread !== null && activeServerThread === null;
  const canChangeThreadBranch = canWriteSourceControl && (isLocalDraftThread || canOperateThread);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [dialogCommitMessage, setDialogCommitMessage] = useState("");
  const [excludedFiles, setExcludedFiles] = useState<ReadonlySet<string>>(new Set());
  const [isEditingFiles, setIsEditingFiles] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [inlineSuccess, setInlineSuccess] = useState<InlineGitActionSuccess | null>(null);
  const [pendingDefaultBranchAction, setPendingDefaultBranchAction] =
    useState<PendingDefaultBranchAction | null>(null);
  const sourceControlScope = { environmentId: activeEnvironmentId, cwd: gitCwd };
  const vcsActionState = useAtomValue(vcsActionManager.stateAtom(sourceControlScope));
  const inlineSuccessExpired = useDeadlinePassed(inlineSuccess?.expiresAtMs ?? null);
  const visibleInlineSuccess =
    inlineSuccess?.scopeKey === successScopeKey && !inlineSuccessExpired ? inlineSuccess : null;

  const persistThreadBranchSync = (branch: string | null, manualSelection = false) => {
    if (!activeThreadRef) {
      return;
    }

    if (activeServerThread) {
      if (
        !readEnvironmentScope(activeThreadRef.environmentId, AuthOrchestrationOperateScope) ||
        activeServerThread.branch === branch
      ) {
        return;
      }

      void updateThreadMetadata({
        environmentId: activeThreadRef.environmentId,
        input: {
          threadId: activeThreadRef.threadId,
          ...resolveThreadBranchMetadataPatch(branch, activeServerThread.branch),
        },
      });

      return;
    }

    if (!activeDraftThread || activeDraftThread.branch === branch) {
      return;
    }

    setDraftThreadContext(draftId ?? activeThreadRef, {
      branch,
      worktreePath: activeDraftThread.worktreePath,
      environmentSelection: manualSelection
        ? "manual"
        : (activeDraftThread.environmentSelection ??
          (activeDraftThread.branch ? "manual" : "auto")),
    });
  };
  const persistLiveThreadBranch = useEffectEvent((branch: string | null) => {
    persistThreadBranchSync(branch);
  });

  const syncThreadBranchAfterGitAction = (result: GitRunStackedActionResult) => {
    const branchUpdate = resolveThreadBranchUpdate(result);
    if (!branchUpdate) {
      return;
    }

    persistThreadBranchSync(branchUpdate.branch, true);
  };

  const gitStatusQuery = useEnvironmentQuery(
    activeEnvironmentId !== null && gitCwd !== null
      ? vcsEnvironment.status({
          environmentId: activeEnvironmentId,
          input: { cwd: gitCwd },
        })
      : null,
  );
  const refreshVcsStatus = useAtomCommand(vcsEnvironment.refreshStatus, {
    reportFailure: false,
  });
  const { data: gitStatus, error: gitStatusError } = gitStatusQuery;
  const sourceControlPresentation = getSourceControlPresentation(gitStatus?.sourceControlProvider);
  const changeRequestTerminology = sourceControlPresentation.terminology;
  const SourceControlIcon = sourceControlPresentation.Icon;
  const isRepo = gitStatus?.isRepo ?? true;
  const hasPrimaryRemote = gitStatus?.hasPrimaryRemote ?? false;
  const gitStatusForActions = gitStatus;
  const resolvedChangesTotals = resolveChangesTotals(gitStatusForActions);
  const changesTotals = resolvedChangesTotals ?? { insertions: 0, deletions: 0 };
  const changesBaseLabel = resolvedChangesTotals
    ? formatChangesBaseLabel(resolvedChangesTotals.baseRef, locale)
    : null;

  const allFiles = gitStatusForActions?.workingTree.files ?? [];
  // Changed-file paths are repository-relative, so they must resolve against
  // the worktree root from the same status snapshot, not the project cwd.
  const workingTreeRoot = gitStatusForActions?.workingTree.rootPath ?? null;
  const selectedFiles = allFiles.filter((f) => !excludedFiles.has(f.path));
  const allSelected = excludedFiles.size === 0;
  const noneSelected = selectedFiles.length === 0;

  const initAction = useVcsInitAction(sourceControlScope);
  const runImmediateGitAction = useGitStackedAction(sourceControlScope);
  const pullAction = useVcsPullAction(sourceControlScope);
  const isGitActionRunning = useSourceControlActionRunning(
    sourceControlScope,
    RUNNING_SOURCE_CONTROL_ACTIONS,
  );
  const isSelectingWorktreeBase =
    !activeServerThread &&
    activeDraftThread?.envMode === "worktree" &&
    activeDraftThread.worktreePath === null;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- persists the draft thread branch when the live git status subscription reports a different branch
  useEffect(() => {
    if (isGitActionRunning || isSelectingWorktreeBase || activeServerThread) {
      return;
    }

    const branchUpdate = resolveLiveThreadBranchUpdate({
      threadBranch: activeDraftThread?.branch ?? null,
      gitStatus: gitStatusForActions,
    });
    if (!branchUpdate) {
      return;
    }

    persistLiveThreadBranch(branchUpdate.branch);
  }, [
    activeServerThread,
    activeDraftThread?.branch,
    gitStatusForActions,
    isGitActionRunning,
    isSelectingWorktreeBase,
  ]);

  const isDefaultRef = gitStatusForActions?.isDefaultRef ?? false;

  const gitActionMenuItems = buildMenuItems(
    gitStatusForActions,
    isGitActionRunning,
    hasPrimaryRemote,
    locale,
  );
  const quickAction = resolveQuickAction(
    gitStatusForActions,
    isGitActionRunning,
    isDefaultRef,
    hasPrimaryRemote,
    locale,
  );
  const quickActionDisabledReason = !canWriteSourceControl
    ? translateWebSource(locale, "This connection cannot change source control.")
    : quickAction.disabled
      ? (quickAction.hint ?? translateWebSource(locale, "This action is currently unavailable."))
      : null;
  const gitActionProgress = resolveGitActionProgressPresentation(vcsActionState, locale);
  // A fresh draft or a thread with no turns hides commit, push, and diff rows until there is work.
  const quietEmptyDraft =
    (draftId !== undefined || activeServerThreadShell?.latestRun === null) &&
    gitActionProgress === null &&
    !gitStatusError &&
    quickAction.disabled &&
    !changesTotals.insertions &&
    !changesTotals.deletions;
  const pendingDefaultBranchActionCopy = pendingDefaultBranchAction
    ? resolveDefaultBranchActionDialogCopy({
        action: pendingDefaultBranchAction.action,
        branchName: pendingDefaultBranchAction.branchName,
        includesCommit: pendingDefaultBranchAction.includesCommit,
        terminology: changeRequestTerminology,
        locale,
      })
    : null;
  // Keep enabled until live status loads; the server rejects stale requests.
  const featureBranchUnavailableReason = pendingDefaultBranchAction
    ? resolveFeatureBranchUnavailableReason({
        branchName: pendingDefaultBranchAction.branchName,
        hasWorkingTreeChanges: gitStatus?.hasWorkingTreeChanges ?? true,
        locale,
      })
    : null;

  useAtomMount(
    vcsStatusRevalidation(
      activeEnvironmentId !== null && gitCwd !== null
        ? { environmentId: activeEnvironmentId, cwd: gitCwd }
        : null,
    ),
  );

  async function runGitActionWithToast({
    action,
    commitMessage,
    onConfirmed,
    skipDefaultBranchPrompt = false,
    statusOverride,
    featureBranch = false,
    filePaths,
  }: RunGitActionWithToastInput) {
    if (
      activeEnvironmentId === null ||
      !readEnvironmentScope(activeEnvironmentId, AuthSourceControlWriteScope) ||
      (featureBranch &&
        !isLocalDraftThread &&
        !readEnvironmentScope(activeEnvironmentId, AuthOrchestrationOperateScope))
    )
      return;
    const actionStatus = statusOverride ?? gitStatusForActions;
    const actionBranch = actionStatus?.refName ?? null;
    const actionIsDefaultBranch = featureBranch ? false : isDefaultRef;
    const actionCanCommit =
      action === "commit" || action === "commit_push" || action === "commit_push_pr";
    const includesCommit =
      actionCanCommit &&
      (action === "commit" || !!actionStatus?.hasWorkingTreeChanges || featureBranch);
    if (
      !skipDefaultBranchPrompt &&
      requiresDefaultBranchConfirmation(action, actionIsDefaultBranch) &&
      actionBranch
    ) {
      if (
        action !== "push" &&
        action !== "create_pr" &&
        action !== "commit_push" &&
        action !== "commit_push_pr"
      ) {
        return;
      }
      setPendingDefaultBranchAction({
        action,
        branchName: actionBranch,
        includesCommit,
        ...(commitMessage ? { commitMessage } : {}),
        ...(onConfirmed ? { onConfirmed } : {}),
        ...(filePaths ? { filePaths } : {}),
      });
      return;
    }
    onConfirmed?.();
    setInlineSuccess(null);

    const scopedToastData = threadToastData ? { ...threadToastData } : undefined;
    const actionId = randomUUID();

    const result = await runImmediateGitAction.run({
      actionId,
      action,
      ...(commitMessage ? { commitMessage } : {}),
      ...(featureBranch ? { featureBranch } : {}),
      ...(filePaths ? { filePaths } : {}),
      ...(activeServerThread ? { threadId: activeServerThread.id } : {}),
      ...(activeDraftThread ? { projectId: activeDraftThread.projectId } : {}),
    });

    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) {
        return;
      }

      const error = squashAtomCommandFailure(result);
      const errorToastTiming = resolveGitActionResultToastTiming("error");
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: translateWebSource(locale, "Action failed"),
          description:
            error instanceof Error
              ? error.message
              : translateWebSource(locale, "An error occurred."),
          timeout: errorToastTiming.timeout,
          ...(scopedToastData !== undefined ? { data: scopedToastData } : {}),
        }),
      );
      return;
    }

    const actionResult = result.value;
    syncThreadBranchAfterGitAction(actionResult);
    const createdPullRequest = actionResult.pr.status === "created";
    const shortSha = actionResult.commit.commitSha?.slice(0, 7);
    const pushedBranch = actionResult.push.upstreamBranch ?? actionResult.push.branch;
    const successTitle =
      actionResult.pr.status === "opened_existing"
        ? t("gitActions.openedRequest", {
            request: changeRequestTerminology.shortLabel,
            number: actionResult.pr.number ? ` #${actionResult.pr.number}` : "",
          })
        : actionResult.push.status === "pushed"
          ? t("gitActions.pushedResult", {
              commit: shortSha ? ` ${shortSha}` : "",
              branch: pushedBranch ? t("gitActions.toBranch", { branch: pushedBranch }) : "",
            })
          : actionResult.commit.status === "created"
            ? shortSha
              ? t("gitActions.committedSha", { sha: shortSha })
              : translateWebSource(locale, "Committed changes")
            : translateWebSource(locale, actionResult.toast.title);
    setInlineSuccess({
      title: createdPullRequest
        ? t("gitActions.createdRequest", { request: changeRequestTerminology.shortLabel })
        : successTitle,
      description: createdPullRequest ? null : (actionResult.toast.description ?? null),
      scopeKey: successScopeKey,
      expiresAtMs: inlineSuccessExpiresAt(),
    });
  }

  const continuePendingDefaultBranchAction = (featureBranch: boolean) => {
    if (!pendingDefaultBranchAction || !canWriteSourceControl) return;
    if (featureBranch && (!canChangeThreadBranch || featureBranchUnavailableReason !== null))
      return;
    const { action, commitMessage, onConfirmed, filePaths } = pendingDefaultBranchAction;
    setPendingDefaultBranchAction(null);
    void runGitActionWithToast({
      action,
      ...(commitMessage ? { commitMessage } : {}),
      ...(onConfirmed ? { onConfirmed } : {}),
      ...(filePaths ? { filePaths } : {}),
      featureBranch,
      skipDefaultBranchPrompt: true,
    });
  };

  const runDialogActionOnNewBranch = () => {
    if (!isCommitDialogOpen) return;
    const commitMessage = dialogCommitMessage.trim();

    setIsCommitDialogOpen(false);
    setDialogCommitMessage("");
    setExcludedFiles(new Set());
    setIsEditingFiles(false);

    void runGitActionWithToast({
      action: "commit",
      ...(commitMessage ? { commitMessage } : {}),
      ...(!allSelected ? { filePaths: selectedFiles.map((f) => f.path) } : {}),
      featureBranch: true,
      skipDefaultBranchPrompt: true,
    });
  };

  const runQuickAction = () => {
    if (quickAction.kind === "open_publish") {
      setIsPublishDialogOpen(true);
      return;
    }
    if (quickAction.kind === "run_pull") {
      void (async () => {
        setInlineSuccess(null);
        const result = await pullAction.run();
        if (result._tag === "Failure") {
          if (isAtomCommandInterrupted(result)) {
            return;
          }
          const error = squashAtomCommandFailure(result);
          const errorToastTiming = resolveGitActionResultToastTiming("error");
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: translateWebSource(locale, "Pull failed"),
              description:
                error instanceof Error
                  ? error.message
                  : translateWebSource(locale, "An error occurred."),
              timeout: errorToastTiming.timeout,
              ...(threadToastData !== undefined ? { data: threadToastData } : {}),
            }),
          );
          return;
        }

        const pullResult = result.value;
        const title =
          pullResult.status === "pulled"
            ? translateWebSource(locale, "Pulled")
            : translateWebSource(locale, "Already up to date");
        const description =
          pullResult.status === "pulled"
            ? t("gitActions.pulledBranch", {
                branch: pullResult.refName,
                upstream: pullResult.upstreamRef ?? translateWebSource(locale, "upstream"),
              })
            : t("gitActions.branchSynchronized", { branch: pullResult.refName });
        setInlineSuccess({
          title,
          description,
          scopeKey: successScopeKey,
          expiresAtMs: inlineSuccessExpiresAt(),
        });
      })();
      return;
    }
    if (quickAction.kind === "show_hint") {
      toastManager.add({
        type: "info",
        title: quickAction.label,
        description: quickAction.hint,
        data: threadToastData,
      });
      return;
    }
    if (quickAction.action) {
      void runGitActionWithToast({ action: quickAction.action });
    }
  };

  const openDialogForMenuItem = (item: GitActionMenuItem) => {
    if (item.disabled) return;
    if (item.dialogAction === "push") {
      void runGitActionWithToast({ action: "push" });
      return;
    }
    if (item.dialogAction === "create_pr") {
      void runGitActionWithToast({ action: "create_pr" });
      return;
    }
    setExcludedFiles(new Set());
    setIsEditingFiles(false);
    setIsCommitDialogOpen(true);
  };

  const runDialogAction = () => {
    if (!isCommitDialogOpen) return;
    const commitMessage = dialogCommitMessage.trim();
    setIsCommitDialogOpen(false);
    setDialogCommitMessage("");
    setExcludedFiles(new Set());
    setIsEditingFiles(false);
    void runGitActionWithToast({
      action: "commit",
      ...(commitMessage ? { commitMessage } : {}),
      ...(!allSelected ? { filePaths: selectedFiles.map((f) => f.path) } : {}),
    });
  };

  const openChangedFileInEditor = (filePath: string) => {
    if (workingTreeRoot === null) {
      toastManager.add({
        type: "error",
        title: translateWebSource(locale, "Editor opening is unavailable."),
        data: threadToastData,
      });
      return;
    }
    const target = resolvePathLinkTarget(filePath, workingTreeRoot);
    void (async () => {
      const result = await openInPreferredEditor(target);
      if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
        return;
      }
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: translateWebSource(locale, "Unable to open file"),
          description:
            error instanceof Error
              ? error.message
              : translateWebSource(locale, "An error occurred."),
          ...(threadToastData !== undefined ? { data: threadToastData } : {}),
        }),
      );
    })();
  };

  const canPublishRepository =
    canWriteSourceControl && isRepo && gitStatusForActions !== null && !hasPrimaryRemote;
  const isDetachedHead = gitStatusForActions?.refName === null;
  const isCleanAndBehind =
    gitStatusForActions !== null &&
    gitStatusForActions.refName !== null &&
    !gitStatusForActions.hasWorkingTreeChanges &&
    gitStatusForActions.behindCount > 0 &&
    gitStatusForActions.aheadCount === 0;
  const hasGitMenuContent = hasUsableGitMenuContent({
    menuItems: gitActionMenuItems,
    canWriteSourceControl,
    canPublishRepository,
    hasNotice: isDetachedHead || isCleanAndBehind || Boolean(gitStatusError),
  });

  // A disabled menu cannot refresh on open, and terminal edits or commits publish no status.
  const refreshStatusForEmptyMenu = () =>
    requestVcsStatusRefresh(refreshVcsStatus, activeEnvironmentId, gitCwd);

  const initializeGit = () => {
    void (async () => {
      const result = await initAction.run();
      if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
        return;
      }
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: translateWebSource(locale, "Git initialization failed"),
          description:
            error instanceof Error
              ? error.message
              : translateWebSource(locale, "An error occurred."),
          ...(threadToastData !== undefined ? { data: threadToastData } : {}),
        }),
      );
    })();
  };
  const gitItems = (
    <>
      {gitActionMenuItems.map((item) => {
        const disabledReason = getMenuActionDisabledReason({
          item,
          gitStatus: gitStatusForActions,
          isBusy: isGitActionRunning,
          hasPrimaryRemote,
          locale,
          t,
        });
        if (item.disabled && disabledReason) {
          return (
            <Popover key={`${item.id}-${item.label}`}>
              <PopoverTrigger
                openOnHover
                nativeButton={false}
                render={<span className="block w-full cursor-not-allowed" />}
              >
                <MenuItem className="w-full" disabled>
                  <GitActionItemIcon icon={item.icon} SourceControlIcon={SourceControlIcon} />
                  <MenuItemLabel>{item.label}</MenuItemLabel>
                </MenuItem>
              </PopoverTrigger>
              <PopoverPopup tooltipStyle side="left" align="center">
                {disabledReason}
              </PopoverPopup>
            </Popover>
          );
        }

        return (
          <MenuItem
            key={`${item.id}-${item.label}`}
            disabled={!canWriteSourceControl || item.disabled}
            onClick={() => {
              openDialogForMenuItem(item);
            }}
          >
            <GitActionItemIcon icon={item.icon} SourceControlIcon={SourceControlIcon} />
            <MenuItemLabel>{item.label}</MenuItemLabel>
          </MenuItem>
        );
      })}
      {canPublishRepository ? (
        <MenuItem
          disabled={isGitActionRunning}
          onClick={() => {
            setIsPublishDialogOpen(true);
          }}
        >
          <CloudUploadIcon />
          <MenuItemLabel>{translateWebSource(locale, "Publish repository...")}</MenuItemLabel>
        </MenuItem>
      ) : null}
      {isDetachedHead && (
        <p className="px-2 py-1.5 text-xs text-warning">
          {t("gitActions.detachedActions", {
            request: translateWebSource(locale, changeRequestTerminology.singular),
          })}
        </p>
      )}
      {isCleanAndBehind && (
        <p className="px-2 py-1.5 text-xs text-warning">
          {translateWebSource(locale, "Behind upstream. Pull/rebase first.")}
        </p>
      )}
      {gitStatusError && <p className="px-2 py-1.5 text-xs text-destructive">{gitStatusError}</p>}
    </>
  );

  if (!gitCwd) return null;

  return (
    <>
      {!showActions ? null : !isRepo ? (
        <ThreadDetailsControl
          size="xs"
          variant="ghost"
          part="row"
          panel
          disabled={!canWriteSourceControl || initAction.isPending}
          onClick={initializeGit}
        >
          <GitBranchPlusIcon className="size-3.5" aria-hidden />
          <span className={cn("ml-0.5", THREAD_DETAILS_PANEL_LABEL_CLASS)}>
            {initAction.isPending
              ? translateWebSource(locale, "Initializing...")
              : translateWebSource(locale, "Initialize Git")}
          </span>
        </ThreadDetailsControl>
      ) : quietEmptyDraft || (compact && !gitActionProgress && !visibleInlineSuccess) ? null : (
        <div
          role="group"
          aria-label={translateWebSource(locale, "Git actions")}
          ref={panelAnchorRef}
          onPointerEnter={hasGitMenuContent ? undefined : refreshStatusForEmptyMenu}
          onFocus={hasGitMenuContent ? undefined : refreshStatusForEmptyMenu}
          className={cn(
            "shrink-0",
            THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS,
            gitActionProgress && "bg-black/[0.035] dark:bg-white/[0.055]",
          )}
        >
          {gitActionProgress ? (
            <ThreadDetailsControl
              aria-label={
                gitActionProgress.output
                  ? `${gitActionProgress.status} ${gitActionProgress.output}`
                  : gitActionProgress.status
              }
              part="primary"
              panel
              multiline
              disabled
              size="xs"
              variant="ghost"
            >
              <GitActionProgressButtonContent progress={gitActionProgress} />
            </ThreadDetailsControl>
          ) : visibleInlineSuccess ? (
            <ThreadDetailsControl part="primary" multiline disabled size="xs" variant="ghost">
              <GitActionSuccessButtonContent success={visibleInlineSuccess} />
            </ThreadDetailsControl>
          ) : quickActionDisabledReason ? (
            <Popover>
              <PopoverTrigger
                openOnHover
                render={
                  <ThreadDetailsControl
                    aria-disabled="true"
                    part="primary"
                    panel
                    size="xs"
                    variant="ghost"
                  />
                }
              >
                <GitQuickActionIcon
                  quickAction={quickAction}
                  SourceControlIcon={SourceControlIcon}
                  className={THREAD_DETAILS_PANEL_ICON_CLASS}
                />
                <span
                  className={cn(
                    "sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5",
                    cn("not-sr-only ml-0 truncate", THREAD_DETAILS_PANEL_LABEL_CLASS),
                  )}
                >
                  {quickAction.label}
                </span>
              </PopoverTrigger>
              <PopoverPopup tooltipStyle side="bottom" align="start">
                {quickActionDisabledReason}
              </PopoverPopup>
            </Popover>
          ) : (
            <ThreadDetailsControl
              variant="ghost"
              size="xs"
              part="primary"
              panel
              disabled={!canWriteSourceControl || isGitActionRunning || quickAction.disabled}
              onClick={runQuickAction}
            >
              <GitQuickActionIcon
                quickAction={quickAction}
                SourceControlIcon={SourceControlIcon}
                className={THREAD_DETAILS_PANEL_ICON_CLASS}
              />
              <span
                className={cn(
                  "sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5",
                  cn("not-sr-only ml-0 truncate", THREAD_DETAILS_PANEL_LABEL_CLASS),
                )}
              >
                {quickAction.label}
              </span>
            </ThreadDetailsControl>
          )}
          {gitActionProgress ? (
            <GitActionElapsedTime
              startedAtMs={gitActionProgress.startedAtMs}
              className="flex h-8 shrink-0 items-center self-start pe-2.5 text-2xs font-normal tabular-nums text-muted-foreground"
            />
          ) : (
            <>
              <span aria-hidden="true" className={THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS} />
              <Menu
                onOpenChange={(open) => {
                  if (open) {
                    requestVcsStatusRefresh(refreshVcsStatus, activeEnvironmentId, gitCwd);
                  }
                }}
              >
                <MenuTrigger
                  render={
                    <ThreadDetailsControl
                      aria-label={translateWebSource(locale, "Git action options")}
                      size="sm"
                      variant="ghost"
                      part="secondary"
                      panel
                    />
                  }
                  disabled={isGitActionRunning || !hasGitMenuContent}
                >
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={THREAD_DETAILS_PANEL_CHEVRON_CLASS}
                  />
                </MenuTrigger>
                <MenuPopup align="end" anchor={panelAnchorRef} className="w-(--anchor-width)">
                  {gitItems}
                </MenuPopup>
              </Menu>
            </>
          )}
        </div>
      )}

      {showChanges && isRepo && !quietEmptyDraft ? (
        <ThreadDetailsControl
          type="button"
          variant="ghost"
          size="sm"
          part="row"
          disabled={!onOpenChanges}
          onClick={onOpenChanges}
        >
          <FileDiffIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} aria-hidden />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="shrink-0">{translateWebSource(locale, "Changes")}</span>
            {changesBaseLabel ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="pointer-events-auto min-w-0 truncate font-normal text-muted-foreground" />
                  }
                >
                  {changesBaseLabel}
                </TooltipTrigger>
                <TooltipPopup side="top" className="max-w-96 break-words">
                  {changesBaseLabel}
                </TooltipPopup>
              </Tooltip>
            ) : null}
            <span className="ml-auto flex shrink-0 items-baseline gap-2 ps-2 font-mono tabular-nums">
              <span
                className={
                  changesTotals.insertions
                    ? "text-diff-addition-foreground"
                    : "text-muted-foreground"
                }
              >
                +{formatDiffCount(changesTotals.insertions)}
              </span>
              <span
                className={
                  changesTotals.deletions
                    ? "text-diff-deletion-foreground"
                    : "text-muted-foreground"
                }
              >
                -{formatDiffCount(changesTotals.deletions)}
              </span>
            </span>
          </span>
        </ThreadDetailsControl>
      ) : null}

      <Dialog
        open={isCommitDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCommitDialogOpen(false);
            setDialogCommitMessage("");
            setExcludedFiles(new Set());
            setIsEditingFiles(false);
          }
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{translateWebSource(locale, COMMIT_DIALOG_TITLE)}</DialogTitle>
            <DialogDescription>
              {translateWebSource(locale, COMMIT_DIALOG_DESCRIPTION)}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-3 rounded-xl bg-zinc-25 p-3 text-sm ring-1 ring-black/5 dark:bg-white/[0.035] dark:ring-white/5">
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">
                  {translateWebSource(locale, "Branch")}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {gitStatusForActions?.refName ?? translateWebSource(locale, "(detached HEAD)")}
                  </span>
                  {isDefaultRef && (
                    <span className="text-right text-warning">
                      {translateWebSource(locale, "Default branch")}
                    </span>
                  )}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isEditingFiles && allFiles.length > 0 && (
                      <Checkbox
                        checked={allSelected}
                        indeterminate={!allSelected && !noneSelected}
                        onCheckedChange={() => {
                          setExcludedFiles(
                            allSelected ? new Set(allFiles.map((f) => f.path)) : new Set(),
                          );
                        }}
                      />
                    )}
                    <span className="text-muted-foreground">
                      {translateWebSource(locale, "Files")}
                    </span>
                    {!allSelected && !isEditingFiles && (
                      <span className="text-muted-foreground">
                        {t("gitActions.selectedFiles", {
                          selected: selectedFiles.length,
                          total: allFiles.length,
                        })}
                      </span>
                    )}
                  </div>
                  {allFiles.length > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setIsEditingFiles((prev) => !prev)}
                    >
                      {isEditingFiles
                        ? translateWebSource(locale, "Done")
                        : translateWebSource(locale, "Edit")}
                    </Button>
                  )}
                </div>
                {!gitStatusForActions || allFiles.length === 0 ? (
                  <p className="font-medium">{translateWebSource(locale, "none")}</p>
                ) : (
                  <div className="space-y-2">
                    <div className="h-44 rounded-lg bg-card ring-1 ring-black/5 dark:bg-white/[0.025] dark:ring-white/5">
                      <ScrollArea>
                        <div className="space-y-1 p-1">
                          {allFiles.map((file) => {
                            const isExcluded = excludedFiles.has(file.path);
                            return (
                              <div
                                key={file.path}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1 font-mono hover:bg-accent/50"
                              >
                                {isEditingFiles && (
                                  <Checkbox
                                    checked={!excludedFiles.has(file.path)}
                                    onCheckedChange={() => {
                                      setExcludedFiles((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(file.path)) {
                                          next.delete(file.path);
                                        } else {
                                          next.add(file.path);
                                        }
                                        return next;
                                      });
                                    }}
                                  />
                                )}
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left enabled:cursor-pointer"
                                  disabled={!canOperateThread || workingTreeRoot === null}
                                  aria-label={t("gitActions.openFileInEditor", { path: file.path })}
                                  onClick={() => openChangedFileInEditor(file.path)}
                                >
                                  <StartTruncatedPath
                                    path={file.path}
                                    className={`flex-1${isExcluded ? " text-muted-foreground" : ""}`}
                                  />
                                  <span className="shrink-0">
                                    {isExcluded ? (
                                      <span className="text-muted-foreground">
                                        {translateWebSource(locale, "Excluded")}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-diff-addition">
                                          +{formatDiffCount(file.insertions)}
                                        </span>
                                        <span className="text-muted-foreground"> / </span>
                                        <span className="text-diff-deletion">
                                          -{formatDiffCount(file.deletions)}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                    <div className="flex justify-end font-mono">
                      <span className="text-diff-addition">
                        +{formatDiffCount(selectedFiles.reduce((sum, f) => sum + f.insertions, 0))}
                      </span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-diff-deletion">
                        -{formatDiffCount(selectedFiles.reduce((sum, f) => sum + f.deletions, 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {translateWebSource(locale, "Commit message (optional)")}
              </p>
              <Textarea
                value={dialogCommitMessage}
                onChange={(event) => setDialogCommitMessage(event.target.value)}
                placeholder={translateWebSource(locale, "Leave empty to auto-generate")}
                size="sm"
              />
            </div>
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCommitDialogOpen(false);
                setDialogCommitMessage("");
                setExcludedFiles(new Set());
                setIsEditingFiles(false);
              }}
            >
              {translateWebSource(locale, "Cancel")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canChangeThreadBranch || noneSelected}
              onClick={runDialogActionOnNewBranch}
            >
              {translateWebSource(locale, "Commit on new branch")}
            </Button>
            <Button
              size="sm"
              disabled={!canWriteSourceControl || noneSelected}
              onClick={runDialogAction}
            >
              {translateWebSource(locale, "Commit")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Its discovery query should stop when the Git actions row that opens it is hidden. */}
      {showActions ? (
        <PublishRepositoryDialog
          open={isPublishDialogOpen}
          onOpenChange={setIsPublishDialogOpen}
          environmentId={activeEnvironmentId}
          threadRef={activeThreadRef}
          gitCwd={gitCwd}
        />
      ) : null}

      <Dialog
        open={pendingDefaultBranchAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDefaultBranchAction(null);
        }}
      >
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {pendingDefaultBranchActionCopy?.title ??
                translateWebSource(locale, "Run action on default branch?")}
            </DialogTitle>
            <DialogDescription>{pendingDefaultBranchActionCopy?.description}</DialogDescription>
            {featureBranchUnavailableReason && (
              <p className="text-xs text-muted-foreground">{featureBranchUnavailableReason}</p>
            )}
          </DialogHeader>
          <DialogFooter variant="bare" className="sm:flex-wrap sm:items-center">
            <Button
              className="w-full sm:mr-auto sm:w-auto"
              variant="outline"
              size="sm"
              onClick={() => setPendingDefaultBranchAction(null)}
            >
              {translateWebSource(locale, "Abort")}
            </Button>
            <Button
              className="w-full max-w-full sm:w-auto"
              variant="outline"
              size="sm-multiline"
              onClick={() => continuePendingDefaultBranchAction(false)}
              disabled={!canWriteSourceControl}
            >
              {pendingDefaultBranchActionCopy?.continueLabel ??
                translateWebSource(locale, "Continue")}
            </Button>
            <Button
              className="w-full max-w-full sm:w-auto"
              size="sm-multiline"
              onClick={() => continuePendingDefaultBranchAction(true)}
              disabled={!canChangeThreadBranch || featureBranchUnavailableReason !== null}
            >
              {translateWebSource(locale, "Check out feature branch & continue")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

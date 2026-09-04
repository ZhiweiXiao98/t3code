import { ChevronDownIcon, GitPullRequestIcon, RefreshCwIcon } from "lucide-react";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import { useEffect, useState, type ReactNode } from "react";
import type {
  BackgroundActivitySettings,
  SourceControlProviderKind,
  SourceControlDiscoveryResult,
  SourceControlProviderAuth,
  SourceControlProviderDiscoveryItem,
  VcsDriverKind,
  VcsDiscoveryItem,
} from "@t3tools/contracts";
import {
  getBackgroundActivityBaseProfile,
  getBackgroundActivityPresetSettings,
  resolveServerBackgroundActivitySettings,
} from "@t3tools/shared/backgroundActivitySettings";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { splitWebTranslation, useI18n } from "../../i18n/WebI18nProvider";
import { SharedSettingsMismatchAlert } from "./SharedSettingsMismatchAlert";
import { cn } from "../../lib/utils";
import { useEnvironments, usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { sourceControlEnvironment } from "../../state/sourceControl";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Skeleton } from "../ui/skeleton";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

import {
  AzureDevOpsIcon,
  BitbucketIcon,
  GitHubIcon,
  GitIcon,
  GitLabIcon,
  JujutsuIcon,
  type Icon,
} from "../Icons";
import { RedactedSensitiveText } from "./RedactedSensitiveText";
import { SourceControlWritingSettingsSection } from "./SourceControlWritingSettings";
import {
  PolicyTooltip,
  SettingResetButton,
  SettingsPageContainer,
  SettingsSearchTarget,
  SettingsSection,
  useSettingsSearchTargetId,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const EMPTY_DISCOVERY_RESULT: SourceControlDiscoveryResult = {
  versionControlSystems: [],
  sourceControlProviders: [],
};

const SOURCE_CONTROL_PROVIDER_ICONS: Partial<Record<SourceControlProviderKind, Icon>> = {
  github: GitHubIcon,
  gitlab: GitLabIcon,
  "azure-devops": AzureDevOpsIcon,
  bitbucket: BitbucketIcon,
};

const VCS_ICONS: Partial<Record<VcsDriverKind, Icon>> = {
  git: GitIcon,
  jj: JujutsuIcon,
};

const SOURCE_CONTROL_SKELETON_ROWS = ["primary", "secondary"] as const;
const GIT_FETCH_INTERVAL_STEP_SECONDS = 5;
type BackgroundActivityOverridePatch = Partial<{
  [K in keyof BackgroundActivitySettings["overrides"]]:
    | BackgroundActivitySettings["overrides"][K]
    | undefined;
}>;

function durationToSeconds(duration: Duration.Duration): number {
  return Math.round(Duration.toMillis(duration) / 1_000);
}

function normalizeFetchIntervalSeconds(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function backgroundActivityOverrideSettings(
  current: BackgroundActivitySettings,
  overrides: BackgroundActivityOverridePatch,
) {
  const nextOverrides: BackgroundActivityOverridePatch = {
    ...current.overrides,
    ...overrides,
  };
  for (const [key, value] of Object.entries(nextOverrides)) {
    if (value === undefined) {
      delete nextOverrides[key as keyof typeof nextOverrides];
    }
  }
  return {
    backgroundActivity: {
      schemaVersion: 1 as const,
      profile: "custom" as const,
      baseProfile: getBackgroundActivityBaseProfile(current),
      overrides: nextOverrides as BackgroundActivitySettings["overrides"],
    },
  };
}

function optionLabel(value: Option.Option<string>): string | null {
  return Option.getOrNull(value);
}

function isProviderDiscoveryItem(
  item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem,
): item is SourceControlProviderDiscoveryItem {
  return "auth" in item;
}

function isVcsNotReady(item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem): boolean {
  return !isProviderDiscoveryItem(item) && !item.implemented;
}

function localizeInstallHint(hint: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (hint.startsWith("Install Git from")) {
    return t("sourceControl.hint.git");
  }
  if (hint.startsWith("Install Jujutsu with")) {
    return t("sourceControl.hint.jujutsu");
  }
  if (hint.startsWith("Install the GitHub command-line tool")) {
    return t("sourceControl.hint.github");
  }
  if (hint.startsWith("Install the GitLab command-line tool")) {
    return t("sourceControl.hint.gitlab");
  }
  if (hint.startsWith("Install the Azure command-line tools")) {
    return t("sourceControl.hint.azure");
  }
  if (hint.startsWith("Set T3CODE_BITBUCKET_EMAIL")) {
    return t("sourceControl.hint.bitbucket");
  }
  return hint;
}

function authPresentation(
  auth: SourceControlProviderAuth,
  t: ReturnType<typeof useI18n>["t"],
): {
  readonly label: string;
  readonly badge: "warning" | null;
} {
  if (auth.status === "authenticated") {
    return { label: t("sourceControl.status.authenticated"), badge: null };
  }
  if (auth.status === "unauthenticated") {
    return { label: t("sourceControl.status.notAuthenticated"), badge: "warning" };
  }
  return { label: t("sourceControl.status.unknown"), badge: null };
}

function RedactedAccount(props: { readonly account: string | null }) {
  const { t } = useI18n();
  return (
    <RedactedSensitiveText
      value={props.account}
      ariaLabel={t("sourceControl.action.accountVisibility")}
      revealTooltip={t("sourceControl.action.revealAccount")}
      hideTooltip={t("sourceControl.action.hideAccount")}
    />
  );
}

function itemStatusDot(item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem): string {
  if (isVcsNotReady(item)) return "bg-muted-foreground/35";
  if (item.status !== "available") return "bg-warning";
  if (isProviderDiscoveryItem(item) && item.auth.status !== "authenticated") return "bg-warning";
  return "bg-success";
}

function SourceControlItemMark({
  item,
}: {
  readonly item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem;
}) {
  const dotClassName = itemStatusDot(item);
  const Icon = isProviderDiscoveryItem(item)
    ? SOURCE_CONTROL_PROVIDER_ICONS[item.kind]
    : VCS_ICONS[item.kind];

  if (!Icon) {
    return <span className={cn("size-2 shrink-0 rounded-full", dotClassName)} aria-hidden />;
  }

  return (
    <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
      <Icon className="size-4.5 text-foreground/80" aria-hidden />
      <span
        className={cn(
          "pointer-events-none absolute -left-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background",
          dotClassName,
        )}
        aria-hidden
      />
    </span>
  );
}

function itemSummary({
  item,
  auth,
  authAccount,
  t,
}: {
  readonly item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem;
  readonly auth: SourceControlProviderAuth | null;
  readonly authAccount: string | null;
  readonly t: ReturnType<typeof useI18n>["t"];
}) {
  if (isVcsNotReady(item)) {
    return <span>{t("sourceControl.summary.comingSoon", { provider: item.label })}</span>;
  }

  if (item.status !== "available") {
    return (
      <span>
        {t("sourceControl.summary.unavailable", {
          hint: localizeInstallHint(item.installHint, t),
        })}
      </span>
    );
  }

  if (auth) {
    if (auth.status === "authenticated") {
      return (
        <>
          {authAccount ? (
            <>
              <span>{t("sourceControl.status.authenticatedAs")}</span>
              <RedactedAccount account={authAccount} />
            </>
          ) : (
            <span>{t("sourceControl.status.authenticated")}</span>
          )}
        </>
      );
    }

    if (!item.executable) {
      return (
        <span>
          {t("sourceControl.summary.availableHint", {
            hint: localizeInstallHint(item.installHint, t),
          })}
        </span>
      );
    }

    if (auth.status === "unauthenticated") {
      const [beforeCommand, afterCommand] = splitWebTranslation(
        t,
        "sourceControl.summary.notAuthenticated",
        "command",
        { provider: item.label },
      );
      return (
        <span>
          {beforeCommand}
          <code className="rounded bg-muted px-1 py-px text-[11px]">{item.executable}</code>
          {afterCommand}
        </span>
      );
    }
    const authDetail = optionLabel(auth.detail);
    return (
      <span>
        {t("sourceControl.summary.verifyFailed", {
          provider: item.label,
          hint: authDetail ?? localizeInstallHint(item.installHint, t),
        })}
      </span>
    );
  }

  return <span>{t("sourceControl.status.available")}</span>;
}

function DiscoveryItemRow({
  item,
  children,
}: {
  readonly item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem;
  readonly children?: ReactNode;
}) {
  const { t } = useI18n();
  const version = optionLabel(item.version);
  const enabled = isProviderDiscoveryItem(item)
    ? item.status === "available" && item.auth.status === "authenticated"
    : item.status === "available" && item.implemented;
  const auth = isProviderDiscoveryItem(item) ? item.auth : null;
  const authStatus = auth ? authPresentation(auth, t) : null;
  const authAccount = auth ? optionLabel(auth.account) : null;
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = children !== undefined;
  const searchTargetId = useSettingsSearchTargetId();

  useEffect(() => {
    if (item.kind === "git" && searchTargetId === searchableSetting("git-fetch-interval").id) {
      setIsExpanded(true);
    }
  }, [item.kind, searchTargetId]);

  return (
    <div
      className={cn(
        "rounded-xl transition-colors hover:bg-muted/20",
        isVcsNotReady(item) && "opacity-80",
      )}
    >
      <div className="px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SourceControlItemMark item={item} />
              <span className="truncate text-sm font-medium tracking-[-0.005em] text-foreground">
                {item.label}
              </span>
              {version ? <code className="text-xs text-muted-foreground">{version}</code> : null}
              {isVcsNotReady(item) ? (
                <Badge variant="warning" size="sm">
                  {t("sourceControl.status.comingSoon")}
                </Badge>
              ) : null}
              {authStatus?.badge ? (
                <Badge variant={authStatus.badge} size="sm">
                  {authStatus.label}
                </Badge>
              ) : null}
            </div>
            <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-[13px] leading-[1.45] text-muted-foreground/80">
              {itemSummary({ item, auth, authAccount, t })}
            </p>
          </div>
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {hasDetails ? (
              <Button
                size="icon-xs"
                variant="ghost-muted"
                onClick={() => setIsExpanded((open) => !open)}
                aria-expanded={isExpanded}
                aria-label={t("sourceControl.action.toggleDetails", { provider: item.label })}
              >
                <ChevronDownIcon
                  className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")}
                />
              </Button>
            ) : null}
            {!isVcsNotReady(item) ? (
              <Switch
                checked={enabled}
                disabled
                aria-label={t("sourceControl.action.availability", { provider: item.label })}
              />
            ) : null}
          </div>
        </div>
      </div>

      {hasDetails ? (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent>
            <div className="px-3 pb-4 pt-1 sm:px-4">{children}</div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function GitFetchIntervalSettings() {
  const { t } = useI18n();
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const automaticGitFetchIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.automaticGitFetchInterval,
  );
  const defaultAutomaticGitFetchIntervalSeconds = durationToSeconds(
    getBackgroundActivityPresetSettings(
      getBackgroundActivityBaseProfile(settings.backgroundActivity),
    ).automaticGitFetchInterval,
  );
  const canResetFetchInterval =
    automaticGitFetchIntervalSeconds !== defaultAutomaticGitFetchIntervalSeconds;
  const setting = searchableSetting("git-fetch-interval");

  return (
    <SettingsSearchTarget id={setting.id} className="grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="text-xs font-medium text-foreground">
              {t("sourceControl.fetch.title")}
            </span>
            <PolicyTooltip>{t("sourceControl.fetch.policyTooltip")}</PolicyTooltip>
            <span
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center transition-opacity",
                canResetFetchInterval ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              aria-hidden={!canResetFetchInterval}
            >
              {canResetFetchInterval ? (
                <SettingResetButton
                  label="fetch interval"
                  onClick={() =>
                    updateSettings(
                      backgroundActivityOverrideSettings(settings.backgroundActivity, {
                        automaticGitFetchInterval: undefined,
                      }),
                    )
                  }
                />
              ) : null}
            </span>
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {t("sourceControl.fetch.description")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NumberField
            value={automaticGitFetchIntervalSeconds}
            min={0}
            step={GIT_FETCH_INTERVAL_STEP_SECONDS}
            size="sm"
            className="w-32"
            onValueChange={(value) =>
              updateSettings(
                backgroundActivityOverrideSettings(settings.backgroundActivity, {
                  automaticGitFetchInterval: Duration.seconds(normalizeFetchIntervalSeconds(value)),
                }),
              )
            }
          >
            <NumberFieldGroup>
              <NumberFieldDecrement aria-label={t("sourceControl.fetch.decrease")} />
              <NumberFieldInput aria-label={t("sourceControl.fetch.inSeconds")} />
              <NumberFieldIncrement aria-label={t("sourceControl.fetch.increase")} />
            </NumberFieldGroup>
          </NumberField>
          <span className="text-xs text-muted-foreground">{t("sourceControl.fetch.seconds")}</span>
        </div>
      </div>
    </SettingsSearchTarget>
  );
}

function SourceControlSectionSkeleton({
  title,
  headerAction,
}: {
  readonly title: string;
  readonly headerAction?: ReactNode;
}) {
  return (
    <SettingsSection title={title} headerAction={headerAction}>
      {SOURCE_CONTROL_SKELETON_ROWS.map((row) => (
        <div key={row} className="rounded-xl px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                  <Skeleton className="size-4.5 rounded-md" />
                  <Skeleton
                    className="pointer-events-none absolute -left-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background"
                    aria-hidden
                  />
                </span>
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full max-w-xs rounded-full" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </SettingsSection>
  );
}

function EmptySourceControlDiscovery({
  error,
  isPending,
  onScan,
}: {
  readonly error: string | null;
  readonly isPending: boolean;
  readonly onScan: () => void;
}) {
  const { t } = useI18n();
  const hasError = error !== null;

  return (
    <SettingsSection
      id={searchableSetting("source-control").id}
      title={t("sourceControl.empty.section")}
    >
      <Empty className="min-h-88">
        <EmptyMedia variant="icon">
          <GitPullRequestIcon />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {hasError ? t("sourceControl.empty.scanFailed") : t("sourceControl.empty.title")}
          </EmptyTitle>
          <EmptyDescription>
            {hasError ? error : t("sourceControl.empty.description")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={onScan} disabled={isPending}>
            <RefreshCwIcon className={cn("size-3.5", isPending && "animate-spin")} />
            {t("sourceControl.empty.scan")}
          </Button>
        </EmptyContent>
      </Empty>
    </SettingsSection>
  );
}

export function SourceControlSettingsPanel() {
  const { t } = useI18n();
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const fallbackEnvironment =
    environments.find((environment) => environment.connection.phase === "connected") ??
    environments[0] ??
    null;
  const environmentId =
    primaryEnvironment?.environmentId ?? fallbackEnvironment?.environmentId ?? null;
  const isPrimaryEnvironment = environmentId === primaryEnvironment?.environmentId;
  const discovery = useEnvironmentQuery(
    environmentId === null
      ? null
      : sourceControlEnvironment.discovery({
          environmentId,
          input: {},
        }),
  );
  const result = discovery.data ?? EMPTY_DISCOVERY_RESULT;
  const hasVersionControlSystems = result.versionControlSystems.length > 0;
  const hasDiscoveryItems = hasVersionControlSystems || result.sourceControlProviders.length > 0;
  const isInitialScanPending = discovery.isPending && discovery.data === null;
  const handleScan = () => {
    discovery.refresh();
  };
  const scanButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            onClick={handleScan}
            disabled={discovery.isPending}
            aria-label={t("sourceControl.action.rescan")}
          >
            <RefreshCwIcon className={cn(discovery.isPending && "animate-spin")} />
          </Button>
        }
      />
      <TooltipPopup side="top">{t("sourceControl.action.rescanTooltip")}</TooltipPopup>
    </Tooltip>
  );

  return (
    <SettingsPageContainer>
      <SharedSettingsMismatchAlert />
      {isInitialScanPending ? (
        <>
          <SourceControlSectionSkeleton
            title={t("sourceControl.versionControl")}
            headerAction={scanButton}
          />
          <SourceControlSectionSkeleton title={t("sourceControl.providers")} />
        </>
      ) : hasDiscoveryItems ? (
        <>
          {hasVersionControlSystems ? (
            <SettingsSection
              id={searchableSetting("source-control").id}
              title={t("sourceControl.versionControl")}
              headerAction={scanButton}
            >
              {result.versionControlSystems.map((item) => (
                <DiscoveryItemRow key={`vcs:${item.kind}`} item={item}>
                  {item.kind === "git" && isPrimaryEnvironment ? (
                    <GitFetchIntervalSettings />
                  ) : undefined}
                </DiscoveryItemRow>
              ))}
            </SettingsSection>
          ) : null}

          {result.sourceControlProviders.length > 0 ? (
            <SettingsSection
              id={hasVersionControlSystems ? undefined : searchableSetting("source-control").id}
              title={t("sourceControl.providers")}
              headerAction={hasVersionControlSystems ? null : scanButton}
            >
              {result.sourceControlProviders.map((item) => (
                <DiscoveryItemRow key={`provider:${item.kind}`} item={item} />
              ))}
            </SettingsSection>
          ) : null}
        </>
      ) : (
        <EmptySourceControlDiscovery
          error={discovery.error}
          isPending={discovery.isPending}
          onScan={handleScan}
        />
      )}

      {/* Its rows are serverScoped: without a primary they render inert with
          an explanation, which beats disappearing. */}
      <SourceControlWritingSettingsSection />
    </SettingsPageContainer>
  );
}

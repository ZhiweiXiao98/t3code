import { RefreshIcon } from "~/components/ui/refresh-icon";
import { useAtomValue } from "@effect/atom-react";
import {
  USAGE_CONTRACT_VERSION,
  type EnvironmentId,
  type UsageProviderKind,
} from "@t3tools/contracts";
import {
  CircleAlertIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  isCompatibleUsageContractVersion,
  type DailyTotals,
  type HourlyTotals,
} from "@t3tools/shared/usageMerge";

import { isElectron } from "../../env";
import { useI18n } from "../../i18n/WebI18nProvider";
import { translateWebSource } from "../../i18n/messages";
import { cn } from "../../lib/utils";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { useUsage, type EnvironmentUsageStatus } from "../../state/usage";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  enumerateDays,
  enumerateHourStarts,
  formatCount,
  formatDateTimeShort,
  formatDayShort,
  formatHourShort,
  formatPercent,
  formatTokens,
  formatUsd,
  makeWindow,
} from "@t3tools/shared/usageFormat";
import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { UsageLimitsSection } from "./UsageLimits";
import { UsagePriceOverrides } from "./UsagePriceOverrides";
import { UsageProviderChart, type UsageChartMetric } from "./UsageProviderChart";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION, providersWithUsage } from "./usageProviders";
import {
  readUsagePagePreferences,
  saveUsagePagePreferences,
  type UsagePagePreferences,
} from "./usagePagePreferences";

type UsageMetric = UsageChartMetric | "limits";
const METRIC_OPTIONS = [
  { value: "cost" },
  { value: "tokens" },
  { value: "limits" },
] as const satisfies readonly { value: UsageMetric }[];

function isUsageMetric(value: string | null | undefined): value is UsageMetric {
  return METRIC_OPTIONS.some((option) => option.value === value);
}

const WINDOW_OPTIONS = [{ days: 1 }, { days: 7 }, { days: 30 }, { days: 90 }] as const;

function isUsageWindowDays(value: number): value is UsagePagePreferences["windowDays"] {
  return WINDOW_OPTIONS.some((option) => option.days === value);
}

export function UsagePage() {
  const { locale, t } = useI18n();
  const [preferences, setPreferences] = useState(readUsagePagePreferences);
  const [windowSelection, setWindowSelection] = useState(() => ({
    days: preferences.windowDays,
    window: makeWindow(
      preferences.windowDays,
      undefined,
      preferences.windowDays === 1 ? "hour" : "day",
    ),
  }));
  const metric = preferences.metric;
  const showingLimits = metric === "limits";
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [breakdown, setBreakdown] = useState<"model" | "time">("model");
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] =
    useState<ReadonlySet<EnvironmentId> | null>(null);
  const { days: windowDays, window } = windowSelection;
  const isPast24Hours = windowDays === 1;
  const { merged, environments, selectedEnvironments, isPending, isPartial, refresh } = useUsage(
    window,
    selectedEnvironmentIds,
  );
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });

  const days = useMemo(
    () => enumerateDays(window.sinceDay, window.untilDay),
    [window.sinceDay, window.untilDay],
  );
  const hours = useMemo(
    () =>
      window.sinceTime === undefined || window.untilTime === undefined
        ? []
        : enumerateHourStarts(window.sinceTime, window.untilTime),
    [window.sinceTime, window.untilTime],
  );
  // Newest first: the window can run 90 periods, so the interesting end
  // belongs at the top of the table.
  const breakdownPeriods = useMemo<readonly (DailyTotals | HourlyTotals)[]>(
    () => (isPast24Hours ? merged.hourly : merged.daily).toReversed(),
    [isPast24Hours, merged.daily, merged.hourly],
  );
  const breakdownModels = useMemo(
    () =>
      breakdown === "model" && metric === "tokens"
        ? merged.models.toSorted(
            (left, right) => right.totalTokens - left.totalTokens || right.costUsd - left.costUsd,
          )
        : merged.models,
    [breakdown, merged.models, metric],
  );
  const activeProviders = useMemo(() => providersWithUsage(merged.providers), [merged.providers]);
  const timeValueColumnWidth = `${60 / (activeProviders.length + 2)}%`;

  const selectWindow = (days: number) => {
    if (!isUsageWindowDays(days)) return;
    const nextPreferences = { metric, windowDays: days };
    setPreferences(nextPreferences);
    saveUsagePagePreferences(nextPreferences);
    setWindowSelection({
      days,
      window: makeWindow(days, undefined, days === 1 ? "hour" : "day"),
    });
  };
  const selectMetric = (nextMetric: UsageMetric) => {
    const nextPreferences = { metric: nextMetric, windowDays };
    setPreferences(nextPreferences);
    saveUsagePagePreferences(nextPreferences);
  };
  const refreshWindow = () => {
    if (refreshingRef.current) return;

    if (showingLimits) {
      refreshingRef.current = true;
      setIsRefreshing(true);
      void Promise.all(
        Array.from(presentations, ([environmentId, presentation]) => {
          if (selectedEnvironmentIds !== null && !selectedEnvironmentIds.has(environmentId)) return;
          if (presentation.connection.phase === "connected" && presentation.serverConfig !== null) {
            return refreshProviders({ environmentId, input: {} });
          }
        }),
      ).finally(() => {
        refreshingRef.current = false;
        setIsRefreshing(false);
      });
      return;
    }
    const nextWindow = makeWindow(windowDays, undefined, isPast24Hours ? "hour" : "day");
    if (
      nextWindow.sinceDay !== window.sinceDay ||
      nextWindow.untilDay !== window.untilDay ||
      nextWindow.sinceTime !== window.sinceTime ||
      nextWindow.untilTime !== window.untilTime
    ) {
      setWindowSelection({ days: windowDays, window: nextWindow });
    }
    refreshingRef.current = true;
    setIsRefreshing(true);
    void refresh(nextWindow).finally(() => {
      refreshingRef.current = false;
      setIsRefreshing(false);
    });
  };
  const windowLabel =
    isPast24Hours && window.sinceTime !== undefined && window.untilTime !== undefined
      ? `${formatDateTimeShort(window.sinceTime, window.timeZone, locale)} ${t("usage.range.separator")} ${formatDateTimeShort(window.untilTime, window.timeZone, locale)}`
      : `${formatDayShort(window.sinceDay, locale)} ${t("usage.range.separator")} ${formatDayShort(window.untilDay, locale)}`;
  const topbarContent = (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-2 xl:flex">
      <WorkspaceBreadcrumb ariaLabel={t("usage.breadcrumb")} className="col-span-2 min-w-0">
        <WorkspaceBreadcrumbItem>
          <h1>{t("usage.title")}</h1>
        </WorkspaceBreadcrumbItem>
        <WorkspaceBreadcrumbSeparator />
        <WorkspaceBreadcrumbItem current className="min-w-10">
          <UsageEnvironmentFilter
            environments={environments}
            selectedEnvironments={selectedEnvironments}
            selectedEnvironmentIds={selectedEnvironmentIds}
            onSelectionChange={setSelectedEnvironmentIds}
            showUsageStatus={!showingLimits}
            isPartial={isPartial}
            duplicateSources={merged.duplicateSources}
            staleEnvironments={merged.staleEnvironments}
          />
        </WorkspaceBreadcrumbItem>
      </WorkspaceBreadcrumb>
      {!showingLimits ? (
        <span className="hidden min-w-0 truncate text-xs text-muted-foreground 2xl:block">
          {windowLabel}
        </span>
      ) : null}
      <div className="ms-auto hidden min-w-0 items-center justify-end gap-2 xl:flex">
        <ToggleGroup
          aria-label={t("usage.metric.label")}
          variant="segmented"
          value={[metric]}
          onValueChange={(next) => {
            const value = next[0];
            if (isUsageMetric(value)) selectMetric(value);
          }}
        >
          {METRIC_OPTIONS.map((option) => (
            <Toggle key={option.value} value={option.value}>
              {t(`usage.metric.${option.value}`)}
            </Toggle>
          ))}
        </ToggleGroup>
        {/* The period does not apply to Limits, so it stays in place but
            disabled; unmounting it shifted the metric toggle ~300px. */}
        <ToggleGroup
          aria-label={t("usage.period.label")}
          variant="segmented"
          value={[String(windowDays)]}
          disabled={showingLimits}
          onValueChange={(next) => {
            const value = next[0];
            if (value) selectWindow(Number(value));
          }}
        >
          {WINDOW_OPTIONS.map((option) => (
            <Toggle key={option.days} value={String(option.days)}>
              {option.days === 1
                ? t("usage.window.past24h")
                : t("usage.window.days", { count: option.days })}
            </Toggle>
          ))}
        </ToggleGroup>
        <Button
          onClick={refreshWindow}
          aria-label={t(showingLimits ? "usage.limits.refresh" : "usage.refresh")}
          aria-busy={isRefreshing}
          disabled={isRefreshing}
          size="icon-sm"
          variant="ghost"
        >
          <RefreshIcon className="size-3.5" refreshing={isRefreshing} />
        </Button>
      </div>
      <div className="col-span-2 ms-auto flex min-w-0 items-center justify-end gap-1 xl:hidden">
        <Select
          value={metric}
          onValueChange={(value) => {
            if (isUsageMetric(value)) selectMetric(value);
          }}
        >
          <SelectTrigger
            aria-label={t("usage.metric.label")}
            size="compact"
            variant="ghost"
            className="w-auto min-w-0"
          >
            <SelectValue>{t(`usage.metric.${metric}`)}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {METRIC_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(`usage.metric.${option.value}`)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Select
          value={String(windowDays)}
          disabled={showingLimits}
          onValueChange={(value) => selectWindow(Number(value))}
        >
          <SelectTrigger
            aria-label={t("usage.period.label")}
            size="compact"
            variant="ghost"
            className="w-auto min-w-0"
          >
            <SelectValue>
              {windowDays === 1
                ? t("usage.window.past24h")
                : t("usage.window.days", { count: windowDays })}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {WINDOW_OPTIONS.map((option) => (
              <SelectItem key={option.days} value={String(option.days)}>
                {option.days === 1
                  ? t("usage.window.past24h")
                  : t("usage.window.days", { count: option.days })}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Button
          onClick={refreshWindow}
          aria-label={t(showingLimits ? "usage.limits.refresh" : "usage.refresh")}
          aria-busy={isRefreshing}
          disabled={isRefreshing}
          size="icon-sm"
          variant="ghost"
        >
          <RefreshIcon className="size-3.5" refreshing={isRefreshing} />
        </Button>
      </div>
    </div>
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron} className="h-auto">
          {topbarContent}
        </WorkspacePageHeader>

        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer width="wide">
            {selectedEnvironments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {environments.length === 0
                  ? `Connect an environment to see ${showingLimits ? "limits" : "usage"}.`
                  : `Select an environment to see ${showingLimits ? "limits" : "usage"}.`}
              </p>
            ) : showingLimits ? (
              <UsageLimitsSection selectedEnvironmentIds={selectedEnvironmentIds} />
            ) : isPending ? (
              <UsageSkeleton />
            ) : (
              <>
                <section className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                  <div className="flex min-w-0 flex-col gap-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-4xl font-semibold text-foreground tabular-nums">
                        {metric === "cost"
                          ? formatUsd(merged.costUsd)
                          : formatTokens(merged.totalTokens)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {metric === "cost"
                          ? t(
                              merged.sessions === 1
                                ? "usage.sessionEstimate"
                                : "usage.sessionsEstimate",
                              {
                                count: formatCount(merged.sessions),
                              },
                            )
                          : t(merged.sessions === 1 ? "usage.session" : "usage.sessions", {
                              count: formatCount(merged.sessions),
                            })}
                      </span>
                    </div>

                    {activeProviders.map((provider) => {
                      const totals = merged.providers.find((entry) => entry.provider === provider);
                      const share =
                        metric === "cost" ? (totals?.costShare ?? 0) : (totals?.tokenShare ?? 0);
                      const providerSessions = totals?.sessions ?? 0;
                      const sessionLabel = t(
                        providerSessions === 1 ? "usage.session" : "usage.sessions",
                        {
                          count: formatCount(providerSessions),
                        },
                      );
                      return (
                        <div key={provider} className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                              <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: PROVIDER_PRESENTATION[provider].color,
                                }}
                              />
                              <ProviderMark provider={provider} className="size-4" />
                              <span className="flex min-w-0 items-baseline gap-1.5">
                                <span className="truncate">
                                  {PROVIDER_PRESENTATION[provider].label}
                                </span>
                                <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
                                  {sessionLabel}
                                </span>
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
                              {metric === "cost"
                                ? formatUsd(totals?.costUsd ?? 0)
                                : formatTokens(totals?.totalTokens ?? 0)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {metric === "cost"
                              ? t("usage.provider.costShare", {
                                  share: formatPercent(share),
                                  tokens: formatTokens(totals?.totalTokens ?? 0),
                                })
                              : t("usage.provider.tokenShare", {
                                  share: formatPercent(share),
                                  cost: formatUsd(totals?.costUsd ?? 0),
                                })}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex min-w-0 flex-col gap-3">
                    <h2 className="text-sm font-medium text-foreground">
                      {t(
                        isPast24Hours
                          ? metric === "tokens"
                            ? "usage.hourlyTokens"
                            : "usage.hourlyCost"
                          : metric === "tokens"
                            ? "usage.dailyTokens"
                            : "usage.dailyCost",
                      )}
                    </h2>
                    <UsageProviderChart
                      providers={activeProviders}
                      days={days}
                      daily={merged.daily}
                      hours={hours}
                      hourly={merged.hourly}
                      metric={metric}
                      referenceTime={window.untilTime}
                      resolution={isPast24Hours ? "hour" : "day"}
                      timeZone={window.timeZone}
                    />
                  </div>
                </section>

                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium text-foreground">{t("usage.totals")}</h2>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 py-1 md:grid-cols-5">
                    <Metric
                      label={t("usage.processedTokens")}
                      value={formatTokens(merged.totalTokens)}
                    />
                    <Metric
                      label={t("usage.metric.cachedInput")}
                      value={formatTokens(merged.cachedInputTokens)}
                    />
                    <Metric
                      label={t("usage.metric.uncachedInput")}
                      value={formatTokens(merged.uncachedInputTokens)}
                    />
                    <Metric
                      label={t("usage.metric.output")}
                      value={formatTokens(merged.outputTokens)}
                    />
                    <Metric
                      label={t("usage.metric.cacheSavings")}
                      value={formatUsd(merged.costQuality.cacheSavingsUsd)}
                    />
                  </div>
                </section>

                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-foreground">{t("usage.breakdown")}</h2>
                    <ToggleGroup
                      aria-label={t("usage.breakdown.label")}
                      variant="segmented"
                      value={[breakdown]}
                      onValueChange={(next) => {
                        const value = next[0];
                        if (value === "model" || value === "time") setBreakdown(value);
                      }}
                    >
                      {(
                        [
                          { value: "model", label: t("usage.breakdown.model") },
                          {
                            value: "time",
                            label: t(isPast24Hours ? "usage.period.hour" : "usage.period.day"),
                          },
                        ] as const
                      ).map((option) => (
                        <Toggle key={option.value} value={option.value}>
                          {option.label}
                        </Toggle>
                      ))}
                    </ToggleGroup>
                  </div>

                  {breakdown === "model" ? (
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col className="w-2/5" />
                        <col className="w-1/5" />
                        <col className="w-1/5" />
                        <col className="w-1/5" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="py-2 font-normal">{t("usage.breakdown.model")}</th>
                          <th className="py-2 text-right font-normal">
                            {t("usage.breakdown.cost")}
                          </th>
                          <th className="py-2 text-right font-normal">
                            {t("usage.breakdown.share")}
                          </th>
                          <th className="py-2 text-right font-normal">
                            {t("usage.breakdown.tokens")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdownModels.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-muted-foreground">
                              {t("usage.noActivity")}
                            </td>
                          </tr>
                        ) : (
                          breakdownModels.map((model) => (
                            <tr
                              key={`${model.provider}:${model.model}`}
                              className="border-b border-border/50 transition-colors hover:bg-muted/50"
                            >
                              <td className="py-2 text-foreground">
                                <span className="flex items-center gap-2">
                                  <ProviderMark provider={model.provider} className="size-3.5" />
                                  {model.model}
                                </span>
                              </td>
                              <td className="py-2 text-right text-foreground tabular-nums">
                                {formatUsd(model.costUsd)}
                              </td>
                              <td className="py-2 text-right text-muted-foreground tabular-nums">
                                {formatPercent(model.costShare)}
                              </td>
                              <td className="py-2 text-right text-muted-foreground tabular-nums">
                                {formatTokens(model.totalTokens)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full table-fixed text-sm">
                      <colgroup>
                        <col className="w-2/5" />
                        {activeProviders.map((provider) => (
                          <col key={provider} style={{ width: timeValueColumnWidth }} />
                        ))}
                        <col style={{ width: timeValueColumnWidth }} />
                        <col style={{ width: timeValueColumnWidth }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="py-2 font-normal">
                            {t(isPast24Hours ? "usage.period.hour" : "usage.period.day")}
                          </th>
                          {activeProviders.map((provider) => (
                            <th key={provider} className="py-2 text-right font-normal">
                              {PROVIDER_PRESENTATION[provider].label}
                            </th>
                          ))}
                          <th className="py-2 text-right font-normal">
                            {t("usage.breakdown.total")}
                          </th>
                          <th className="py-2 text-right font-normal">
                            {t("usage.breakdown.tokens")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdownPeriods.length === 0 ? (
                          <tr>
                            <td
                              colSpan={activeProviders.length + 3}
                              className="py-6 text-center text-muted-foreground"
                            >
                              {t("usage.noActivity")}
                            </td>
                          </tr>
                        ) : (
                          breakdownPeriods.map((period) => (
                            <tr
                              key={"hourStart" in period ? period.hourStart : period.day}
                              className="border-b border-border/50 transition-colors hover:bg-muted/50"
                            >
                              <td className="py-2 text-foreground">
                                {"hourStart" in period
                                  ? formatHourShort(period.hourStart, window.timeZone, locale)
                                  : formatDayShort(period.day, locale)}
                              </td>
                              {activeProviders.map((provider) => (
                                <td
                                  key={provider}
                                  className="py-2 text-right text-muted-foreground tabular-nums"
                                >
                                  {formatUsd(period.byProvider.get(provider)?.costUsd ?? 0)}
                                </td>
                              ))}
                              <td className="py-2 text-right text-foreground tabular-nums">
                                {formatUsd(period.costUsd)}
                              </td>
                              <td className="py-2 text-right text-muted-foreground tabular-nums">
                                {formatTokens(period.totalTokens)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </section>
              </>
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
}

/** Brand mark for the harness a row belongs to. */
function ProviderMark({
  provider,
  className,
}: {
  readonly provider: UsageProviderKind;
  readonly className: string;
}) {
  const Mark = PROVIDER_PRESENTATION[provider].mark;
  return <Mark className={cn("shrink-0", className)} aria-hidden />;
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Explains failed or incompatible environments and deduplicated transcripts.
 * Shown inside the environment filter so arriving results do not move the page.
 */
function UsageCoverageNotice({
  environments,
  duplicateSources,
  staleEnvironments,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly duplicateSources: readonly string[];
  readonly staleEnvironments: readonly string[];
}) {
  const { t } = useI18n();
  const failed = environments.filter((environment) => environment.error !== null);
  const stale = environments.filter((environment) =>
    staleEnvironments.includes(environment.environmentId),
  );
  if (failed.length === 0 && stale.length === 0 && duplicateSources.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border px-2 py-2 text-xs text-muted-foreground">
      {failed.map((environment) => (
        <span key={environment.label}>
          {t("usage.coverage.failed", { environment: environment.label })}
        </span>
      ))}
      {stale.map((environment) => (
        <span key={environment.label}>
          {t("usage.coverage.stale", { environment: environment.label })}
        </span>
      ))}
      {duplicateSources.length > 0 ? (
        <span>{t("usage.coverage.duplicates", { sources: duplicateSources.join(", ") })}</span>
      ) : null}
    </div>
  );
}

/** Environment selection and scan progress share a permanent header control. */
function UsageEnvironmentFilter({
  environments,
  selectedEnvironments,
  selectedEnvironmentIds,
  onSelectionChange,
  showUsageStatus,
  isPartial,
  duplicateSources,
  staleEnvironments,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly selectedEnvironments: readonly EnvironmentUsageStatus[];
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly onSelectionChange: (ids: ReadonlySet<EnvironmentId> | null) => void;
  readonly showUsageStatus: boolean;
  readonly isPartial: boolean;
  readonly duplicateSources: readonly string[];
  readonly staleEnvironments: readonly string[];
}) {
  const { locale } = useI18n();
  const translate = (source: string) => translateWebSource(locale, source);
  const [modelPricesOpen, setModelPricesOpen] = useState(false);
  const allSelected = selectedEnvironmentIds === null;
  const label = allSelected
    ? translate("All environments")
    : selectedEnvironments.length === 1
      ? selectedEnvironments[0]!.label
      : locale === "zh-CN"
        ? `${selectedEnvironments.length} 个环境`
        : `${selectedEnvironments.length} environments`;
  const pendingCount = selectedEnvironments.filter(
    (environment) =>
      environment.error === null && (environment.isPending || environment.summary === null),
  ).length;
  const hasIssue =
    selectedEnvironments.some((environment) => environment.error !== null) ||
    staleEnvironments.length > 0;

  return (
    <>
      <Menu>
        <MenuTrigger className="group/usage-environment inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-sm text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0 truncate">{label}</span>
          <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
            {showUsageStatus && pendingCount > 0 ? (
              <>
                <CircleDashedIcon className="size-3.5" aria-hidden />
                <span className="sr-only">
                  {locale === "zh-CN"
                    ? `${pendingCount} 个环境仍在扫描${isPartial ? "；当前总计不完整" : ""}`
                    : `${pendingCount} ${pendingCount === 1 ? "environment" : "environments"} still scanning${isPartial ? "; totals are partial" : ""}`}
                </span>
              </>
            ) : showUsageStatus && hasIssue ? (
              <CircleAlertIcon
                className="size-3.5 text-amber-600 dark:text-amber-400"
                aria-label={translate("Some environments could not report usage")}
              />
            ) : (
              <ChevronDownIcon
                className="size-3.5 opacity-0 transition-opacity group-hover/usage-environment:opacity-100 group-focus-visible/usage-environment:opacity-100 group-data-popup-open/usage-environment:opacity-100"
                aria-hidden
              />
            )}
          </span>
        </MenuTrigger>
        <MenuPopup align="start" className="w-80 max-w-[calc(100vw-2rem)]">
          <MenuCheckboxItem
            checked={allSelected}
            closeOnClick={false}
            onCheckedChange={(checked) => onSelectionChange(checked ? null : new Set())}
          >
            {translate("All environments")}
          </MenuCheckboxItem>
          <MenuSeparator />
          {environments.map((environment) => {
            const checked =
              selectedEnvironmentIds === null ||
              selectedEnvironmentIds.has(environment.environmentId);
            const status =
              environment.error !== null
                ? translate("Unavailable")
                : environment.summary !== null &&
                    !isCompatibleUsageContractVersion(
                      environment.summary.contractVersion,
                      USAGE_CONTRACT_VERSION,
                    )
                  ? translate("Update required")
                  : environment.summary === null
                    ? translate("Scanning…")
                    : environment.isPending
                      ? translate("Refreshing…")
                      : translate("Ready");
            return (
              <MenuCheckboxItem
                key={environment.environmentId}
                checked={checked}
                closeOnClick={false}
                className="grid-cols-[1rem_minmax(0,1fr)]"
                onCheckedChange={(nextChecked) => {
                  const next = new Set(selectedEnvironments.map((entry) => entry.environmentId));
                  if (nextChecked) next.add(environment.environmentId);
                  else next.delete(environment.environmentId);
                  onSelectionChange(next.size === environments.length ? null : next);
                }}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{environment.label}</span>
                  {showUsageStatus ? (
                    <span
                      className={cn(
                        "shrink-0 text-xs text-muted-foreground",
                        environment.error !== null && "text-destructive",
                      )}
                    >
                      {status}
                    </span>
                  ) : null}
                </span>
              </MenuCheckboxItem>
            );
          })}
          {environments.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {translate("No environments connected.")}
            </p>
          ) : null}
          {showUsageStatus && isPartial ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {translate("Totals are partial while selected environments scan.")}
            </p>
          ) : null}
          {showUsageStatus ? (
            <UsageCoverageNotice
              environments={selectedEnvironments}
              duplicateSources={duplicateSources}
              staleEnvironments={staleEnvironments}
            />
          ) : null}
          <MenuSeparator />
          <MenuItem onClick={() => setModelPricesOpen(true)}>
            <SlidersHorizontalIcon aria-hidden />
            {translate("Model prices")}
          </MenuItem>
        </MenuPopup>
      </Menu>
      {modelPricesOpen ? (
        <UsagePriceOverrides
          usage={environments}
          initialSelectedEnvironmentIds={selectedEnvironmentIds}
          onOpenChange={setModelPricesOpen}
        />
      ) : null}
    </>
  );
}

/**
 * Stand-in with the loaded page's shape, using the shared `Skeleton` bars so it
 * breathes with the same `animate-skeleton` pulse as every other loading state.
 * Replaced by results as soon as the first environment answers.
 */
function UsageSkeleton() {
  const { t } = useI18n();
  const metricLabels = [
    t("usage.processedTokens"),
    t("usage.metric.cachedInput"),
    t("usage.metric.uncachedInput"),
    t("usage.metric.output"),
    t("usage.metric.cacheSavings"),
  ];

  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-4 w-32" />
          </div>
          {PROVIDER_ORDER.map((provider) => (
            <div key={provider} className="flex flex-col gap-1">
              <div className="flex min-h-5 items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <Skeleton className="size-2 shrink-0 rounded-full" />
                  <Skeleton className="size-4 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-20" />
                </span>
                <Skeleton className="h-3.5 w-14" />
              </div>
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <div className="flex flex-col gap-1">
            <Skeleton className="ml-16 h-56 bg-muted-foreground/10" />
            <Skeleton className="ml-16 h-4 bg-muted-foreground/10" />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">{t("usage.totals")}</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 py-1 md:grid-cols-5">
          {metricLabels.map((label) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">{t("usage.breakdown")}</h2>
          <Skeleton className="h-7 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-44 bg-muted-foreground/10" />
      </section>
    </>
  );
}

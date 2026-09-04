import { useAtomValue } from "@effect/atom-react";
import { connectionStatusText } from "@t3tools/client-runtime/connection";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  defaultInstanceIdForDriver,
  type EnvironmentId,
  PROVIDER_DISPLAY_NAMES,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  resolveEnvironmentMachineKind,
  resolveProviderInstanceEnabled,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import {
  getBackgroundActivityPresetSettings,
  resolveServerBackgroundActivitySettings,
} from "@t3tools/shared/backgroundActivitySettings";
import * as Arr from "effect/Array";
import * as Duration from "effect/Duration";
import * as Equal from "effect/Equal";
import * as Result from "effect/Result";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { isDesktopLocalConnectionTarget } from "../../connection/desktopLocal";
import { isElectron } from "../../env";
import { usePrimarySessionState } from "../../environments/primary";
import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { useI18n, type WebTranslate } from "../../i18n/WebI18nProvider";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { cn } from "../../lib/utils";
import { resolveAppModelSelectionState } from "../../modelSelection";
import {
  useEnvironments,
  usePrimaryEnvironmentId,
  type EnvironmentPresentation,
} from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useEnvironmentSessionState } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { getRelativeTimeState } from "../../timestampFormat";
import {
  ConnectionStatusDot,
  connectionPhaseDotClassName,
  connectionPhasePingClassName,
} from "../ConnectionStatusDot";
import {
  canOneClickUpdateProviderCandidate,
  collectProviderUpdateCandidates,
  hasOneClickUpdateProviderCandidate,
  isProviderUpdateActive,
  type ProviderUpdateCandidate,
} from "../ProviderUpdateLaunchNotification.logic";
import { Button } from "../ui/button";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { AddProviderInstanceDialog } from "./AddProviderInstanceDialog";
import { ProviderInstanceCard } from "./ProviderInstanceCard";
import { UsageProviderSettings } from "./UsageProviderSettings";
import { ProviderSetupSection, readAntigravityAuthMethod } from "./ProviderSetupSection";
import { DRIVER_OPTIONS, getDriverOption } from "./providerDriverMeta";
import { providerSettingsTabClassName } from "./providerSettingsTabs";
import { searchableSetting } from "./settingsSearch";
import {
  backgroundActivityOverrideSettings,
  buildProviderInstanceUpdatePatch,
  durationToSeconds,
  normalizeIntervalSeconds,
  PROVIDER_HEALTH_INTERVAL_STEP_SECONDS,
} from "./SettingsPanels.logic";
import {
  PolicyTooltip,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  useRelativeTimeTick,
  useSettingsSearchTargetId,
} from "./settingsLayout";
import {
  buildProviderEnvironmentOptions,
  classifyProviderEnvironmentAccess,
  isProviderSettingsEnvironmentAvailable,
  type ProviderEnvironmentAccess,
  type ProviderOperateAccess,
  resolvePrimaryOperateAccess,
  resolveRemoteOperateAccess,
  resolveSelectedProviderEnvironmentId,
} from "./ProviderSettingsPanel.logic";

function withoutProviderInstanceKey<V>(
  record: Readonly<Record<ProviderInstanceId, V>> | undefined,
  key: ProviderInstanceId,
): Record<ProviderInstanceId, V> {
  const next = { ...record } as Record<ProviderInstanceId, V>;
  delete next[key];
  return next;
}

function withoutProviderInstanceFavorites(
  favorites: ReadonlyArray<{ readonly provider: ProviderInstanceId; readonly model: string }>,
  instanceId: ProviderInstanceId,
) {
  return favorites.filter((favorite) => favorite.provider !== instanceId);
}

const PROVIDER_SETTINGS = DRIVER_OPTIONS.map((definition) => ({
  provider: definition.value,
}));

function configuredBinaryPath(config: unknown): string {
  if (config === null || typeof config !== "object" || !("binaryPath" in config)) return "";
  return typeof config.binaryPath === "string" ? config.binaryPath.trim() : "";
}

function ProviderLastChecked({ lastCheckedAt }: { lastCheckedAt: string | null }) {
  const { t } = useI18n();
  useRelativeTimeTick();
  const lastCheckedRelative = getRelativeTimeState(lastCheckedAt);

  if (lastCheckedRelative.status === "missing") {
    return null;
  }

  if (lastCheckedRelative.status === "invalid") {
    return <span>{t("providers.lastChecked.unavailable")}</span>;
  }

  return (
    <span>
      {lastCheckedRelative.suffix ? (
        <>{t("providers.lastChecked.ago", { time: lastCheckedRelative.value })}</>
      ) : (
        <>{t("providers.lastChecked.justNow")}</>
      )}
    </span>
  );
}

function providerEnvironmentDetail(environment: EnvironmentPresentation, t: WebTranslate): string {
  if (environment.entry.target._tag === "PrimaryConnectionTarget") {
    return t("providers.devices.primary");
  }
  if (environment.relayManaged) return "T3 Connect";
  if (environment.entry.target._tag === "SshConnectionTarget") return "SSH";
  if (isDesktopLocalConnectionTarget(environment.entry.target)) {
    return t("providers.devices.local");
  }
  return environment.displayUrl ?? t("providers.devices.remote");
}

function localizedConnectionStatus(environment: EnvironmentPresentation, t: WebTranslate): string {
  const status = connectionStatusText(environment.connection);
  if (status === "Connecting..." || status === "Connecting…") {
    return t("providers.connection.connecting");
  }
  if (status === "Connected") return t("providers.connection.connected");
  if (status === "Disconnected") return t("providers.connection.disconnected");
  if (status === "Reconnecting..." || status === "Reconnecting…") {
    return t("providers.connection.reconnecting");
  }
  return status;
}

function EnvironmentUnavailableRow({
  environment,
  access,
  deviceTabs,
}: {
  readonly environment: EnvironmentPresentation;
  readonly access: Exclude<ProviderEnvironmentAccess, { kind: "editable" | "read-only" }>;
  readonly deviceTabs?: ReactNode;
}) {
  const { t } = useI18n();
  const isLoading = access.kind === "loading";
  const title = isLoading
    ? t("providers.unavailable.loading")
    : access.kind === "error"
      ? t("providers.unavailable.connectFailed")
      : t("providers.unavailable.title");
  const description = isLoading
    ? access.reason === "permissions"
      ? t("providers.unavailable.checkingPermissions")
      : t("providers.unavailable.waitingConfiguration", { environment: environment.label })
    : localizedConnectionStatus(environment, t);
  // No spinner: this state can persist indefinitely for a wedged device, and a
  // continuously repainting animation would run the whole time.
  return (
    <SettingsSection {...searchableSetting("providers")}>
      {deviceTabs}
      <SettingsRow title={title} description={description} />
    </SettingsSection>
  );
}

interface ProviderSettingsTarget {
  readonly environmentId?: EnvironmentId;
  readonly instanceId?: ProviderInstanceId;
}

export function ProviderSettingsPanel(target: ProviderSettingsTarget) {
  return (
    <SettingsPageContainer width="wide" className="gap-8">
      <ProviderSettingsPanelContent
        key={`${target.environmentId ?? ""}:${target.instanceId ?? ""}`}
        {...target}
      />
    </SettingsPageContainer>
  );
}

function ProviderSettingsPanelContent(target: ProviderSettingsTarget) {
  const { t } = useI18n();
  const { environments, isReady } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const searchTargetId = useSettingsSearchTargetId();
  const options = useMemo(
    () => buildProviderEnvironmentOptions(environments, primaryEnvironmentId),
    [environments, primaryEnvironmentId],
  );
  // Raw user intent; the effective selection is re-derived every render so a
  // device that drops out of the catalog falls back without erasing the pick —
  // if it reappears (e.g. after a reconnect) the selection is restored.
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(
    target.environmentId ?? primaryEnvironmentId,
  );
  const targetEnvironmentMissing =
    target.environmentId !== undefined &&
    selectedEnvironmentId === target.environmentId &&
    !options.some((environment) => environment.environmentId === target.environmentId);
  const effectiveEnvironmentId = targetEnvironmentMissing
    ? target.environmentId
    : resolveSelectedProviderEnvironmentId(options, selectedEnvironmentId, primaryEnvironmentId);
  const selectedEnvironment =
    options.find((environment) => environment.environmentId === effectiveEnvironmentId) ?? null;
  const selectedEnvironmentCanRenderSettings =
    selectedEnvironment !== null &&
    isProviderSettingsEnvironmentAvailable({
      connectionPhase: selectedEnvironment.connection.phase,
      hasServerConfig: selectedEnvironment.serverConfig !== null,
    });
  const searchableEnvironmentId = options.find((environment) =>
    isProviderSettingsEnvironmentAvailable({
      connectionPhase: environment.connection.phase,
      hasServerConfig: environment.serverConfig !== null,
    }),
  )?.environmentId;
  useEffect(() => {
    if (
      (searchTargetId === searchableSetting("provider-health-check-interval").id ||
        searchTargetId === searchableSetting("usage-providers").id) &&
      !selectedEnvironmentCanRenderSettings &&
      searchableEnvironmentId !== undefined
    ) {
      setSelectedEnvironmentId(searchableEnvironmentId);
    }
  }, [searchTargetId, searchableEnvironmentId, selectedEnvironmentCanRenderSettings]);
  const onlyPrimaryDevice =
    options.length === 1 && options[0]?.entry.target._tag === "PrimaryConnectionTarget";
  const deviceTabs =
    !onlyPrimaryDevice && options.length > 0 ? (
      <ScrollArea hideScrollbars scrollFade className="mx-3 h-11 min-w-0 rounded-none sm:mx-4">
        <div
          role="group"
          aria-label={t("providers.devices.title")}
          className="flex h-full w-max min-w-full px-1"
        >
          {options.map((environment) => {
            const machine = resolveEnvironmentMachineKind(environment.serverConfig);
            const selected = environment.environmentId === effectiveEnvironmentId;
            const detail = providerEnvironmentDetail(environment, t);
            const statusText = localizedConnectionStatus(environment, t);
            return (
              <Tooltip key={environment.environmentId}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-pressed={selected}
                      className={cn(providerSettingsTabClassName(selected), "gap-2 text-left")}
                      onClick={() => setSelectedEnvironmentId(environment.environmentId)}
                    >
                      <EnvironmentMachineIcon
                        kind={machine}
                        className="size-3.5 shrink-0"
                        aria-hidden
                      />
                      <span className="max-w-40 truncate">{environment.label}</span>
                      {environment.connection.phase !== "connected" ? (
                        <ConnectionStatusDot
                          dotClassName={connectionPhaseDotClassName(environment.connection.phase)}
                          pingClassName={connectionPhasePingClassName(environment.connection.phase)}
                        />
                      ) : null}
                      <span className="sr-only">
                        {detail}, {statusText}
                      </span>
                    </button>
                  }
                />
                <TooltipPopup side="top">
                  {detail} · {statusText}
                </TooltipPopup>
              </Tooltip>
            );
          })}
        </div>
      </ScrollArea>
    ) : null;

  return (
    <>
      {targetEnvironmentMissing ? (
        <SettingsSection {...searchableSetting("providers")}>
          {deviceTabs}
          <SettingsRow
            title={t("providers.deviceUnavailable.title")}
            description={t("providers.deviceUnavailable.description")}
          />
        </SettingsSection>
      ) : null}
      {options.length === 0 && !targetEnvironmentMissing ? (
        <SettingsSection {...searchableSetting("providers")}>
          <SettingsRow
            title={isReady ? t("providers.devices.empty") : t("providers.devices.loading")}
            description={
              isReady
                ? t("providers.devices.emptyDescription")
                : t("providers.devices.loadingDescription")
            }
          />
        </SettingsSection>
      ) : null}

      {selectedEnvironment ? (
        <SelectedEnvironmentProviderSettings
          key={selectedEnvironment.environmentId}
          environment={selectedEnvironment}
          deviceTabs={deviceTabs}
          targetInstanceId={
            target.environmentId === undefined ||
            selectedEnvironment.environmentId === target.environmentId
              ? target.instanceId
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function SelectedEnvironmentProviderSettings({
  environment,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environment: EnvironmentPresentation;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
}) {
  const isPrimary = environment.entry.target._tag === "PrimaryConnectionTarget";
  if (isPrimary) {
    // The desktop app owns its primary server outright; a browser session
    // checks the scopes its cookie session was granted.
    if (isElectron) {
      return (
        <AccessGatedProviderSettings
          environment={environment}
          operateAccess="granted"
          deviceTabs={deviceTabs}
          targetInstanceId={targetInstanceId}
        />
      );
    }
    return (
      <PrimarySessionGatedProviderSettings
        environment={environment}
        deviceTabs={deviceTabs}
        targetInstanceId={targetInstanceId}
      />
    );
  }
  return (
    <RemoteSessionGatedProviderSettings
      environment={environment}
      deviceTabs={deviceTabs}
      targetInstanceId={targetInstanceId}
    />
  );
}

function PrimarySessionGatedProviderSettings({
  environment,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environment: EnvironmentPresentation;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
}) {
  const primarySessionState = usePrimarySessionState();
  const operateAccess = resolvePrimaryOperateAccess({
    isPrimary: true,
    hasDesktopBridge: false,
    session: primarySessionState.data,
    isPending: primarySessionState.isPending,
    hasError: primarySessionState.error !== null,
  });
  return (
    <AccessGatedProviderSettings
      environment={environment}
      operateAccess={operateAccess}
      deviceTabs={deviceTabs}
      targetInstanceId={targetInstanceId}
    />
  );
}

function RemoteSessionGatedProviderSettings({
  environment,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environment: EnvironmentPresentation;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
}) {
  const sessionState = useEnvironmentSessionState(environment.environmentId);
  const operateAccess = resolveRemoteOperateAccess({
    session: sessionState.data,
    isPending: sessionState.isPending,
    hasError: sessionState.hasError,
  });
  return (
    <AccessGatedProviderSettings
      environment={environment}
      operateAccess={operateAccess}
      deviceTabs={deviceTabs}
      targetInstanceId={targetInstanceId}
    />
  );
}

function AccessGatedProviderSettings({
  environment,
  operateAccess,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environment: EnvironmentPresentation;
  readonly operateAccess: ProviderOperateAccess;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
}) {
  const access = classifyProviderEnvironmentAccess({
    connectionPhase: environment.connection.phase,
    hasServerConfig: environment.serverConfig !== null,
    operateAccess,
  });
  if (access.kind !== "editable" && access.kind !== "read-only") {
    return (
      <EnvironmentUnavailableRow
        environment={environment}
        access={access}
        deviceTabs={deviceTabs}
      />
    );
  }
  return (
    <EnvironmentProviderSettings
      environmentId={environment.environmentId}
      environmentLabel={environment.label}
      readOnly={access.kind === "read-only"}
      deviceTabs={deviceTabs}
      targetInstanceId={targetInstanceId}
    />
  );
}

export function EnvironmentProviderSettings({
  environmentId,
  environmentLabel,
  readOnly = false,
  deviceTabs,
  targetInstanceId,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly deviceTabs?: ReactNode;
  readonly targetInstanceId?: ProviderInstanceId | undefined;
  /**
   * Grey out and freeze every write control when this session's credential
   * lacks `orchestration:operate` on the environment. Selecting providers
   * still works so the real configuration stays readable; switches, forms,
   * and the health interval are inert so no write is offered and then rejected.
   */
  readonly readOnly?: boolean;
}) {
  const { t } = useI18n();
  const settings = useEnvironmentSettings(environmentId);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const serverProviders =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const refreshServerProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, {
    reportFailure: false,
  });
  const [isRefreshingProviders, setIsRefreshingProviders] = useState(false);
  const [isAddInstanceDialogOpen, setIsAddInstanceDialogOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<ProviderInstanceId | null>(
    targetInstanceId ?? null,
  );
  const [updatingProviderDrivers, setUpdatingProviderDrivers] = useState<
    ReadonlySet<ProviderDriverKind>
  >(() => new Set());
  const refreshingRef = useRef(false);
  const updatingDriversRef = useRef<Set<ProviderDriverKind>>(new Set());

  const providerUpdateCandidates = useMemo(
    () => collectProviderUpdateCandidates(serverProviders),
    [serverProviders],
  );
  const providerUpdateCandidateByInstanceId = useMemo(
    () => new Map(providerUpdateCandidates.map((candidate) => [candidate.instanceId, candidate])),
    [providerUpdateCandidates],
  );
  const visibleProviderSettings = PROVIDER_SETTINGS.filter(
    (providerSettings) =>
      providerSettings.provider !== "cursor" ||
      serverProviders.some(
        (provider) =>
          provider.instanceId === defaultInstanceIdForDriver(ProviderDriverKind.make("cursor")),
      ),
  );
  const textGenerationModelSelection = resolveAppModelSelectionState(settings, serverProviders);
  const textGenInstanceId = textGenerationModelSelection.instanceId;
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const providerHealthPreset = getBackgroundActivityPresetSettings(
    resolvedBackgroundActivity.profile,
  ).providerHealthRefreshInterval;
  const providerHealthRefreshIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.providerHealthRefreshInterval,
  );
  const defaultProviderHealthRefreshIntervalSeconds = durationToSeconds(providerHealthPreset);
  const lastCheckedAt =
    serverProviders.length > 0
      ? serverProviders.reduce(
          (latest, provider) => (provider.checkedAt > latest ? provider.checkedAt : latest),
          serverProviders[0]!.checkedAt,
        )
      : null;

  const refreshProviders = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshingProviders(true);
    void (async () => {
      const result = await refreshServerProviders({
        environmentId,
        input: { refreshModels: true },
      });
      refreshingRef.current = false;
      setIsRefreshingProviders(false);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        console.warn("Failed to refresh providers", {
          operation: "refresh-providers",
          environmentId,
          ...safeErrorLogAttributes(squashAtomCommandFailure(result)),
        });
      }
    })();
  }, [environmentId, refreshServerProviders]);

  const runProviderUpdate = useCallback(
    async (candidate: ProviderUpdateCandidate) => {
      // Ref-based re-entry guard, mirroring refreshProviders: a state updater
      // may run after this function returns, so it cannot gate the dispatch.
      if (updatingDriversRef.current.has(candidate.driver)) {
        return;
      }
      updatingDriversRef.current.add(candidate.driver);
      setUpdatingProviderDrivers((previous) => new Set(previous).add(candidate.driver));

      const result = await updateProvider({
        environmentId,
        input: {
          provider: candidate.driver,
          instanceId: candidate.instanceId,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t("providers.update.failedTitle", {
              provider: PROVIDER_DISPLAY_NAMES[candidate.driver] ?? candidate.driver,
            }),
            description:
              error instanceof Error ? error.message : t("providers.update.failedDescription"),
          }),
        );
      }
      updatingDriversRef.current.delete(candidate.driver);
      setUpdatingProviderDrivers((previous) => {
        if (!previous.has(candidate.driver)) {
          return previous;
        }
        const next = new Set(previous);
        next.delete(candidate.driver);
        return next;
      });
    },
    [environmentId, t, updateProvider],
  );

  interface InstanceRow {
    readonly instanceId: ProviderInstanceId;
    readonly instance: ProviderInstanceConfig;
    readonly driver: ProviderDriverKind;
    readonly isDefault: boolean;
    readonly isDirty?: boolean;
  }

  const instancesByDriver = new Map<
    ProviderDriverKind,
    Array<[ProviderInstanceId, ProviderInstanceConfig]>
  >();
  for (const [rawId, instance] of Object.entries(settings.providerInstances ?? {})) {
    const driver = instance.driver;
    const list = instancesByDriver.get(driver) ?? [];
    list.push([rawId as ProviderInstanceId, instance]);
    instancesByDriver.set(driver, list);
  }

  const defaultSlotIdsBySource = new Set<string>(
    visibleProviderSettings.map((providerSettings) =>
      String(defaultInstanceIdForDriver(providerSettings.provider)),
    ),
  );

  const rows: InstanceRow[] = [];
  const visibleDriverKinds = new Set<ProviderDriverKind>(
    visibleProviderSettings.map((providerSettings) => providerSettings.provider),
  );

  for (const providerSettings of visibleProviderSettings) {
    type LegacyProviderSettings = (typeof settings.providers)[keyof typeof settings.providers];
    const legacyProviders = settings.providers as Record<string, LegacyProviderSettings>;
    const defaultLegacyProviders = DEFAULT_UNIFIED_SETTINGS.providers as Record<
      string,
      LegacyProviderSettings
    >;
    const driver = providerSettings.provider;
    const defaultInstanceId = defaultInstanceIdForDriver(driver);
    const explicitInstance = settings.providerInstances?.[defaultInstanceId];
    // A remote device may run a server version whose settings predate this
    // driver, so the legacy mirror can be absent. Without either an explicit
    // instance or a legacy blob there is nothing to render for the slot.
    const legacyConfig = legacyProviders[providerSettings.provider];
    const defaultLegacyConfig = defaultLegacyProviders[providerSettings.provider];
    // The envelope is the single enabled flag: keep the legacy in-config
    // flag out of the synthesized blob, or an explicit `enabled: false`
    // would keep winning over the envelope and the Switch could never
    // turn a default-off provider on.
    const synthesizedInstance = (): ProviderInstanceConfig | undefined => {
      if (legacyConfig === undefined) {
        return undefined;
      }
      const { enabled: legacyEnabled, ...legacyConfigRest } = legacyConfig;
      return {
        driver,
        enabled: legacyEnabled,
        config: legacyConfigRest,
      } satisfies ProviderInstanceConfig;
    };
    const effectiveInstance: ProviderInstanceConfig | undefined =
      explicitInstance ?? synthesizedInstance();
    // Only the default slot depends on the legacy blob; custom instances for
    // the driver must still render even when the slot has nothing to show.
    if (effectiveInstance !== undefined) {
      const isDirty =
        explicitInstance !== undefined || !Equal.equals(legacyConfig, defaultLegacyConfig);
      rows.push({
        instanceId: defaultInstanceId,
        instance: effectiveInstance,
        driver,
        isDefault: true,
        isDirty,
      });
    }
    for (const [id, instance] of instancesByDriver.get(providerSettings.provider) ?? []) {
      if (id === defaultInstanceId) continue;
      rows.push({ instanceId: id, instance, driver: instance.driver, isDefault: false });
    }
  }
  for (const [driver, list] of instancesByDriver) {
    if (visibleDriverKinds.has(driver)) continue;
    for (const [id, instance] of list) {
      rows.push({
        instanceId: id,
        instance,
        driver: instance.driver,
        isDefault: defaultSlotIdsBySource.has(String(id)),
      });
    }
  }

  const targetInstanceMissing =
    targetInstanceId !== undefined &&
    selectedInstanceId === targetInstanceId &&
    !rows.some((row) => row.instanceId === targetInstanceId);
  const selectedRow =
    rows.find((row) => row.instanceId === selectedInstanceId) ??
    (targetInstanceMissing ? null : (rows[0] ?? null));

  const updateProviderInstance = (
    row: InstanceRow,
    next: ProviderInstanceConfig,
    options?: {
      readonly textGenerationModelSelection?: Parameters<
        typeof buildProviderInstanceUpdatePatch
      >[0]["textGenerationModelSelection"];
    },
  ) => {
    updateSettings(
      buildProviderInstanceUpdatePatch({
        settings,
        instanceId: row.instanceId,
        instance: next,
        driver: row.driver,
        isDefault: row.isDefault,
        textGenerationModelSelection: options?.textGenerationModelSelection,
      }),
    );
  };

  const deleteProviderInstance = (id: ProviderInstanceId) => {
    updateSettings({
      providerInstances: withoutProviderInstanceKey(settings.providerInstances, id),
    });
  };

  const updateProviderModelPreferences = (
    instanceId: ProviderInstanceId,
    next: {
      readonly hiddenModels: ReadonlyArray<string>;
      readonly modelOrder: ReadonlyArray<string>;
    },
  ) => {
    const hiddenModels = [...new Set(next.hiddenModels.filter((slug) => slug.trim().length > 0))];
    const modelOrder = [...new Set(next.modelOrder.filter((slug) => slug.trim().length > 0))];
    const rest = withoutProviderInstanceKey(settings.providerModelPreferences, instanceId);
    updateSettings({
      providerModelPreferences:
        hiddenModels.length === 0 && modelOrder.length === 0
          ? rest
          : {
              ...rest,
              [instanceId]: {
                hiddenModels,
                modelOrder,
              },
            },
    });
  };

  const updateProviderFavoriteModels = (
    instanceId: ProviderInstanceId,
    nextFavoriteModels: ReadonlyArray<string>,
  ) => {
    const favoriteModels = [
      ...new Set(
        Arr.filterMap(nextFavoriteModels, (slug) => {
          const trimmedSlug = slug.trim();
          return trimmedSlug.length > 0 ? Result.succeed(trimmedSlug) : Result.failVoid;
        }),
      ),
    ];
    updateSettings({
      favorites: [
        ...withoutProviderInstanceFavorites(settings.favorites ?? [], instanceId),
        ...favoriteModels.map((model) => ({ provider: instanceId, model })),
      ],
    });
  };

  const resetDefaultInstance = (driverKind: ProviderDriverKind) => {
    type LegacyProviderSettings = (typeof settings.providers)[keyof typeof settings.providers];
    const defaultLegacyProviders = DEFAULT_UNIFIED_SETTINGS.providers as Record<
      string,
      LegacyProviderSettings | undefined
    >;
    const defaultInstanceId = defaultInstanceIdForDriver(driverKind);
    const defaultLegacyProvider = defaultLegacyProviders[driverKind];
    if (defaultLegacyProvider === undefined) return;
    updateSettings({
      providers: {
        ...settings.providers,
        [driverKind]: defaultLegacyProvider,
      } as typeof settings.providers,
      providerInstances: withoutProviderInstanceKey(settings.providerInstances, defaultInstanceId),
    });
  };

  const renderProviderInstance = (row: InstanceRow, mode: "list" | "editor") => {
    const driverOption = getDriverOption(row.driver);
    const liveProvider = serverProviders.find(
      (candidate) => candidate.instanceId === row.instanceId,
    );
    const updateCandidate = liveProvider
      ? providerUpdateCandidateByInstanceId.get(liveProvider.instanceId)
      : undefined;
    const isDriverUpdateRunning =
      updateCandidate !== undefined &&
      (updatingProviderDrivers.has(updateCandidate.driver) ||
        serverProviders.some(
          (provider) =>
            provider.driver === updateCandidate.driver && isProviderUpdateActive(provider),
        ));
    const showInlineUpdateButton =
      updateCandidate !== undefined &&
      hasOneClickUpdateProviderCandidate(updateCandidate, serverProviders);
    const canRunInlineUpdate =
      updateCandidate !== undefined &&
      canOneClickUpdateProviderCandidate(updateCandidate, serverProviders) &&
      !updatingProviderDrivers.has(updateCandidate.driver);
    const modelPreferences = settings.providerModelPreferences?.[row.instanceId] ?? {
      hiddenModels: [],
      modelOrder: [],
    };
    const favoriteModels = Arr.filterMap(settings.favorites ?? [], (favorite) =>
      favorite.provider === row.instanceId ? Result.succeed(favorite.model) : Result.failVoid,
    );
    const resetLabel = driverOption?.label ?? String(row.driver);

    return (
      <ProviderInstanceCard
        key={row.instanceId}
        instanceId={row.instanceId}
        instance={row.instance}
        driverOption={driverOption}
        liveProvider={liveProvider}
        mode={mode}
        selected={mode === "list" && selectedRow?.instanceId === row.instanceId}
        onSelect={mode === "list" ? () => setSelectedInstanceId(row.instanceId) : undefined}
        readOnly={readOnly}
        setup={
          mode === "editor" && row.driver === "antigravity" ? (
            <ProviderSetupSection
              environmentId={environmentId}
              environmentLabel={environmentLabel}
              instanceId={row.instanceId}
              provider={liveProvider}
              binaryPath={configuredBinaryPath(row.instance.config)}
              authMethod={readAntigravityAuthMethod(row.instance.config)}
              enabled={resolveProviderInstanceEnabled(row.instance)}
              readOnly={readOnly}
              onEnable={() => updateProviderInstance(row, { ...row.instance, enabled: true })}
            />
          ) : null
        }
        onUpdate={(next) => {
          const wasEnabled = resolveProviderInstanceEnabled(row.instance);
          const isDisabling = next.enabled === false && wasEnabled;
          const shouldClearTextGen = isDisabling && textGenInstanceId === row.instanceId;
          updateProviderInstance(
            row,
            next,
            shouldClearTextGen
              ? {
                  textGenerationModelSelection:
                    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
                }
              : undefined,
          );
        }}
        onDelete={
          mode === "editor" && !row.isDefault
            ? () => deleteProviderInstance(row.instanceId)
            : undefined
        }
        headerAction={
          mode === "editor" && row.isDefault && row.isDirty ? (
            <SettingResetButton
              label={`${resetLabel} provider settings`}
              onClick={() => resetDefaultInstance(row.driver)}
            />
          ) : null
        }
        hiddenModels={modelPreferences.hiddenModels}
        favoriteModels={favoriteModels}
        modelOrder={modelPreferences.modelOrder}
        onHiddenModelsChange={(hiddenModels) =>
          updateProviderModelPreferences(row.instanceId, {
            ...modelPreferences,
            hiddenModels,
          })
        }
        onFavoriteModelsChange={(next) => updateProviderFavoriteModels(row.instanceId, next)}
        onModelOrderChange={(modelOrder) =>
          updateProviderModelPreferences(row.instanceId, {
            ...modelPreferences,
            modelOrder,
          })
        }
        onRunUpdate={
          mode === "editor" && showInlineUpdateButton && updateCandidate
            ? () => {
                if (canRunInlineUpdate) void runProviderUpdate(updateCandidate);
              }
            : undefined
        }
        isUpdating={mode === "editor" && showInlineUpdateButton ? isDriverUpdateRunning : undefined}
      />
    );
  };

  return (
    <>
      <SettingsSection
        {...searchableSetting("providers")}
        variant="plain"
        headerAction={
          <div className="flex min-w-0 items-center gap-2">
            {readOnly ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                <ProviderLastChecked lastCheckedAt={lastCheckedAt} />
              </span>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="xs"
                        variant="ghost-muted"
                        disabled={isRefreshingProviders}
                        aria-busy={isRefreshingProviders}
                        onClick={() => void refreshProviders()}
                      >
                        <RefreshCwIcon />
                        <span className="sr-only">{t("providers.action.refresh")}</span>
                        <span className="hidden min-w-0 truncate sm:inline">
                          {isRefreshingProviders ? (
                            t("providers.status.checking")
                          ) : (
                            <ProviderLastChecked lastCheckedAt={lastCheckedAt} />
                          )}
                        </span>
                      </Button>
                    }
                  />
                  <TooltipPopup side="top">{t("providers.action.refresh")}</TooltipPopup>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost-muted"
                        onClick={() => setIsAddInstanceDialogOpen(true)}
                        aria-label={t("providers.action.add")}
                      >
                        <PlusIcon />
                      </Button>
                    }
                  />
                  <TooltipPopup side="top">{t("providers.action.add")}</TooltipPopup>
                </Tooltip>
              </>
            )}
          </div>
        }
      >
        {deviceTabs}
        {readOnly ? (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-xs/5">
            <SettingsRow
              title={t("providers.permissions.limited")}
              description={t("providers.permissions.limitedDescription", {
                environment: environmentLabel,
              })}
            />
          </div>
        ) : null}
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-xs/5 lg:grid lg:h-[min(44rem,calc(100dvh-11rem))] lg:min-h-[32rem] lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="border-b border-border/60 bg-muted/10 lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-b-0">
            <ScrollArea scrollFade chainVerticalScroll className="lg:min-h-0 lg:flex-1">
              <div className="divide-y divide-border/50">
                {rows.map((row) => renderProviderInstance(row, "list"))}
              </div>
            </ScrollArea>
          </div>

          <div className="min-w-0 lg:min-h-0">
            {selectedRow ? (
              <ScrollArea scrollFade chainVerticalScroll className="lg:h-full">
                <div className="space-y-6 p-4">{renderProviderInstance(selectedRow, "editor")}</div>
              </ScrollArea>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                {targetInstanceMissing
                  ? t("providers.instance.missing")
                  : t("providers.models.empty")}
              </div>
            )}
          </div>
        </div>
      </SettingsSection>

      <UsageProviderSettings
        key={environmentId}
        environmentId={environmentId}
        environmentLabel={environmentLabel}
        sources={settings.usageLimitSources}
        readOnly={readOnly}
      />

      <SettingsSection title="Advanced">
        <SettingsRow
          id={searchableSetting("provider-health-check-interval").id}
          title={
            <span className="inline-flex items-center gap-1.5">
              {searchableSetting("provider-health-check-interval").title}
              <PolicyTooltip>
                This interval is configured here, then the shared Background activity policy decides
                whether provider probes may run when the timer fires. Custom intervals appear as
                Advanced in General settings.
              </PolicyTooltip>
            </span>
          }
          description="Refresh provider status, versions, and models in the background. Set to 0 to disable."
          resetAction={
            providerHealthRefreshIntervalSeconds !== defaultProviderHealthRefreshIntervalSeconds ? (
              <span inert={readOnly} className={readOnly ? "opacity-50" : undefined}>
                <SettingResetButton
                  label="provider health check interval"
                  onClick={() =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        { providerHealthRefreshInterval: undefined },
                      ),
                    )
                  }
                />
              </span>
            ) : null
          }
          control={
            <div
              inert={readOnly}
              aria-disabled={readOnly || undefined}
              className={cn(
                "flex shrink-0 items-center gap-2",
                readOnly && "opacity-50 select-none",
              )}
            >
              <NumberField
                value={providerHealthRefreshIntervalSeconds}
                min={0}
                step={PROVIDER_HEALTH_INTERVAL_STEP_SECONDS}
                size="sm"
                className="w-32"
                onValueChange={(value) =>
                  updateSettings(
                    backgroundActivityOverrideSettings(
                      settings.backgroundActivity,
                      resolvedBackgroundActivity,
                      {
                        providerHealthRefreshInterval: Duration.seconds(
                          normalizeIntervalSeconds(value),
                        ),
                      },
                    ),
                  )
                }
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement
                    aria-label={t("settings.general.background.interval.decrease", {
                      name: t("providers.healthCheck.title"),
                    })}
                  />
                  <NumberFieldInput
                    aria-label={t("settings.general.background.interval.inSeconds", {
                      name: t("providers.healthCheck.title"),
                    })}
                  />
                  <NumberFieldIncrement
                    aria-label={t("settings.general.background.interval.increase", {
                      name: t("providers.healthCheck.title"),
                    })}
                  />
                </NumberFieldGroup>
              </NumberField>
              <span className="text-xs text-muted-foreground">
                {t("providers.healthCheck.seconds")}
              </span>
            </div>
          }
        />
      </SettingsSection>

      {isAddInstanceDialogOpen ? (
        <AddProviderInstanceDialog
          open
          environmentId={environmentId}
          environmentLabel={environmentLabel}
          onOpenChange={setIsAddInstanceDialogOpen}
        />
      ) : null}
    </>
  );
}

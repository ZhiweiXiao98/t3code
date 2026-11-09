import {
  managedNightlyDeniedMessage,
  managedUpdatesDenial,
} from "../../i18n/managedPolicyMessages";
import type { WebTranslate } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

import type { ServerUpdateState } from "@t3tools/client-runtime/state/server";
import {
  type DesktopUpdateChannel,
  type EnvironmentId,
  type ServerConfig,
  type ServerSelfUpdateCapability,
} from "@t3tools/contracts";
import { cliReleaseChannelOf, desktopUpdateChannelOf } from "@t3tools/shared/cliRelease";
import { compareSemverVersions } from "@t3tools/shared/semver";

import {
  resolveServerSelfUpdateCapability,
  resolveVersionMismatch,
  supportsDesktopAppUpdate,
} from "~/versionSkew";
import type { ServerUpdateOutcome, ServerUpdateTarget } from "../ServerUpdateAction";

const translateEnglish: WebTranslate = (key, values) => translateWebMessage("en", key, values);

export interface UpdateEverythingMachine {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly serverConfig: {
    readonly environment: ServerConfig["environment"];
    readonly settings: Pick<ServerConfig["settings"], "continueThreadsAfterServerUpdate">;
    readonly managedPolicy?: ServerConfig["managedPolicy"];
  } | null;
  readonly connected: boolean;
  readonly hostedByThisApp: boolean;
  readonly canMaintain: boolean;
  readonly updateState: ServerUpdateState;
}

export interface RestartingMachine {
  readonly environmentId: EnvironmentId;
  readonly continuesThreads: boolean;
}

export function collectRestartingMachines(
  machines: ReadonlyArray<UpdateEverythingMachine>,
  servers: ReadonlyArray<Pick<ServerUpdateTarget, "environmentId">>,
  installsLocal: boolean,
): RestartingMachine[] {
  const updated = new Set(servers.map((server) => server.environmentId));
  return machines.flatMap((machine) => {
    const config = machine.serverConfig;
    if (
      config === null ||
      !machine.connected ||
      !(updated.has(machine.environmentId) || (installsLocal && machine.hostedByThisApp))
    ) {
      return [];
    }
    return [
      {
        environmentId: machine.environmentId,
        continuesThreads: config.settings.continueThreadsAfterServerUpdate === true,
      },
    ];
  });
}

export interface SkippedMachine {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly reason: string;
}

/** Skip current and app-hosted servers; the latter update with the app and would relaunch mid-run.
 * Desktop-managed servers use their own feed. Each server's updater checks that it can install the
 * release before it restarts, so no registry precheck runs here. */
export function collectServerUpdateTargets(
  machines: ReadonlyArray<UpdateEverythingMachine>,
  targetVersion: string,
  t: WebTranslate = translateEnglish,
): {
  readonly targets: ServerUpdateTarget[];
  readonly skipped: SkippedMachine[];
} {
  const targets: ServerUpdateTarget[] = [];
  const skipped: SkippedMachine[] = [];
  for (const machine of machines) {
    const config = machine.serverConfig;
    if (machine.hostedByThisApp) continue;
    if (
      config !== null &&
      resolveVersionMismatch(config.environment.serverVersion, targetVersion) === null
    ) {
      continue;
    }
    const skip = (reason: string) =>
      skipped.push({ environmentId: machine.environmentId, label: machine.label, reason });
    const unavailable = unavailableReason(machine, t);
    if (config === null || unavailable !== null) {
      skip(unavailable ?? t("updateEverything.notConnected"));
      continue;
    }
    const selfUpdate = resolveServerSelfUpdateCapability(config);
    const managedDenial = managedMachineUpdateDenial(
      config,
      selfUpdate === "desktop-managed" ? undefined : targetVersion,
      t,
    );
    if (managedDenial !== undefined) {
      skip(managedDenial);
      continue;
    }
    const desktopAppUpdate = supportsDesktopAppUpdate(config);
    if (selfUpdate === null) {
      skip(t("updateEverything.manualUpdate"));
      continue;
    }
    if (selfUpdate === "desktop-managed" && !desktopAppUpdate) {
      skip(t("updateEverything.newerDesktop"));
      continue;
    }
    const serverVersion = config.environment.serverVersion;
    if (
      selfUpdate !== "desktop-managed" &&
      cliReleaseChannelOf(serverVersion) !== cliReleaseChannelOf(targetVersion)
    ) {
      skip(t("updateEverything.channel", { channel: cliReleaseChannelOf(serverVersion) }));
      continue;
    }
    const target: ServerUpdateTarget = {
      environmentId: machine.environmentId,
      serverLabel: machine.label,
      selfUpdate,
      installation: config.environment.capabilities.serverInstallation,
      desktopAppUpdate,
      targetVersion,
    };
    targets.push(target);
  }
  return { targets, skipped };
}

function unavailableReason(machine: UpdateEverythingMachine, t: WebTranslate): string | null {
  if (machine.serverConfig === null || !machine.connected)
    return t("updateEverything.notConnected");
  if (!machine.canMaintain) return t("updateEverything.noPermission");
  if (machine.updateState.status === "running") return t("updateEverything.alreadyUpdating");
  return null;
}

/** The latest release on the track a fleet switches to, as npm reports it. */
export interface ChannelSwitchRelease {
  readonly channel: DesktopUpdateChannel;
  readonly version: string;
  readonly databaseMigration: number | undefined;
}

export const channelSwitchLabel = (channel: DesktopUpdateChannel) =>
  channel === "nightly" ? "Nightly" : "Stable";

/** Stable and Nightly each build their own commits, so either can hold migrations the other lacks.
 * Crossing tracks needs proof that the target release knows every migration the database holds. */
const crossesTrack = (fromVersion: string, release: ChannelSwitchRelease) =>
  desktopUpdateChannelOf(fromVersion) !== release.channel;

function channelSwitchBlockReason(
  fromVersion: string,
  release: ChannelSwitchRelease,
  currentMigration: number | undefined,
  t: WebTranslate,
): string | null {
  if (!crossesTrack(fromVersion, release)) return null;
  const from = channelSwitchLabel(desktopUpdateChannelOf(fromVersion));
  // Servers and releases from before this check report no migration number.
  if (currentMigration === undefined) {
    return t("updateEverything.databaseOldServer", { from });
  }
  if (release.databaseMigration === undefined) {
    return t("updateEverything.databaseOldRelease", {
      version: release.version,
      channel: channelSwitchLabel(release.channel),
    });
  }
  return currentMigration > release.databaseMigration
    ? t("updateEverything.databaseIncompatible", {
        version: release.version,
        from,
        channel: channelSwitchLabel(release.channel),
      })
    : null;
}

/** This app's reinstall restarts every server it hosts, so each of their databases must allow the
 * switch. `backendCount` is the desktop's own inventory: a backend still starting has no client
 * entry yet. A cached config can outlive its connection, so only a connected server's head counts. */
export function localSwitchBlockReason(
  appVersion: string,
  release: ChannelSwitchRelease,
  hosted: ReadonlyArray<{
    readonly connected: boolean;
    readonly databaseMigration: number | undefined;
  }>,
  backendCount: number,
  t: WebTranslate = translateEnglish,
): string | null {
  if (!crossesTrack(appVersion, release)) return null;
  if (
    hosted.length === 0 ||
    hosted.length < backendCount ||
    hosted.some((server) => !server.connected)
  ) {
    return t("updateEverything.databaseNotConnected");
  }
  return (
    hosted
      .map((server) => channelSwitchBlockReason(appVersion, release, server.databaseMigration, t))
      .find((reason) => reason !== null) ?? null
  );
}

/**
 * The server refuses these with the same message; say so before the run instead of after.
 * `targetVersion` is undefined when the server picks its own version, as desktop apps do.
 */
function managedMachineUpdateDenial(
  config: NonNullable<UpdateEverythingMachine["serverConfig"]>,
  targetVersion: string | undefined,
  t: WebTranslate,
): string | undefined {
  const policy = config.managedPolicy;
  return (
    managedUpdatesDenial(policy, t) ??
    (policy !== undefined &&
    policy.limits?.updates?.allowNightly === false &&
    targetVersion !== undefined &&
    cliReleaseChannelOf(targetVersion) !== "stable"
      ? managedNightlyDeniedMessage(policy.organization, t)
      : undefined)
  );
}

/** Servers move to the release; desktop-managed hosts reinstall their app on its track. A desktop
 * host already current gets a track-only request, since its saved track may still differ. */
export function collectChannelSwitchTargets(
  machines: ReadonlyArray<UpdateEverythingMachine>,
  release: ChannelSwitchRelease,
  t: WebTranslate = translateEnglish,
): { readonly targets: ServerUpdateTarget[]; readonly skipped: SkippedMachine[] } {
  const targets: ServerUpdateTarget[] = [];
  const skipped: SkippedMachine[] = [];
  for (const machine of machines) {
    const config = machine.serverConfig;
    if (machine.hostedByThisApp) continue;
    const skip = (reason: string) =>
      skipped.push({ environmentId: machine.environmentId, label: machine.label, reason });
    const target = (
      selfUpdate: ServerSelfUpdateCapability,
      targetVersion: string,
    ): ServerUpdateTarget => ({
      environmentId: machine.environmentId,
      serverLabel: machine.label,
      selfUpdate,
      installation: config?.environment.capabilities.serverInstallation,
      desktopAppUpdate: config !== null && supportsDesktopAppUpdate(config),
      targetVersion,
      ...(selfUpdate === "desktop-managed" ? { channel: release.channel } : {}),
      ...(release.databaseMigration === undefined
        ? {}
        : { targetDatabaseMigration: release.databaseMigration }),
    });
    const serverVersion = config?.environment.serverVersion;
    const sameTrack = serverVersion !== undefined && isOnTrack(serverVersion, release.channel);
    if (
      config !== null &&
      sameTrack &&
      resolveVersionMismatch(serverVersion, release.version) === null
    ) {
      const move = trackSwitchMove(config, true, t);
      if (
        !("skip" in move) &&
        move.selfUpdate === "desktop-managed" &&
        unavailableReason(machine, t) === null &&
        managedMachineUpdateDenial(config, release.version, t) === undefined
      ) {
        targets.push({ ...target(move.selfUpdate, serverVersion), trackOnly: true });
      }
      continue;
    }
    const unavailable = unavailableReason(machine, t);
    if (config === null || serverVersion === undefined || unavailable !== null) {
      skip(unavailable ?? t("updateEverything.notConnected"));
      continue;
    }
    const managedDenial = managedMachineUpdateDenial(config, release.version, t);
    if (managedDenial !== undefined) {
      skip(managedDenial);
      continue;
    }
    const move = trackSwitchMove(config, sameTrack, t);
    if ("skip" in move) {
      skip(move.skip);
      continue;
    }
    const blocked = channelSwitchBlockReason(
      serverVersion,
      release,
      config.environment.databaseMigration,
      t,
    );
    if (blocked !== null) {
      skip(blocked);
      continue;
    }
    // Service launchers only accept newer versions, so leaving for an older release is manual.
    if (
      move.selfUpdate === "boot-service" &&
      compareSemverVersions(release.version, serverVersion) <= 0
    ) {
      skip(
        t("updateEverything.downgradeCommand", {
          command: `t3 update --channel ${release.channel === "nightly" ? "nightly" : "stable"} --allow-downgrade`,
        }),
      );
      continue;
    }
    targets.push(target(move.selfUpdate, release.version));
  }
  return { targets, skipped };
}

/** A remote host on the other track that a switch can still move, for retrying a partial switch. */
export function awaitsTrackSwitch(
  machine: Pick<UpdateEverythingMachine, "serverConfig" | "hostedByThisApp">,
  channel: DesktopUpdateChannel,
): boolean {
  const config = machine.serverConfig;
  return (
    !machine.hostedByThisApp &&
    config !== null &&
    !isOnTrack(config.environment.serverVersion, channel) &&
    !("skip" in trackSwitchMove(config, false))
  );
}

function isOnTrack(version: string, channel: DesktopUpdateChannel): boolean {
  return cliReleaseChannelOf(version) !== "preview" && desktopUpdateChannelOf(version) === channel;
}

/** How a switch moves a host, or why it never can from here, whatever the release. */
function trackSwitchMove(
  config: NonNullable<UpdateEverythingMachine["serverConfig"]>,
  sameTrack: boolean,
  t: WebTranslate = translateEnglish,
): { readonly selfUpdate: ServerSelfUpdateCapability } | { readonly skip: string } {
  if (cliReleaseChannelOf(config.environment.serverVersion) === "preview") {
    return { skip: t("updateEverything.previewBuild") };
  }
  const selfUpdate = resolveServerSelfUpdateCapability(config);
  if (selfUpdate === null) return { skip: t("updateEverything.manualUpdate") };
  if (selfUpdate !== "desktop-managed") return { selfUpdate };
  if (config.environment.capabilities.desktopAppChannelSwitch !== true) {
    return { skip: t("updateEverything.newerDesktop") };
  }
  // Squirrel.Mac renames the bundle for the new track and then cannot relaunch it.
  if (!sameTrack && config.environment.platform.os === "darwin") {
    return { skip: t("updateEverything.switchOnMac") };
  }
  return { selfUpdate };
}

export interface UpdateEverythingSteps<Providers, Servers> {
  readonly downloadLocal?: () => Promise<boolean>;
  readonly updateProviders: () => Promise<Providers>;
  readonly updateServers: () => Promise<Servers>;
}

/** Finish provider installs before server restarts. Install this app last when localReady; failed
 * downloads skip only that install. */
export async function runUpdateEverything<Providers, Servers>(
  steps: UpdateEverythingSteps<Providers, Servers>,
): Promise<{
  readonly localReady: boolean;
  readonly providers: Providers;
  readonly servers: Servers;
}> {
  const [localReady, remote] = await Promise.all([
    steps.downloadLocal?.() ?? Promise.resolve(true),
    steps
      .updateProviders()
      .then(async (providers) => ({ providers, servers: await steps.updateServers() })),
  ]);
  return { localReady, ...remote };
}

export type UpdateRunMachineStatus =
  | "providers"
  | "waiting"
  | "downloading"
  | "restarting"
  | "done"
  | "failed";

export interface UpdateRunMachine {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly updatesProviders: boolean;
  readonly server: ServerUpdateTarget | null;
  readonly handedOffVersion: string | null;
  readonly startedAt: number;
  readonly result: "done" | "failed" | null;
  readonly failure: string | null;
  readonly providerFailure: string | null;
}

export interface UpdateEverythingRun {
  /** Track switches retry through their planner, which re-checks each database. */
  readonly trackSwitch?: boolean;
  readonly localVersion: string | null;
  readonly phase: "providers" | "servers" | "countdown" | "installing";
  readonly restartAt: number | null;
  readonly machines: ReadonlyArray<UpdateRunMachine>;
}

export function resolveUpdateRunMachineStatus(
  machine: UpdateRunMachine,
  phase: UpdateEverythingRun["phase"],
  serverState: ServerUpdateState,
): UpdateRunMachineStatus {
  if (machine.result !== null) return machine.result;
  if (machine.handedOffVersion !== null) return "restarting";
  if (phase === "providers" && machine.updatesProviders) return "providers";
  if (machine.server !== null && serverState.status === "running") {
    return serverState.stage === "resuming" ? "restarting" : "downloading";
  }
  return "waiting";
}

export function isServerUpdateHandedOff(state: ServerUpdateState): boolean {
  return state.status === "running" && state.stage === "resuming";
}

export function closeFinishedUpdateRun(run: UpdateEverythingRun): UpdateEverythingRun | null {
  return run.phase === "servers" &&
    run.localVersion === null &&
    run.machines.every((machine) => machine.result === "done")
    ? null
    : run;
}

const UPDATE_SLOW_AFTER_MS = 3 * 60 * 1000;

export function formatUpdateElapsed(ms: number, t: WebTranslate = translateEnglish): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t("updateEverything.elapsedLessMinute");
  if (minutes < 60) return t("updateEverything.elapsedMinutes", { minutes });
  return t("updateEverything.elapsedHours", {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
}

export interface UpdateRunMachineView {
  readonly machine: UpdateRunMachine;
  readonly status: UpdateRunMachineStatus;
}

export type UpdateRunLocalState =
  | { readonly status: "downloading"; readonly percent: number | null }
  | { readonly status: "waiting" }
  | null;

export interface UpdateCapsuleView {
  readonly tone: "default" | "slow" | "failed";
  readonly label: string;
  readonly slow?: { readonly status: string; readonly elapsed: string };
  readonly action: "later" | "retry" | "dismiss" | null;
}

const isActive = (status: UpdateRunMachineStatus) => status !== "done" && status !== "failed";

export function describeUpdateCapsule(
  run: UpdateEverythingRun,
  machines: ReadonlyArray<UpdateRunMachineView>,
  local: UpdateRunLocalState,
  now: number,
  t: WebTranslate = translateEnglish,
): UpdateCapsuleView {
  if (run.phase === "countdown" && run.restartAt !== null) {
    const seconds = Math.max(0, Math.ceil((run.restartAt - now) / 1000));
    return {
      tone: "default",
      label: t("updateEverything.restartSeconds", { seconds }),
      action: "later",
    };
  }
  if (run.phase === "installing") {
    return { tone: "default", label: t("updateEverything.restarting"), action: null };
  }
  const active = machines.filter(({ status }) => isActive(status) && status !== "waiting");
  const slowest = active.toSorted((a, b) => a.machine.startedAt - b.machine.startedAt)[0];
  if (slowest && now - slowest.machine.startedAt >= UPDATE_SLOW_AFTER_MS) {
    return {
      tone: "slow",
      label: slowest.machine.label,
      slow: {
        status: getUpdateRunStatusLabel(slowest.status, t),
        elapsed: formatUpdateElapsed(now - slowest.machine.startedAt, t),
      },
      action: null,
    };
  }
  const done = machines.filter(({ status }) => status === "done").length;
  if (machines.some(({ status }) => isActive(status))) {
    return {
      tone: "default",
      label: t("updateEverything.updatedProgress", { done, total: machines.length }),
      action: null,
    };
  }
  if (local?.status === "downloading") {
    return {
      tone: "default",
      label: t("updateEverything.downloadingProgress", {
        progress: local.percent === null ? "" : ` ${Math.floor(local.percent)}%`,
      }),
      action: null,
    };
  }
  const failed = machines.filter(({ status }) => status === "failed");
  if (failed.length > 0) {
    return {
      tone: "failed",
      label:
        failed.length === 1
          ? t("updateEverything.failedMachine", { machine: failed[0]!.machine.label })
          : t("updateEverything.failedCount", { count: failed.length }),
      action:
        !run.trackSwitch && failed.some(({ machine }) => machine.server !== null)
          ? "retry"
          : "dismiss",
    };
  }
  return {
    tone: "default",
    label: t("updateEverything.updatedProgress", { done, total: machines.length }),
    action: null,
  };
}

const RUN_STATUS_MESSAGE_KEYS = {
  providers: "updateEverything.status.providers",
  waiting: "updateEverything.status.waiting",
  downloading: "updateEverything.status.downloading",
  restarting: "updateEverything.status.restarting",
  done: "updateEverything.status.done",
  failed: "updateEverything.status.failed",
} as const;

export function getUpdateRunStatusLabel(
  status: UpdateRunMachineStatus,
  t: WebTranslate = translateEnglish,
): string {
  return t(RUN_STATUS_MESSAGE_KEYS[status]);
}

export interface UpdateEverythingResult {
  readonly localVersion: string | null;
  readonly updatedServers: number;
  readonly updatedProviders: number;
  readonly failures: ReadonlyArray<string>;
  readonly restarting: ReadonlyArray<string>;
}

export function collectUpdateEverythingResult(
  input: {
    readonly localVersion: string | null;
    readonly localFailures: ReadonlyArray<string>;
    readonly servers: ReadonlyArray<{
      readonly label: string;
      readonly outcome: ServerUpdateOutcome;
    }>;
    readonly providers: ReadonlyArray<
      | { readonly status: "interrupted" | "updated" }
      | { readonly status: "failed"; readonly line: string }
    >;
  },
  t: WebTranslate = translateEnglish,
): UpdateEverythingResult {
  return {
    localVersion: input.localVersion,
    updatedServers: input.servers.filter(({ outcome }) => outcome.status === "updated").length,
    updatedProviders: input.providers.filter((outcome) => outcome.status === "updated").length,
    restarting: [],
    failures: [
      ...input.localFailures.map((failure) => t("updateEverything.localFailure", { failure })),
      ...input.servers.flatMap(({ label, outcome }) =>
        outcome.status === "failed" ? [`${label}: ${outcome.message}`] : [],
      ),
      ...input.providers.flatMap((outcome) => (outcome.status === "failed" ? [outcome.line] : [])),
    ],
  };
}

export function getUpdateEverythingToastView(
  result: UpdateEverythingResult,
  appVersion: string,
  t: WebTranslate = translateEnglish,
): {
  readonly type: "success" | "error";
  readonly title: string;
  readonly description?: string;
} | null {
  const parts = [
    result.localVersion !== null && result.localVersion === appVersion
      ? t("updateEverything.thisAppLower")
      : null,
    countLabel(result.updatedServers, "server", t),
    countLabel(result.updatedProviders, "provider", t),
  ].filter((part) => part !== null);
  const restarting =
    result.restarting.length === 0
      ? []
      : [
          t(
            result.restarting.length === 1
              ? "updateEverything.stillRestartingOne"
              : "updateEverything.stillRestartingMany",
            { machines: joinList(result.restarting, t) },
          ),
        ];
  if (result.failures.length === 0) {
    if (parts.length === 0) return null;
    return {
      type: "success",
      title: t("updateEverything.updatedSummary", { items: joinList(parts, t) }),
      ...(restarting.length === 0 ? {} : { description: restarting.join("\n") }),
    };
  }
  return {
    type: "error",
    title:
      parts.length === 0
        ? t("updateEverything.failed")
        : t("updateEverything.updatedSummary", { items: joinList(parts, t) }),
    description: [...result.failures, ...restarting].join("\n"),
  };
}

export interface UpdateEverythingPlan {
  readonly localVersion: string | null;
  /** Machines whose servers this app hosts; this app's update restarts them. */
  readonly localMachines: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  readonly servers: ReadonlyArray<
    Pick<ServerUpdateTarget, "environmentId" | "serverLabel" | "selfUpdate" | "targetVersion">
  >;
  readonly providerMachines: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
    readonly providers: ReadonlyArray<string>;
  }>;
  readonly skipped: ReadonlyArray<SkippedMachine>;
}

export interface UpdateEverythingRow {
  readonly environmentId: EnvironmentId | null;
  readonly label: string;
  readonly app: "this-app" | "server" | "desktop-app" | null;
  readonly skipped: string | null;
  readonly providers: ReadonlyArray<string>;
}

function countLabel(count: number, noun: "server" | "provider", t: WebTranslate): string | null {
  if (count === 0) return null;
  return t(
    noun === "server"
      ? count === 1
        ? "updateEverything.serverOne"
        : "updateEverything.serverMany"
      : count === 1
        ? "updateEverything.providerOne"
        : "updateEverything.providerMany",
    { count },
  );
}

function joinList(parts: ReadonlyArray<string>, t: WebTranslate): string {
  if (parts.length <= 2) return parts.join(t("updateEverything.listAnd"));
  return t("updateEverything.listLast", {
    items: parts.slice(0, -1).join(t("updateEverything.listSeparator")),
    last: parts.at(-1)!,
  });
}

/** One row per machine: this app's machines first, then servers, provider-only, and skipped. */
export function describeUpdateEverything(
  plan: UpdateEverythingPlan,
  t: WebTranslate = translateEnglish,
): {
  readonly summary: string;
  readonly version: string | null;
  readonly providerCount: number;
  readonly rows: ReadonlyArray<UpdateEverythingRow>;
} {
  const providerCount = plan.providerMachines.reduce(
    (count, machine) => count + machine.providers.length,
    0,
  );
  const summary = t("updateEverything.updateSummary", {
    items: joinList(
      [
        plan.localVersion ? t("updateEverything.thisAppLower") : null,
        countLabel(plan.servers.length, "server", t),
        countLabel(providerCount, "provider", t),
      ].filter((part) => part !== null),
      t,
    ),
  });

  const rows = new Map<EnvironmentId | null, UpdateEverythingRow>();
  const update = (
    environmentId: EnvironmentId | null,
    label: string,
    change: Partial<UpdateEverythingRow>,
  ) => {
    const row = rows.get(environmentId) ?? {
      environmentId,
      label,
      app: null,
      skipped: null,
      providers: [],
    };
    rows.set(environmentId, { ...row, ...change });
  };
  if (plan.localVersion) {
    if (plan.localMachines.length === 0)
      update(null, t("updateEverything.thisApp"), { app: "this-app" });
    for (const machine of plan.localMachines) {
      update(machine.environmentId, machine.label, { app: "this-app" });
    }
  }
  for (const server of plan.servers) {
    update(server.environmentId, server.serverLabel, {
      app: server.selfUpdate === "desktop-managed" ? "desktop-app" : "server",
    });
  }
  for (const machine of plan.providerMachines) {
    update(machine.environmentId, machine.label, { providers: machine.providers });
  }
  for (const machine of plan.skipped) {
    update(machine.environmentId, machine.label, { skipped: machine.reason });
  }

  return {
    summary,
    version:
      plan.localVersion ??
      plan.servers.find((server) => server.selfUpdate !== "desktop-managed")?.targetVersion ??
      null,
    providerCount,
    rows: Array.from(rows.values()),
  };
}

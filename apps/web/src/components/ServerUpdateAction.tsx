import {
  serverUpdateFailureMessage,
  serverUpdateStateFailureMessage,
} from "../i18n/serverUpdateFailureMessages";
import { managedUpdatesDenial } from "../i18n/managedPolicyMessages";
import { useI18n, type WebTranslate } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";
import { useStableCallback } from "~/hooks/useStableCallback";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthEnvironmentMaintainScope,
  type AuthSessionState,
  sessionGrantsScope,
} from "@t3tools/contracts";
import type { AsyncResult } from "effect/reactivity";
import { environmentSession } from "~/state/session";
import type {
  DesktopUpdateChannel,
  EnvironmentId,
  ServerInstallation,
  ServerSelfUpdateCapability,
} from "@t3tools/contracts";
import type { ServerUpdateStage, ServerUpdateState } from "@t3tools/client-runtime/state/server";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { CircleArrowUpIcon } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";

import { requestConfirmDialog } from "~/confirmDialog";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { serverEnvironment, updateOutdatedServer } from "~/state/server";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useAtomCommand } from "~/state/use-atom-command";
import { useServerConfigs } from "~/state/entities";
import { useManagedPolicy } from "~/state/managedPolicy";
import { environmentPresentations } from "~/state/presentation";
import { ManagedControl } from "./ManagedPolicy";
import { manualServerUpdateCommand } from "~/versionSkew";
import { crossesReleaseTrack } from "@t3tools/shared/cliRelease";
import { Button } from "./ui/button";
import { toastManager } from "./ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const UPDATE_STAGE_LABELS: Record<ServerUpdateStage, string> = {
  downloading: "Downloading…",
  installing: "Downloading…",
  resuming: "Restarting…",
};
const pendingUpdateEnvironmentIds = new Set<EnvironmentId>();

export function serverUpdateStageLabel(
  stage: ServerUpdateStage,
  translate: (source: string) => string = (source) => source,
): string {
  return translate(UPDATE_STAGE_LABELS[stage]);
}

/** Why the environment's policy refuses server updates, read outside render. */
function readUpdatesDenial(environmentId: EnvironmentId, t: WebTranslate): string | undefined {
  return managedUpdatesDenial(
    appAtomRegistry.get(environmentPresentations.serverConfigsAtom).get(environmentId)
      ?.managedPolicy,
    t,
  );
}

const CROSS_TRACK_NOTE = "Switch tracks in About → Update track";

/** Hosts refuse a Stable/Nightly crossing outside a track switch, which checks the database first. */
function refusedCrossing(
  target: {
    readonly selfUpdate: ServerSelfUpdateCapability | null;
    readonly targetVersion: string;
    readonly channel?: DesktopUpdateChannel | undefined;
  },
  serverVersion: string | undefined,
): boolean {
  return (
    target.channel === undefined &&
    target.selfUpdate !== null &&
    serverVersion !== undefined &&
    crossesReleaseTrack(serverVersion, target.targetVersion)
  );
}

function CrossTrackNote() {
  const { locale } = useI18n();
  const translate = (source: string) => translateWebSource(locale, source);

  return <span className="text-muted-foreground text-xs">{translate(CROSS_TRACK_NOTE)}</span>;
}

export interface ServerUpdateTarget {
  readonly environmentId: EnvironmentId;
  readonly serverLabel: string;
  readonly selfUpdate: ServerSelfUpdateCapability | null;
  readonly installation?: ServerInstallation | undefined;
  readonly desktopAppUpdate?: boolean;
  readonly targetVersion: string;
  /** Set only by a track switch; the host's desktop app moves to this track. */
  readonly channel?: DesktopUpdateChannel;
  /** A track switch's checked release migration; the host re-checks its own database. */
  readonly targetDatabaseMigration?: number;
  /** The host already runs its track's newest build and only saves the track. */
  readonly trackOnly?: boolean;
}

type UpdateButtonProps = Pick<ComponentProps<typeof Button>, "variant" | "size" | "className"> & {
  readonly label?: string;
  readonly appearance?: "button" | "icon";
};

export type ServerUpdateOutcome =
  | { readonly status: "updated" | "skipped" }
  | { readonly status: "failed"; readonly message: string };

/** Toasts its success or failure unless `quiet`; never rejects. */
export function useServerUpdate() {
  const { locale, t } = useI18n();
  const failureMessage = useStableCallback((error: unknown) =>
    serverUpdateFailureMessage(locale, error),
  );
  const actionT = useStableCallback(t);

  const updateServer = useAtomCommand(serverEnvironment.updateServer, { reportFailure: false });
  return async (
    target: ServerUpdateTarget,
    { quiet = false }: { readonly quiet?: boolean } = {},
  ): Promise<ServerUpdateOutcome> => {
    const { environmentId, serverLabel, selfUpdate, targetVersion } = target;
    const denial = readUpdatesDenial(environmentId, actionT);
    if (denial !== undefined) {
      if (!quiet) {
        toastManager.add({
          type: "error",
          title: actionT("coreResidual.notUpdated", { server: serverLabel }),
          description: denial,
        });
      }
      return { status: "failed", message: denial };
    }
    if (
      !canUpdateServer(appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId))) ||
      pendingUpdateEnvironmentIds.has(environmentId)
    )
      return { status: "skipped" };
    pendingUpdateEnvironmentIds.add(environmentId);
    const result = await updateServer({
      environmentId,
      input: {
        targetVersion,
        ...(target.channel === undefined ? {} : { channel: target.channel }),
        ...(target.targetDatabaseMigration === undefined
          ? {}
          : { targetDatabaseMigration: target.targetDatabaseMigration }),
      },
    });
    pendingUpdateEnvironmentIds.delete(environmentId);
    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) return { status: "skipped" };
      const message = failureMessage(squashAtomCommandFailure(result));
      if (!quiet) {
        toastManager.add({
          type: "error",
          title: actionT("coreResidual.updateFailed", { server: serverLabel }),
          description: message,
        });
      }
      return { status: "failed", message };
    }
    if (!quiet) {
      toastManager.add({
        type: "success",
        title: actionT("coreResidual.updated", { server: serverLabel }),
        description:
          selfUpdate === "desktop-managed"
            ? actionT("coreResidual.relaunched", { version: result.value.targetVersion })
            : actionT("coreResidual.reconnected", { version: result.value.targetVersion }),
      });
    }
    return { status: "updated" };
  };
}

export function ServerUpdatesAction({
  targets,
  label,
  variant = "outline",
  size = "xs",
  className,
}: UpdateButtonProps & {
  readonly targets: ReadonlyArray<ServerUpdateTarget>;
}) {
  const { locale, t } = useI18n();
  const translate = (source: string) => translateWebSource(locale, source);

  const actionT = useStableCallback(t);
  const update = useServerUpdate();
  const serverConfigs = useServerConfigs();
  const pending = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const eligible = targets.filter(
    (target) =>
      target.selfUpdate !== null &&
      (target.selfUpdate !== "desktop-managed" || target.desktopAppUpdate) &&
      managedUpdatesDenial(serverConfigs.get(target.environmentId)?.managedPolicy, t) ===
        undefined &&
      !refusedCrossing(target, serverConfigs.get(target.environmentId)?.environment.serverVersion),
  );
  const handleUpdate = async () => {
    if (pending.current) return;
    pending.current = true;
    setIsPending(true);
    await settlePromise(async () => {
      const available = eligible.filter(
        (target) => !pendingUpdateEnvironmentIds.has(target.environmentId),
      );
      const desktopTargets = available.filter((target) => target.selfUpdate === "desktop-managed");
      if (desktopTargets.length > 0) {
        const confirmed =
          (await requestConfirmDialog(
            actionT("coreResidual.confirmAll", {
              servers: desktopTargets.map((target) => target.serverLabel).join(", "),
            }),
          )) ?? true;
        if (!confirmed) return;
      }
      await Promise.all(available.map((target) => update(target)));
    });
    pending.current = false;
    setIsPending(false);
  };
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={isPending || eligible.length === 0}
      onClick={() => void handleUpdate()}
    >
      {label ?? translate("Update all")}
    </Button>
  );
}

export function canUpdateServer(
  result: AsyncResult.AsyncResult<AuthSessionState, unknown>,
): boolean {
  if (result._tag !== "Success" || !result.value.authenticated) return false;
  return sessionGrantsScope(result.value, AuthEnvironmentMaintainScope);
}

export function ServerUpdateProgress({
  state,
}: {
  readonly state: Exclude<ServerUpdateState, { status: "idle" }>;
}) {
  const { locale } = useI18n();
  const translate = (source: string) => translateWebSource(locale, source);
  if (state.status === "failed") {
    const message = serverUpdateStateFailureMessage(locale, state);
    return (
      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-destructive" role="alert">
        <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger render={<span className="min-w-0 truncate">{message}</span>} />
          <TooltipPopup side="top">{message}</TooltipPopup>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-2 text-xs font-medium text-foreground">
      <span className="size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden="true" />
      <span>{serverUpdateStageLabel(state.stage, translate)}</span>
    </div>
  );
}

/** client-runtime owns self-updates so unmounting during reconnect preserves operation state. */
export function ServerUpdateAction({
  environmentId,
  serverLabel,
  selfUpdate,
  installation,
  desktopAppUpdate = false,
  targetVersion,
  channel,
  label,
  variant = "outline",
  size = "xs",
  className,
  appearance = "button",
}: ServerUpdateTarget & UpdateButtonProps) {
  const isDesktopAppUpdate = selfUpdate === "desktop-managed";
  const serverVersion = useServerConfigs().get(environmentId)?.environment.serverVersion;
  const sessionStateAtom = environmentSession.sessionStateAtom(environmentId);
  const canUpdate = useAtomValue(sessionStateAtom, canUpdateServer);
  const { locale, t } = useI18n();
  const updatesDenial = managedUpdatesDenial(useManagedPolicy(environmentId), t);
  const translate = (source: string) => translateWebSource(locale, source);
  const translateAction = useStableCallback(translate);
  const actionT = useStableCallback(t);
  const update = useServerUpdate();
  const { copyToClipboard } = useCopyToClipboard<{ command: string }>({
    target:
      installation?.kind === "npm-global"
        ? translate("update command")
        : translate("relaunch command"),
    onCopy: ({ command }) => {
      toastManager.add({
        type: "success",
        title:
          installation?.kind === "npm-global"
            ? translateAction("Update command copied")
            : translateAction("Relaunch command copied"),
        description:
          installation?.kind === "npm-global"
            ? actionT("coreResidual.runUpdate", { command, server: serverLabel })
            : actionT("coreResidual.runRelaunch", { command, server: serverLabel }),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: translateAction("Could not copy update command"),
        description: error.message,
      });
    },
  });

  const handleUpdate = async () => {
    if (
      !canUpdateServer(appAtomRegistry.get(sessionStateAtom)) ||
      pendingUpdateEnvironmentIds.has(environmentId)
    ) {
      return;
    }
    if (isDesktopAppUpdate) {
      const confirmed =
        (await requestConfirmDialog(
          actionT("coreResidual.confirmUpdate", { server: serverLabel }),
        )) ?? true;
      if (!confirmed) {
        return;
      }
    }
    if (!canUpdateServer(appAtomRegistry.get(sessionStateAtom))) return;
    await update({
      environmentId,
      serverLabel,
      selfUpdate,
      desktopAppUpdate,
      targetVersion,
    });
  };

  if (updatesDenial !== undefined) {
    return appearance === "icon" ? (
      <ManagedControl reason={updatesDenial}>
        <Button size="icon-xs" variant="ghost-muted" aria-label={updatesDenial} disabled>
          <CircleArrowUpIcon className="size-3.5" />
        </Button>
      </ManagedControl>
    ) : (
      <span className="text-muted-foreground text-xs">{updatesDenial}</span>
    );
  }

  if (selfUpdate === "desktop-managed" && !desktopAppUpdate) {
    return (
      <span className="text-muted-foreground text-xs">
        {translate("Update the desktop app on that machine to update this server.")}
      </span>
    );
  }

  if (refusedCrossing({ selfUpdate, targetVersion, channel }, serverVersion)) {
    return <CrossTrackNote />;
  }

  const manualCommand =
    selfUpdate === null ? manualServerUpdateCommand(targetVersion, installation) : null;
  const actionLabel =
    manualCommand !== null
      ? installation?.kind === "npm-global"
        ? translate("Copy update command")
        : translate("Copy relaunch command")
      : (label ?? translate("Update"));
  const onClick =
    manualCommand !== null
      ? () => copyToClipboard(manualCommand, { command: manualCommand })
      : () => void handleUpdate();

  if (appearance === "icon") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost-muted"
              className={className}
              aria-label={t("coreResidual.actionFor", { action: actionLabel, server: serverLabel })}
              disabled={manualCommand === null && !canUpdate}
              onClick={onClick}
            />
          }
        >
          <CircleArrowUpIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="top">{actionLabel}</TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={manualCommand === null && !canUpdate}
      onClick={onClick}
    >
      {actionLabel}
    </Button>
  );
}

/** Read the host descriptor's version because the host never delivers server config. */
export function OutdatedServerUpdateAction({
  environmentId,
  serverLabel,
  fromVersion,
  targetVersion,
  label,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverLabel: string;
  readonly fromVersion: string | undefined;
  readonly targetVersion: string;
  readonly label?: string;
}) {
  const { locale, t } = useI18n();
  const translate = (source: string) => translateWebSource(locale, source);
  const failureMessage = useStableCallback((error: unknown) =>
    serverUpdateFailureMessage(locale, error),
  );
  const actionT = useStableCallback(t);
  const update = useAtomCommand(updateOutdatedServer, { reportFailure: false });
  const handleUpdate = async () => {
    if (pendingUpdateEnvironmentIds.has(environmentId)) return;
    pendingUpdateEnvironmentIds.add(environmentId);
    const result = await update({
      environmentId,
      input: { targetVersion },
      ...(fromVersion === undefined ? {} : { fromVersion }),
    });
    pendingUpdateEnvironmentIds.delete(environmentId);
    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) return;
      toastManager.add({
        type: "error",
        title: actionT("coreResidual.updateFailed", { server: serverLabel }),
        description: failureMessage(squashAtomCommandFailure(result)),
      });
      return;
    }
    toastManager.add({
      type: "success",
      title: actionT("coreResidual.updated", { server: serverLabel }),
      description: actionT("coreResidual.reconnected", { version: result.value.targetVersion }),
    });
  };
  if (fromVersion !== undefined && crossesReleaseTrack(fromVersion, targetVersion)) {
    return <CrossTrackNote />;
  }
  return (
    <Button size="xs" variant="outline" onClick={() => void handleUpdate()}>
      {label ?? translate("Update")}
    </Button>
  );
}

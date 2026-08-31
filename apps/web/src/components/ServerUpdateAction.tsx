import type { EnvironmentId, ServerSelfUpdateCapability } from "@t3tools/contracts";
import type { ServerUpdateStage, ServerUpdateState } from "@t3tools/client-runtime/state/server";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useI18n, type WebTranslate } from "~/i18n/WebI18nProvider";
import { translateWebMessage, type WebMessageKey } from "~/i18n/messages";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { manualServerUpdateCommand } from "~/versionSkew";
import { Button } from "./ui/button";
import { toastManager } from "./ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

// The wire "installing" stage is a sub-second launcher handoff, so the UI
// folds it into the download phase; everything after the handoff is the
// restart the user is actually waiting through.
const UPDATE_STAGE_MESSAGE_KEYS: Record<ServerUpdateStage, WebMessageKey> = {
  downloading: "serverUpdate.stage.downloading",
  installing: "serverUpdate.stage.downloading",
  resuming: "serverUpdate.stage.restarting",
};
const pendingUpdateEnvironmentIds = new Set<EnvironmentId>();

export function serverUpdateStageLabel(stage: ServerUpdateStage, translate?: WebTranslate): string {
  const t = translate ?? ((key, values) => translateWebMessage("en", key, values));
  return t(UPDATE_STAGE_MESSAGE_KEYS[stage]);
}

function updateFailureMessage(error: unknown, t: WebTranslate): string {
  return error instanceof Error ? error.message : t("serverUpdate.failure.default");
}

/**
 * One-row status for an in-flight server update: "Downloading…" then
 * "Restarting…". The update is a wait, not a warning: a single pulsing dot
 * and label, no step rail, no versions. Failure turns the row red with the
 * rollback reason.
 */
export function ServerUpdateProgress({
  state,
}: {
  readonly state: Exclude<ServerUpdateState, { status: "idle" }>;
}) {
  const { t } = useI18n();
  if (state.status === "failed") {
    return (
      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-destructive" role="alert">
        <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger render={<span className="min-w-0 truncate">{state.message}</span>} />
          <TooltipPopup side="top" className="max-w-80">
            {state.message}
          </TooltipPopup>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-2 text-xs font-medium text-foreground">
      <span
        className="size-1.5 shrink-0 animate-status-pulse rounded-full bg-foreground"
        aria-hidden="true"
      />
      <span>{serverUpdateStageLabel(state.stage, t)}</span>
    </div>
  );
}

/**
 * Offers the update path advertised by a version-skewed server. Self-updates
 * delegate their full lifecycle to client-runtime so this component can
 * unmount during reconnect without losing operation state.
 */
export function ServerUpdateAction({
  environmentId,
  serverLabel,
  selfUpdate,
  targetVersion,
  label,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverLabel: string;
  readonly selfUpdate: ServerSelfUpdateCapability | null;
  readonly targetVersion: string;
  readonly label?: string;
}) {
  const { t } = useI18n();
  const updateServer = useAtomCommand(serverEnvironment.updateServer, {
    reportFailure: false,
  });
  const { copyToClipboard } = useCopyToClipboard<{ command: string }>({
    target: "update command",
    onCopy: ({ command }) => {
      toastManager.add({
        type: "success",
        title: t("serverUpdate.commandCopied"),
        description: t("serverUpdate.commandCopiedDescription", {
          command,
          server: serverLabel,
        }),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("serverUpdate.copyFailed"),
        description: error.message,
      });
    },
  });

  const handleUpdate = async () => {
    if (pendingUpdateEnvironmentIds.has(environmentId)) {
      return;
    }
    pendingUpdateEnvironmentIds.add(environmentId);
    try {
      const result = await updateServer({
        environmentId,
        input: { targetVersion },
      });
      if (result._tag === "Failure") {
        if (isAtomCommandInterrupted(result)) {
          return;
        }
        toastManager.add({
          type: "error",
          title: t("serverUpdate.failed"),
          description: updateFailureMessage(squashAtomCommandFailure(result), t),
        });
        return;
      }
      toastManager.add({
        type: "success",
        title: t("serverUpdate.updated", { server: serverLabel }),
        description: t("serverUpdate.reconnected", { version: result.value.targetVersion }),
      });
    } finally {
      pendingUpdateEnvironmentIds.delete(environmentId);
    }
  };

  if (selfUpdate === "desktop-managed") {
    return (
      <span className="text-muted-foreground text-xs">{t("serverUpdate.desktopManaged")}</span>
    );
  }

  if (selfUpdate === null) {
    const command = manualServerUpdateCommand(targetVersion);
    return (
      <Button size="xs" variant="outline" onClick={() => copyToClipboard(command, { command })}>
        {t("serverUpdate.copyCommand")}
      </Button>
    );
  }

  return (
    <Button size="xs" onClick={() => void handleUpdate()}>
      {label ?? t("serverUpdate.action")}
    </Button>
  );
}

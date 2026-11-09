import { useI18n } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";
import type { DeviceServiceState, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { deviceEnvironment } from "~/state/device";
import { useAtomCommand } from "~/state/use-atom-command";

export function DeviceHostUpdates({
  state,
  environmentId,
}: {
  state: DeviceServiceState;
  environmentId: EnvironmentId;
}) {
  const { locale: newCopyLocale } = useI18n();
  const retry = useAtomCommand(deviceEnvironment.list);
  const [pending, setPending] = useState<string | null>(null);
  if (state.hostStatus === "disabled") return null;
  return (
    <div className="space-y-2">
      {state.hosts.map((host) => {
        const status = state.hostStatuses[host.id];
        if (!status || !["installing", "starting", "failed"].includes(status.status)) return null;
        const failed = status.status === "failed";
        return (
          <div
            key={host.id}
            role={failed ? "alert" : "status"}
            className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{host.label}</p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {status.detail ??
                  (failed
                    ? translateWebSource(newCopyLocale, "Device support could not start.")
                    : status.status === "installing"
                      ? translateWebSource(newCopyLocale, "Installing device tools…")
                      : translateWebSource(newCopyLocale, "Starting device tools…"))}
              </p>
              {failed ? (
                <p className="mt-1 text-muted-foreground">
                  {translateWebSource(
                    newCopyLocale,
                    "Check the host connection and network access, then retry. Your device settings are saved.",
                  )}
                </p>
              ) : null}
            </div>
            {failed && state.supportsHostRetry ? (
              <Button
                size="compact"
                variant="outline"
                disabled={pending !== null}
                onClick={() => {
                  setPending(host.id);
                  void retry({ environmentId, input: { retryHostId: host.id } }).finally(() =>
                    setPending(null),
                  );
                }}
              >
                {pending === host.id
                  ? translateWebSource(newCopyLocale, "Retrying…")
                  : translateWebSource(newCopyLocale, "Retry")}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

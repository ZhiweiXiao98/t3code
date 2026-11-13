import { useI18n } from "~/i18n/WebI18nContext";
import { AuthDiagnosticsReadScope } from "@t3tools/contracts";
import { AuthEnvironmentMaintainScope } from "@t3tools/contracts";
import type {
  EnvironmentId,
  ResourceTelemetryHistoryInput,
  ResourceTelemetrySnapshot,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";

import { usePrimaryEnvironment } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";

export interface ResourceTelemetryState {
  readonly data: ResourceTelemetrySnapshot | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
  readonly retry: () => Promise<ResourceTelemetrySnapshot>;
}

export function useResourceTelemetry(
  targetEnvironmentId?: EnvironmentId | null,
): ResourceTelemetryState {
  const { t } = useI18n();
  const primaryEnvironment = usePrimaryEnvironment();
  const environmentId =
    targetEnvironmentId === undefined
      ? (primaryEnvironment?.environmentId ?? null)
      : targetEnvironmentId;
  const canReadDiagnostics = useEnvironmentScope(environmentId, AuthDiagnosticsReadScope);
  const query = useEnvironmentQuery(
    environmentId === null || !canReadDiagnostics
      ? null
      : serverEnvironment.resourceTelemetry({ environmentId, input: {} }),
  );
  const retryCommand = useAtomCommand(serverEnvironment.retryResourceTelemetry, {
    reportFailure: false,
  });
  const retry = async () => {
    if (environmentId === null) {
      throw new Error("No environment is selected.");
    }
    if (
      !readEnvironmentScope(environmentId, AuthEnvironmentMaintainScope) ||
      !readEnvironmentScope(environmentId, AuthDiagnosticsReadScope)
    ) {
      throw new Error(t("audit10.monitorPermission"));
    }
    const result = await retryCommand({ environmentId, input: {} });
    if (result._tag === "Failure") {
      throw Cause.squash(result.cause);
    }
    query.refresh();
    return result.value.snapshot;
  };

  return { ...query, retry };
}

export function useResourceTelemetryHistory(
  input: ResourceTelemetryHistoryInput,
  targetEnvironmentId?: EnvironmentId | null,
) {
  const primaryEnvironment = usePrimaryEnvironment();
  const environmentId =
    targetEnvironmentId === undefined
      ? (primaryEnvironment?.environmentId ?? null)
      : targetEnvironmentId;
  const canReadDiagnostics = useEnvironmentScope(environmentId, AuthDiagnosticsReadScope);
  return useEnvironmentQuery(
    environmentId === null || !canReadDiagnostics
      ? null
      : serverEnvironment.resourceTelemetryHistory({ environmentId, input }),
  );
}

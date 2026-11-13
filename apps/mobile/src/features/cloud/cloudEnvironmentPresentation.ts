import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
import { ORCHESTRATION_PROTOCOL_VERSION } from "@t3tools/contracts";
import type { RelayEnvironmentStatusResponse } from "@t3tools/contracts/relay";
import {
  orchestrationProtocolCompatibilityError,
  type EnvironmentConnectionPhase,
} from "@t3tools/client-runtime/connection";
import { relayOfflineReasonMessage } from "@t3tools/client-runtime/relay";

export interface AvailableCloudEnvironmentPresentation {
  readonly connectionError: string | null;
  readonly connectionErrorTraceId: string | null;
  readonly connectionState: EnvironmentConnectionPhase;
  readonly statusText: string;
}

export function availableCloudEnvironmentPresentation(
  input: {
    readonly isStatusPending: boolean;
    readonly status: RelayEnvironmentStatusResponse | null;
    readonly statusError: string | null;
    readonly statusErrorTraceId: string | null;
  },
  locale: MobileLocale = MOBILE_LOCALE,
): AvailableCloudEnvironmentPresentation {
  const descriptor = input.status?.descriptor;
  const compatibilityError =
    descriptor === undefined ? null : orchestrationProtocolCompatibilityError(descriptor);
  if (compatibilityError !== null && descriptor !== undefined) {
    return {
      connectionError: compatibilityError.message,
      connectionErrorTraceId: null,
      connectionState: "unsupported",
      statusText: formatMobileMessage(
        (descriptor.orchestrationProtocolVersion ?? 1) > ORCHESTRATION_PROTOCOL_VERSION
          ? "This client is not supported by this server. Update your app or use a compatible release to connect to {0}."
          : "This client requires a newer server. Update T3 Code on {0} to connect.",
        [descriptor.label],
        locale,
      ),
    };
  }
  if (input.status?.status === "online") {
    return {
      connectionError: null,
      connectionErrorTraceId: null,
      connectionState: "available",
      statusText: localizeMobileString("Available · Relay online", locale),
    };
  }

  if (input.status?.status === "offline") {
    const reason = relayOfflineReasonMessage(input.status);
    const connectionError = reason ?? input.status.error ?? "Relay is offline.";
    return {
      connectionError,
      connectionErrorTraceId: input.status.traceId ?? null,
      connectionState: "error",
      statusText:
        reason !== null
          ? localizeMobileString(reason, locale)
          : (input.status.error ?? localizeMobileString("Relay is offline.", locale)),
    };
  }

  if (input.statusError) {
    return {
      connectionError: input.statusError,
      connectionErrorTraceId: input.statusErrorTraceId,
      connectionState: "error",
      statusText: input.statusError,
    };
  }

  return {
    connectionError: null,
    connectionErrorTraceId: null,
    connectionState: "available",
    statusText: input.isStatusPending
      ? localizeMobileString("Available · Checking relay status...", locale)
      : localizeMobileString("Available · Relay status unknown", locale),
  };
}

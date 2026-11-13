import { matchingUpdateFailureReason, type UpdateFailureReasonMessage } from "@t3tools/contracts";
import {
  describeServerUpdateFailure,
  describeServerUpdateStateFailure,
  type ServerUpdateFailureMessage,
  type ServerUpdateState,
} from "@t3tools/client-runtime/state/server";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage, translateWebSource } from "./messages";

function updateReasonMessage(
  locale: ResolvedAppLocale,
  message: UpdateFailureReasonMessage,
): string {
  const values =
    "version" in message
      ? { version: message.version }
      : "organization" in message
        ? { organization: message.organization }
        : "path" in message
          ? { path: message.path }
          : undefined;
  const reason = translateWebMessage(locale, `updateFailure.${message.code}`, values);
  return (
    reason +
    ("switchToStable" in message && message.switchToStable === true
      ? translateWebMessage(locale, "updateFailure.switch-stable")
      : "")
  );
}

function formatFailureMessage(
  locale: ResolvedAppLocale,
  message: ServerUpdateFailureMessage | undefined,
  fallback: string,
): string {
  if (locale === "en" || message === undefined) return fallback;
  switch (message.code) {
    case "resume-timeout":
    case "progress-incomplete":
      return translateWebMessage(locale, `updateFailure.${message.code}`, {
        version: message.targetVersion,
      });
    case "launcher-uncommitted":
    case "desktop-not-installed":
      return translateWebMessage(locale, `updateFailure.${message.code}`);
    case "unknown":
      return translateWebSource(locale, "Server update failed.");
    case "self-update": {
      const reasonMessage = matchingUpdateFailureReason(message.reason, message.reasonMessage);
      return translateWebMessage(locale, "updateFailure.self-update", {
        reason:
          reasonMessage === undefined ? message.reason : updateReasonMessage(locale, reasonMessage),
      });
    }
  }
}

export function serverUpdateFailureMessage(locale: ResolvedAppLocale, error: unknown): string {
  return formatFailureMessage(
    locale,
    describeServerUpdateFailure(error),
    error instanceof Error ? error.message : "Server update failed.",
  );
}

export function serverUpdateStateFailureMessage(
  locale: ResolvedAppLocale,
  state: Extract<ServerUpdateState, { status: "failed" }>,
): string {
  return formatFailureMessage(locale, describeServerUpdateStateFailure(state), state.message);
}

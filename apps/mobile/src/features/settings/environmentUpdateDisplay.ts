import { matchingUpdateFailureReason, type UpdateFailureReasonMessage } from "@t3tools/contracts";
import type { ServerUpdateFailureMessage } from "@t3tools/client-runtime/state/server";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
import { environmentMaintenanceFailure } from "./environmentSettingsDisplay";

const UPDATE_REASON_SOURCES: Partial<Record<UpdateFailureReasonMessage["code"], string>> = {
  "automatic-disabled": "Automatic updates are disabled on this machine.",
  "download-failed": "The desktop app failed to download the update.",
  "update-failed": "The desktop app update failed.",
  "update-no-result": "The desktop app did not report an update result.",
  "install-failed": "The desktop app failed to install the update.",
  "prepared-in-progress": "A prepared desktop update is already in progress.",
  "wsl-switch-unsupported":
    "This desktop app also runs WSL backends, whose databases a remote switch cannot check. Switch it on that machine.",
  "download-lost": "The desktop app lost the downloaded update.",
  "no-longer-prepared": "This desktop update is no longer prepared.",
  "install-not-started": "The desktop app could not start the install.",
  "update-report-stopped": "The desktop app stopped reporting its update.",
  "not-desktop-launched":
    "This server was not started by the T3 Code desktop app, so it cannot drive a desktop update.",
  "update-in-progress": "A desktop app update is already in progress.",
  "request-id-failed": "Could not generate a desktop update request id.",
  "app-unreachable-on-machine": "Could not reach the T3 Code desktop app on this machine.",
  "update-timeout": "The desktop app did not finish the update in time.",
  "commit-unavailable": "This server cannot commit a desktop app update.",
  "app-unreachable": "Could not reach the T3 Code desktop app.",
  "install-result-timeout": "The desktop app did not report an install result in time.",
  "install-report-stopped": "The desktop app stopped reporting the install.",
  "updates-off": "Updates are turned off on this machine.",
  "missing-feed": "Automatic updates are not available because no update feed is configured.",
  "packaged-only": "Automatic updates are only available in packaged production builds.",
  "disabled-environment":
    "Automatic updates are disabled by the T3CODE_DISABLE_AUTO_UPDATE setting.",
  "linux-package": "Automatic updates on Linux require the AppImage or the .deb package.",
  "nightly-off": "Nightly updates are turned off on this machine.",
};

function updateReasonMessage(
  raw: string,
  descriptor: UpdateFailureReasonMessage | undefined,
  locale: MobileLocale,
): string {
  const message = matchingUpdateFailureReason(raw, descriptor);
  if (!message || locale !== "zh-CN") return raw;
  let result: string;
  switch (message.code) {
    case "update-not-applied":
      result = formatMobileMessage(
        "Update {0} did not apply on this machine. Retry it from the desktop app there.",
        [message.version],
        locale,
      );
      break;
    case "build-not-found":
      result = formatMobileMessage(
        "The desktop app found no build of {0}.",
        [message.version],
        locale,
      );
      break;
    case "already-current":
      result = formatMobileMessage(
        "The T3 Code desktop app on this machine is already up to date on {0}.",
        [message.version],
        locale,
      );
      break;
    case "managed-updates":
      result = formatMobileMessage("{0} manages T3 Code updates.", [message.organization], locale);
      break;
    case "policy-file-unavailable":
      result = formatMobileMessage(
        "Updates are off because T3 Code cannot use the managed policy at {0}. Contact your administrator.",
        [message.path],
        locale,
      );
      break;
    default: {
      const source = Object.hasOwn(UPDATE_REASON_SOURCES, message.code)
        ? UPDATE_REASON_SOURCES[message.code]
        : undefined;
      if (!source) return raw;
      result = localizeMobileString(source, locale);
    }
  }
  return "switchToStable" in message && message.switchToStable === true
    ? `${result} ${localizeMobileString("Switch to the stable channel to keep getting updates.", locale)}`
    : result;
}

export function mobileServerUpdateFailure(
  raw: string,
  message: ServerUpdateFailureMessage | undefined,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (!message || locale !== "zh-CN") return raw;
  switch (message.code) {
    case "resume-timeout":
      return formatMobileMessage(
        "Could not confirm that the server resumed on t3@{0}. Reconnect to check the update outcome.",
        [message.targetVersion],
        locale,
      );
    case "progress-incomplete":
      return formatMobileMessage(
        "The t3@{0} update ended before the server accepted the restart.",
        [message.targetVersion],
        locale,
      );
    case "launcher-uncommitted":
      return localizeMobileString(
        "The service launcher resumed without committing the requested server version.",
        locale,
      );
    case "desktop-not-installed":
      return localizeMobileString(
        "The desktop app resumed without installing the prepared update.",
        locale,
      );
    case "self-update":
      return formatMobileMessage(
        "Server update failed: {0}",
        [updateReasonMessage(message.reason, message.reasonMessage, locale)],
        locale,
      );
    case "unknown":
      return localizeMobileString("Server update failed.", locale);
    default:
      return raw;
  }
}

export interface EnvironmentActionFailure {
  readonly message: string;
  readonly updateMessage?: ServerUpdateFailureMessage;
}

export function captureEnvironmentActionFailure(
  cause: unknown,
  describeUpdateFailure?: (cause: unknown) => ServerUpdateFailureMessage | undefined,
): EnvironmentActionFailure {
  const updateMessage = describeUpdateFailure?.(cause);
  return {
    message: environmentMaintenanceFailure(cause),
    ...(updateMessage ? { updateMessage } : {}),
  };
}

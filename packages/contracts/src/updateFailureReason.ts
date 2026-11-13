import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

export const DesktopUpdateDisabledReasonMessage = Schema.Union([
  Schema.Struct({
    code: Schema.Literals([
      "updates-off",
      "missing-feed",
      "packaged-only",
      "disabled-environment",
      "linux-package",
      "nightly-off",
    ]),
    switchToStable: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.Struct({
    code: Schema.Literal("managed-updates"),
    organization: Schema.String,
    switchToStable: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.Struct({
    code: Schema.Literal("policy-file-unavailable"),
    path: Schema.String,
    switchToStable: Schema.optionalKey(Schema.Boolean),
  }),
]);
export type DesktopUpdateDisabledReasonMessage = typeof DesktopUpdateDisabledReasonMessage.Type;

export const UpdateFailureReasonMessage = Schema.Union([
  DesktopUpdateDisabledReasonMessage,
  Schema.Struct({
    switchToStable: Schema.optionalKey(Schema.Never),
    code: Schema.Literals([
      "automatic-disabled",
      "download-failed",
      "update-failed",
      "update-no-result",
      "install-failed",
      "prepared-in-progress",
      "wsl-switch-unsupported",
      "download-lost",
      "no-longer-prepared",
      "install-not-started",
      "update-report-stopped",
      "not-desktop-launched",
      "update-in-progress",
      "request-id-failed",
      "app-unreachable-on-machine",
      "update-timeout",
      "commit-unavailable",
      "app-unreachable",
      "install-result-timeout",
      "install-report-stopped",
    ]),
  }),
  Schema.Struct({
    code: Schema.Literals(["update-not-applied", "build-not-found", "already-current"]),
    version: Schema.String,
    switchToStable: Schema.optionalKey(Schema.Never),
  }),
]);
export type UpdateFailureReasonMessage = typeof UpdateFailureReasonMessage.Type;

const UPDATE_FAILURE_REASON_SOURCE = {
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
} satisfies Record<
  Exclude<
    UpdateFailureReasonMessage["code"],
    | "update-not-applied"
    | "build-not-found"
    | "already-current"
    | "managed-updates"
    | "policy-file-unavailable"
  >,
  string
>;

const decodeUpdateFailureReasonMessage = Schema.decodeUnknownOption(UpdateFailureReasonMessage);

/** Stale display metadata must never replace the original diagnostic. */
export function matchingUpdateFailureReason(
  reason: string,
  descriptor: unknown,
): UpdateFailureReasonMessage | undefined {
  const decoded = decodeUpdateFailureReasonMessage(descriptor);
  if (Option.isNone(decoded)) return undefined;
  const message = decoded.value;
  let source: string;
  switch (message.code) {
    case "update-not-applied":
      source = `Update ${message.version} did not apply on this machine. Retry it from the desktop app there.`;
      break;
    case "build-not-found":
      source = `The desktop app found no build of ${message.version}.`;
      break;
    case "already-current":
      source = `The T3 Code desktop app on this machine is already up to date on ${message.version}.`;
      break;
    case "managed-updates":
      source = `${message.organization} manages T3 Code updates.`;
      break;
    case "policy-file-unavailable":
      source = `Updates are off because T3 Code cannot use the managed policy at ${message.path}. Contact your administrator.`;
      break;
    default:
      source = UPDATE_FAILURE_REASON_SOURCE[message.code];
  }
  if ("switchToStable" in message && message.switchToStable === true) {
    source += " Switch to the stable channel to keep getting updates.";
  }
  return source === reason ? message : undefined;
}

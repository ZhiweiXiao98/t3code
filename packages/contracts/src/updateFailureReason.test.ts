import { expect, it } from "vite-plus/test";
import {
  matchingUpdateFailureReason,
  type UpdateFailureReasonMessage,
} from "./updateFailureReason.ts";

const cases = [
  {
    message: { code: "automatic-disabled" },
    reason: "Automatic updates are disabled on this machine.",
  },
  {
    message: { code: "update-not-applied", version: "opaque-$& {version} 中文\nnext" },
    reason:
      "Update opaque-$& {version} 中文\nnext did not apply on this machine. Retry it from the desktop app there.",
  },
  {
    message: { code: "download-failed" },
    reason: "The desktop app failed to download the update.",
  },
  { message: { code: "update-failed" }, reason: "The desktop app update failed." },
  {
    message: { code: "update-no-result" },
    reason: "The desktop app did not report an update result.",
  },
  { message: { code: "install-failed" }, reason: "The desktop app failed to install the update." },
  {
    message: { code: "prepared-in-progress" },
    reason: "A prepared desktop update is already in progress.",
  },
  {
    message: { code: "wsl-switch-unsupported" },
    reason:
      "This desktop app also runs WSL backends, whose databases a remote switch cannot check. Switch it on that machine.",
  },
  { message: { code: "download-lost" }, reason: "The desktop app lost the downloaded update." },
  {
    message: { code: "build-not-found", version: "opaque-$& {version} 中文\nnext" },
    reason: "The desktop app found no build of opaque-$& {version} 中文\nnext.",
  },
  { message: { code: "no-longer-prepared" }, reason: "This desktop update is no longer prepared." },
  {
    message: { code: "install-not-started" },
    reason: "The desktop app could not start the install.",
  },
  {
    message: { code: "update-report-stopped" },
    reason: "The desktop app stopped reporting its update.",
  },
  {
    message: { code: "already-current", version: "opaque-$& {version} 中文\nnext" },
    reason:
      "The T3 Code desktop app on this machine is already up to date on opaque-$& {version} 中文\nnext.",
  },
  {
    message: { code: "not-desktop-launched" },
    reason:
      "This server was not started by the T3 Code desktop app, so it cannot drive a desktop update.",
  },
  {
    message: { code: "update-in-progress" },
    reason: "A desktop app update is already in progress.",
  },
  {
    message: { code: "request-id-failed" },
    reason: "Could not generate a desktop update request id.",
  },
  {
    message: { code: "app-unreachable-on-machine" },
    reason: "Could not reach the T3 Code desktop app on this machine.",
  },
  {
    message: { code: "update-timeout" },
    reason: "The desktop app did not finish the update in time.",
  },
  {
    message: { code: "commit-unavailable" },
    reason: "This server cannot commit a desktop app update.",
  },
  { message: { code: "app-unreachable" }, reason: "Could not reach the T3 Code desktop app." },
  {
    message: { code: "install-result-timeout" },
    reason: "The desktop app did not report an install result in time.",
  },
  {
    message: { code: "install-report-stopped" },
    reason: "The desktop app stopped reporting the install.",
  },
  { message: { code: "updates-off" }, reason: "Updates are turned off on this machine." },
  {
    message: { code: "missing-feed" },
    reason: "Automatic updates are not available because no update feed is configured.",
  },
  {
    message: { code: "packaged-only" },
    reason: "Automatic updates are only available in packaged production builds.",
  },
  {
    message: { code: "disabled-environment" },
    reason: "Automatic updates are disabled by the T3CODE_DISABLE_AUTO_UPDATE setting.",
  },
  {
    message: { code: "linux-package" },
    reason: "Automatic updates on Linux require the AppImage or the .deb package.",
  },
  { message: { code: "nightly-off" }, reason: "Nightly updates are turned off on this machine." },
  {
    message: { code: "managed-updates", organization: "opaque-$& {version} 中文\nnext" },
    reason: "opaque-$& {version} 中文\nnext manages T3 Code updates.",
  },
  {
    message: { code: "policy-file-unavailable", path: "opaque-$& {version} 中文\nnext" },
    reason:
      "Updates are off because T3 Code cannot use the managed policy at opaque-$& {version} 中文\nnext. Contact your administrator.",
  },
] satisfies ReadonlyArray<{ message: UpdateFailureReasonMessage; reason: string }>;

it.each(cases)("requires coherent explicit metadata for $message.code", ({ message, reason }) => {
  expect(matchingUpdateFailureReason(reason, message)).toEqual(message);
  expect(
    matchingUpdateFailureReason(reason, {
      ...message,
      cause: new Error("must not enter display metadata"),
    }),
  ).toEqual(message);
  expect(matchingUpdateFailureReason(reason, undefined)).toBeUndefined();
  for (const raw of ["raw diagnostic", ` ${reason}`, `${reason}\nprovider output`]) {
    expect(matchingUpdateFailureReason(raw, message)).toBeUndefined();
  }
  if ("version" in message)
    expect(matchingUpdateFailureReason(reason, { ...message, version: "stale" })).toBeUndefined();
  if ("organization" in message)
    expect(
      matchingUpdateFailureReason(reason, { ...message, organization: "stale" }),
    ).toBeUndefined();
  if ("path" in message)
    expect(matchingUpdateFailureReason(reason, { ...message, path: "stale" })).toBeUndefined();
});

it("requires the exact disabled-channel suffix and rejects malformed or future descriptors", () => {
  const base = { code: "managed-updates" as const, organization: "Acme $& {path}" };
  const reason = `${base.organization} manages T3 Code updates.`;
  const suffix = " Switch to the stable channel to keep getting updates.";
  expect(matchingUpdateFailureReason(reason + suffix, { ...base, switchToStable: true })).toEqual({
    ...base,
    switchToStable: true,
  });
  expect(matchingUpdateFailureReason(reason, { ...base, switchToStable: false })).toEqual({
    ...base,
    switchToStable: false,
  });
  expect(matchingUpdateFailureReason(reason, { ...base, switchToStable: true })).toBeUndefined();
  expect(matchingUpdateFailureReason(reason + suffix, base)).toBeUndefined();
  for (const descriptor of [
    null,
    { code: "future" },
    { code: "build-not-found" },
    { code: "managed-updates", organization: 1 },
    { ...base, switchToStable: "yes" },
    { code: "update-failed", switchToStable: true },
  ]) {
    expect(matchingUpdateFailureReason(reason, descriptor)).toBeUndefined();
  }
});

import type { WebTranslate } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";

import type { DesktopUpdateActionResult, DesktopUpdateState } from "@t3tools/contracts";

const translateEnglish: WebTranslate = (key, values) => translateWebMessage("en", key, values);

export type DesktopUpdateButtonAction = "download" | "install" | "none";

const DEFAULT_DESKTOP_RELEASE_REPOSITORY = "pingdotgg/t3code";
const GITHUB_REPOSITORY_SEGMENT = /^[A-Za-z0-9._-]+$/u;

function isValidRepositorySegment(value: string | undefined): value is string {
  return (
    value !== undefined && value !== "." && value !== ".." && GITHUB_REPOSITORY_SEGMENT.test(value)
  );
}

function desktopReleaseRepositoryUrl(repository: string | undefined): string {
  const configuredRepository = repository?.trim() ?? "";
  const [owner, name, ...extra] = configuredRepository.split("/");
  const releaseRepository =
    isValidRepositorySegment(owner) && isValidRepositorySegment(name) && extra.length === 0
      ? configuredRepository
      : DEFAULT_DESKTOP_RELEASE_REPOSITORY;
  return `https://github.com/${releaseRepository}/releases`;
}

/** The download RPC can beat the updater's downloadedVersion event; fall back to the requested version. */
export function getDesktopUpdateDownloadedVersion(state: DesktopUpdateState): string | null {
  return state.downloadedVersion ?? state.availableVersion;
}

export function getDesktopUpdateReleaseUrl(
  version: string | null,
  repository: string | undefined = import.meta.env.T3CODE_DESKTOP_UPDATE_REPOSITORY,
): string | null {
  const normalizedVersion = version?.trim();
  if (!normalizedVersion) return null;
  return `${desktopReleaseRepositoryUrl(repository)}/tag/v${encodeURIComponent(normalizedVersion)}`;
}

export function getDesktopUpdateReleaseHistoryUrl(
  repository: string | undefined = import.meta.env.T3CODE_DESKTOP_UPDATE_REPOSITORY,
): string {
  return desktopReleaseRepositoryUrl(repository);
}

export function resolveDesktopUpdateButtonAction(
  state: DesktopUpdateState,
): DesktopUpdateButtonAction {
  if (
    state.downloadedVersion &&
    (state.status === "downloaded" ||
      (state.status === "error" &&
        (state.errorContext === null || state.errorContext === "install")))
  ) {
    return "install";
  }
  if (state.status === "available") {
    return "download";
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return "download";
    }
  }
  return "none";
}

export function shouldShowArm64IntelBuildWarning(state: DesktopUpdateState | null): boolean {
  return state?.hostArch === "arm64" && state.appArch === "x64";
}

export function isDesktopUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  return state?.status === "downloading";
}

export function getArm64IntelBuildWarningDescription(
  state: DesktopUpdateState,
  t: WebTranslate = translateEnglish,
): string {
  if (!shouldShowArm64IntelBuildWarning(state)) {
    return t("desktopUpdate.correctArchitecture");
  }

  const action = resolveDesktopUpdateButtonAction(state);
  if (action === "download") {
    return t("desktopUpdate.architectureDownload");
  }
  if (action === "install") {
    return t("desktopUpdate.architectureInstall");
  }
  return t("desktopUpdate.architectureNext");
}

export function getDesktopUpdateButtonTooltip(
  state: DesktopUpdateState,
  t: WebTranslate = translateEnglish,
): string {
  if (
    state.notAppliedVersion !== undefined &&
    (state.status === "available" || state.status === "downloaded") &&
    getDesktopUpdateDownloadedVersion(state) === state.notAppliedVersion
  ) {
    return t("desktopUpdate.notApplied", { version: state.notAppliedVersion });
  }
  if (state.status === "available") {
    return t("desktopUpdate.readyDownload", {
      version: state.availableVersion ?? t("desktopUpdate.available"),
    });
  }
  if (state.status === "downloading") {
    const progress =
      typeof state.downloadPercent === "number" ? ` (${Math.floor(state.downloadPercent)}%)` : "";
    return t("desktopUpdate.downloading", { progress });
  }
  if (state.status === "downloaded") {
    return t("desktopUpdate.downloaded", {
      version: state.downloadedVersion ?? state.availableVersion ?? t("desktopUpdate.ready"),
    });
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return t("desktopUpdate.downloadFailed", { version: state.availableVersion });
    }
    if (state.errorContext === "install" && state.downloadedVersion) {
      return t("desktopUpdate.installFailed", { version: state.downloadedVersion });
    }
    if (state.downloadedVersion) {
      return t("desktopUpdate.downloaded", { version: state.downloadedVersion });
    }
    return state.message ?? t("desktopUpdate.failed");
  }
  return t("desktopUpdate.current");
}

export function getDesktopUpdateInstallConfirmationMessage(
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
  t: WebTranslate = translateEnglish,
): string {
  const version = state.downloadedVersion ?? state.availableVersion;
  return t("desktopUpdate.confirmInstall", { version: version ? ` ${version}` : "" });
}

export function getDesktopUpdateActionError(result: DesktopUpdateActionResult): string | null {
  if (!result.accepted || result.completed) return null;
  if (typeof result.state.message !== "string") return null;
  const message = result.state.message.trim();
  return message.length > 0 ? message : null;
}

export function shouldToastDesktopUpdateActionResult(result: DesktopUpdateActionResult): boolean {
  return getDesktopUpdateActionError(result) !== null;
}

export function canCheckForUpdate(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) return false;
  return (
    state.status !== "checking" && state.status !== "downloading" && state.status !== "disabled"
  );
}

/** `managedDenial` is this machine's policy refusing updates (`managedUpdatesDenial`); it wins. */
export function getDesktopUpdateDisabledReason(
  state: Pick<DesktopUpdateState, "enabled" | "status" | "message"> | null,
  t: WebTranslate = translateEnglish,
  managedDenial?: string,
): string | null {
  if (managedDenial !== undefined) return managedDenial;
  if (!state || (state.enabled && state.status !== "disabled")) return null;
  const message = state.message?.trim();
  if (message === "Automatic updates are not available because no update feed is configured.") {
    return t("desktopUpdate.noFeedDescription");
  }
  return message || t("desktopUpdate.unavailableDescription");
}

export function getDesktopUpdateIdleTooltip(
  state: Pick<DesktopUpdateState, "enabled" | "status" | "message"> | null,
  t: WebTranslate = translateEnglish,
  managedDenial?: string,
) {
  const disabledReason = getDesktopUpdateDisabledReason(state, t, managedDenial);
  return disabledReason
    ? { title: t("desktopUpdate.unavailable"), detail: disabledReason }
    : { title: t("desktopUpdate.check"), detail: null };
}

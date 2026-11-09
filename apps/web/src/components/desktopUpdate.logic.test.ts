import type { WebTranslate } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";
import { describe, expect, it } from "vite-plus/test";
import type { DesktopUpdateState } from "@t3tools/contracts";

import {
  canCheckForUpdate,
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateInstallConfirmationMessage,
  getDesktopUpdateIdleTooltip,
  getDesktopUpdateDisabledReason,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateReleaseHistoryUrl,
  getDesktopUpdateReleaseUrl,
  resolveDesktopUpdateButtonAction,
} from "./desktopUpdate.logic";

const baseState: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  channel: "latest",
  currentVersion: "1.0.0",
  hostArch: "x64",
  appArch: "x64",
  runningUnderArm64Translation: false,
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};

describe("desktop update button state", () => {
  it("keeps retry action available after a download error", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "error",
      availableVersion: "1.1.0",
      message: "network timeout",
      errorContext: "download",
      canRetry: true,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
    expect(getDesktopUpdateButtonTooltip(state)).toContain("Click to retry");
  });

  it("prefers a newly available release over a stale downloaded version", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "available",
      availableVersion: "1.2.0",
      downloadedVersion: "1.1.0",
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
  });

  it("hides the install action while checking for a newer release", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "checking",
      availableVersion: "1.1.0",
      downloadedVersion: "1.1.0",
      downloadPercent: 100,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("none");
  });
});

describe("desktop update UI helpers", () => {
  it.each(["owner/repo/extra", "owner#notes/repo", "owner/repo?tab=notes"])(
    "falls back to upstream for an invalid configured repository: %s",
    (repository) => {
      expect(getDesktopUpdateReleaseHistoryUrl(repository)).toBe(
        "https://github.com/pingdotgg/t3code/releases",
      );
      expect(getDesktopUpdateReleaseUrl("1.2.3", repository)).toBe(
        "https://github.com/pingdotgg/t3code/releases/tag/v1.2.3",
      );
    },
  );
});

describe("canCheckForUpdate", () => {
  it("returns true once an update has been downloaded so newer releases can be found", () => {
    expect(
      canCheckForUpdate({
        ...baseState,
        status: "downloaded",
        availableVersion: "1.1.0",
        downloadedVersion: "1.1.0",
      }),
    ).toBe(true);
  });
});

describe("managed desktop update presentation", () => {
  const zh: WebTranslate = (key, values) => translateWebMessage("zh-CN", key, values);

  it.each([
    null,
    baseState,
    { ...baseState, enabled: false, status: "disabled" as const, message: "original host reason" },
  ])("prioritizes the policy denial over the update state %j", (state) => {
    const denial = "Example Organization does not allow updates.";
    expect(getDesktopUpdateDisabledReason(state, undefined, denial)).toBe(denial);
    expect(getDesktopUpdateDisabledReason(state, zh, denial)).toBe(denial);
    expect(getDesktopUpdateIdleTooltip(state, undefined, denial)).toEqual({
      title: "Updates unavailable",
      detail: denial,
    });
    expect(getDesktopUpdateIdleTooltip(state, zh, denial)).toEqual({
      title: "更新不可用",
      detail: denial,
    });
  });

  it("retains normal localized tooltips when no policy refuses updates", () => {
    expect(getDesktopUpdateDisabledReason(null)).toBeNull();
    expect(getDesktopUpdateDisabledReason(baseState, zh, undefined)).toBeNull();
    expect(getDesktopUpdateIdleTooltip(baseState, undefined, undefined)).toEqual({
      title: "Check for updates",
      detail: null,
    });
    expect(getDesktopUpdateIdleTooltip(baseState, zh, undefined)).toEqual({
      title: "检查更新",
      detail: null,
    });
    expect(getDesktopUpdateDisabledReason({ ...baseState, enabled: false }, zh)).toBe(
      "此构建不支持自动更新。",
    );
    expect(
      getDesktopUpdateDisabledReason(
        { ...baseState, enabled: false, message: "original host reason" },
        zh,
        undefined,
      ),
    ).toBe("original host reason");
  });
});

describe("localized desktop update presentation", () => {
  const zh: WebTranslate = (key, values) => translateWebMessage("zh-CN", key, values);
  it.each([
    [{ status: "idle" }, "Up to date", "已是最新版本"],
    [
      { status: "available", availableVersion: "1.2.0" },
      "Update 1.2.0 ready to download",
      "更新 1.2.0 已可下载",
    ],
    [
      { status: "downloading", downloadPercent: 35.8 },
      "Downloading update (35%)",
      "正在下载更新 (35%)",
    ],
    [
      { status: "downloaded", downloadedVersion: "1.2.0" },
      "Update 1.2.0 downloaded. Click to restart and install.",
      "更新 1.2.0 已下载。点击重启并安装。",
    ],
    [
      { status: "error", errorContext: "download", availableVersion: "1.2.0" },
      "Download failed for 1.2.0. Click to retry.",
      "1.2.0 下载失败。点击重试。",
    ],
    [
      { status: "error", errorContext: "install", downloadedVersion: "1.2.0" },
      "Install failed for 1.2.0. Click to retry.",
      "1.2.0 安装失败。点击重试。",
    ],
    [
      { status: "available", availableVersion: "1.2.0", notAppliedVersion: "1.2.0" },
      "Update 1.2.0 did not apply. Click to retry.",
      "更新 1.2.0 未生效。点击重试。",
    ],
    [
      { status: "error", message: "original host error" },
      "original host error",
      "original host error",
    ],
  ] as const)("preserves versions and raw errors for %j", (override, english, chinese) => {
    const state: DesktopUpdateState = { ...baseState, ...override };
    expect(getDesktopUpdateButtonTooltip(state)).toBe(english);
    expect(getDesktopUpdateButtonTooltip(state, zh)).toBe(chinese);
  });
  it("retains interruption warnings and architecture guidance", () => {
    expect(
      getDesktopUpdateInstallConfirmationMessage(
        { availableVersion: "1.2.0", downloadedVersion: "1.1.0" },
        zh,
      ),
    ).toBe("安装更新 1.1.0并重启 T3 Code？\n\n所有正在运行的任务都将中断。请确认已准备好再继续。");
    expect(getDesktopUpdateIdleTooltip({ ...baseState, enabled: false }, zh)).toEqual({
      title: "更新不可用",
      detail: "此构建不支持自动更新。",
    });
    expect(
      getDesktopUpdateIdleTooltip(
        { ...baseState, enabled: false, message: "original disabled reason" },
        zh,
      ).detail,
    ).toBe("original disabled reason");
    expect(
      getArm64IntelBuildWarningDescription(
        { ...baseState, hostArch: "arm64", status: "available" },
        zh,
      ),
    ).toContain("下载可用更新以切换到原生 Apple 芯片版本");
  });
});

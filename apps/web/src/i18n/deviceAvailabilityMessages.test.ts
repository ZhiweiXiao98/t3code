import { DevicePlatformAvailability } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { deviceAvailabilityReason } from "./deviceAvailabilityMessages";
import { translateWebSource } from "./messages";

const decode = Schema.decodeUnknownSync(DevicePlatformAvailability);
const sdkRoot = "C:\\Android\\Working $&\\{sdkRoot}\\中文";
const cases = [
  {
    platform: "ios",
    available: false,
    reason: "iOS Simulators need macOS with Xcode.",
    reasonMessage: { source: "local-device-host", code: "ios-requires-mac" },
    chinese: "iOS 模拟器需要安装了 Xcode 的 macOS。",
  },
  {
    platform: "ios",
    available: false,
    reason: "Xcode command line tools were not found.",
    reasonMessage: { source: "local-device-host", code: "xcode-tools-missing" },
    chinese: "未找到 Xcode 命令行工具。",
  },
  {
    platform: "android",
    available: false,
    reason:
      "Android SDK was not found. Install it with Android Studio or set ANDROID_HOME to your SDK directory.",
    reasonMessage: { source: "local-device-host", code: "android-sdk-missing" },
    chinese: "未找到 Android SDK。请通过 Android Studio 安装，或将 ANDROID_HOME 设置为 SDK 目录。",
  },
  {
    platform: "android",
    available: false,
    reason: `Android SDK Platform-Tools are missing from ${sdkRoot}. Install them in Android Studio's SDK Manager.`,
    reasonMessage: { source: "local-device-host", code: "android-platform-tools-missing", sdkRoot },
    chinese: `${sdkRoot} 中缺少 Android SDK Platform-Tools。请在 Android Studio 的 SDK 管理器中安装。`,
  },
  {
    platform: "android",
    available: false,
    reason: `Android Emulator is missing from ${sdkRoot}. Install it in Android Studio's SDK Manager.`,
    reasonMessage: { source: "local-device-host", code: "android-emulator-missing", sdkRoot },
    chinese: `${sdkRoot} 中缺少 Android 模拟器。请在 Android Studio 的 SDK 管理器中安装。`,
  },
  {
    platform: "android",
    available: false,
    reason: `The Android SDK command-line tools in ${sdkRoot} appear to be an older, unsupported version. Install Android SDK Command-line Tools (latest) in Android Studio's SDK Manager under SDK Tools.`,
    reasonMessage: {
      source: "local-device-host",
      code: "android-command-line-tools-legacy",
      sdkRoot,
    },
    chinese: `${sdkRoot} 中的 Android SDK 命令行工具似乎是已不受支持的旧版本。请在 Android Studio 的 SDK 管理器的 SDK Tools 中安装 Android SDK Command-line Tools (latest)。`,
  },
  {
    platform: "android",
    available: false,
    reason: `Android SDK Command-line Tools (latest) are missing from ${sdkRoot}. Install them in Android Studio's SDK Manager.`,
    reasonMessage: {
      source: "local-device-host",
      code: "android-command-line-tools-missing",
      sdkRoot,
    },
    chinese: `${sdkRoot} 中缺少 Android SDK Command-line Tools (latest)。请在 Android Studio 的 SDK 管理器中安装。`,
  },
  {
    platform: "ios",
    available: false,
    reason: "The pool has no iOS devices.",
    reasonMessage: { source: "simlock-device-host", code: "ios-devices-missing" },
    chinese: "设备池中没有 iOS 设备。",
  },
  {
    platform: "android",
    available: false,
    reason: "The pool has no Android devices.",
    reasonMessage: { source: "simlock-device-host", code: "android-devices-missing" },
    chinese: "设备池中没有 Android 设备。",
  },
] as const;

describe("device availability provenance", () => {
  it.each(cases)("renders $reasonMessage.code only with matching metadata", (entry) => {
    const decoded = decode(entry);
    expect(deviceAvailabilityReason("zh-CN", decoded)).toBe(entry.chinese);
    expect(deviceAvailabilityReason("en", decoded)).toBe(entry.reason);
    expect(deviceAvailabilityReason("zh-CN", decoded)).toBe(entry.chinese);
    expect(deviceAvailabilityReason("en", decoded)).toBe(entry.reason);
    const { reasonMessage, ...raw } = entry;
    for (const metadata of [
      undefined,
      { ...reasonMessage, code: "future-code" },
      { ...reasonMessage, source: "foreign-host" },
      {
        ...reasonMessage,
        source:
          reasonMessage.source === "local-device-host"
            ? "simlock-device-host"
            : "local-device-host",
      },
    ]) {
      expect(deviceAvailabilityReason("zh-CN", decode({ ...raw, reasonMessage: metadata }))).toBe(
        entry.reason,
      );
    }
    expect(
      deviceAvailabilityReason("zh-CN", { ...decoded, reason: `${entry.reason} Extra diagnostic` }),
    ).toBe(`${entry.reason} Extra diagnostic`);
    expect(deviceAvailabilityReason("zh-CN", { ...decoded, available: true })).toBe(entry.reason);
    expect(
      deviceAvailabilityReason("zh-CN", {
        ...decoded,
        platform: entry.platform === "ios" ? "android" : "ios",
      }),
    ).toBe(entry.reason);
    expect(translateWebSource("zh-CN", entry.reason)).toBe(entry.reason);
    if ("sdkRoot" in reasonMessage) {
      for (const value of [undefined, 7, "/different-sdk"]) {
        expect(
          deviceAvailabilityReason(
            "zh-CN",
            decode({ ...raw, reasonMessage: { ...reasonMessage, sdkRoot: value } }),
          ),
        ).toBe(entry.reason);
      }
      expect(deviceAvailabilityReason("zh-CN", decoded)).toContain(sdkRoot);
    }
  });

  it("keeps arbitrary reason text and absent reasons intact", () => {
    for (const reason of ["Working", "/sdk/$&/{sdkRoot}/中文", "", undefined]) {
      expect(
        deviceAvailabilityReason("zh-CN", { platform: "android", available: false, reason }),
      ).toBe(reason);
    }
    expect(deviceAvailabilityReason("zh-CN", undefined)).toBeUndefined();
  });
});

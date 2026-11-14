import { describe, expect, it } from "vite-plus/test";
import {
  formatOwnedSnapShotSetupMessage,
  localizeSnapShotSetupMessage,
} from "./snapShotSetupMessages";

describe("snapshot setup failure presentation", () => {
  it("preserves exact English and unknown external failures", () => {
    for (const source of [
      "Could not open shortcut permissions.",
      "constructor",
      "external: Could not capture a test snapshot.",
      "provider/{name}/$&",
      "Could not capture a test snapshot. Capturing the window failed: osascript exited with code 1.",
    ]) {
      expect(localizeSnapShotSetupMessage("en", source)).toBe(source);
      if (source !== "Could not open shortcut permissions.")
        expect(localizeSnapShotSetupMessage("zh-CN", source)).toBe(source);
    }
    expect(localizeSnapShotSetupMessage("zh-CN", "Could not open shortcut permissions.")).toBe(
      "无法打开快捷键权限设置。",
    );
    expect(localizeSnapShotSetupMessage("zh-CN", "Could not set up the GNOME extension.")).toBe(
      "无法设置 GNOME 扩展。",
    );
  });
  it("localizes only recognized snapshot IPC envelopes with owned inner messages", () => {
    for (const errorType of ["DesktopSnapShotSetupError", "Error"]) {
      const source = `Error invoking remote method 'desktop:setup-snap-shot': ${errorType}: Could not set up the GNOME extension.`;
      expect(localizeSnapShotSetupMessage("en", source)).toBe(source);
      expect(localizeSnapShotSetupMessage("zh-CN", source)).toBe("无法设置 GNOME 扩展。");
    }
    expect(
      localizeSnapShotSetupMessage(
        "zh-CN",
        "Error invoking remote method 'desktop:read-snap-shot': DesktopSnapShotError: Could not read the snapshot.",
      ),
    ).toBe("无法读取快照。");
    expect(
      localizeSnapShotSetupMessage(
        "zh-CN",
        "Error invoking remote method 'desktop:setup-snap-shot': DesktopSnapShotSetupError: Could not capture a test snapshot. Capturing the window timed out.",
      ),
    ).toBe("无法截取测试快照。截取窗口超时。");
    for (const source of [
      "Error invoking remote method 'desktop:other': DesktopSnapShotSetupError: Could not set up the GNOME extension.",
      "Error invoking remote method 'desktop:setup-snap-shot-extra': DesktopSnapShotSetupError: Could not set up the GNOME extension.",
      "Error invoking remote method 'desktop:setup-snap-shot': OtherError: Could not set up the GNOME extension.",
      "Error invoking remote method 'desktop:setup-snap-shot': DesktopSnapShotError: Could not set up the GNOME extension.",
      "Error invoking remote method 'desktop:read-snap-shot': DesktopSnapShotSetupError: Could not read the snapshot.",
      "Error invoking remote method 'desktop:setup-snap-shot': DesktopSnapShotSetupError: provider/{name}/$&",
      "Error invoking remote method 'desktop:setup-snap-shot': Error: external: Could not set up the GNOME extension.",
      "external: Error invoking remote method 'desktop:setup-snap-shot': DesktopSnapShotSetupError: Could not set up the GNOME extension.",
      "Error invoking remote method 'desktop:setup-snap-shot': DesktopSnapShotSetupError: Could not set up the GNOME extension.\nextra external detail",
    ]) {
      expect(localizeSnapShotSetupMessage("zh-CN", source)).toBe(source);
    }
  });
  it("preserves command exit codes and opaque application names in the owned macOS template", () => {
    const name = 'Settings/{appName}/$&/"引号"\n中文';
    const suffix = ` macOS grants Screen Recording and Accessibility to each app separately. In System Settings, open Privacy & Security and check that "${name}" is allowed for both.`;
    const source = `Could not capture a test snapshot. Finding the front window failed: osascript exited with code -1.${suffix}`;
    expect(localizeSnapShotSetupMessage("en", source)).toBe(source);
    const translated = localizeSnapShotSetupMessage("zh-CN", source);
    expect(translated).toContain("查找前台窗口失败：osascript 已退出，退出码为 -1。");
    expect(translated).toContain(`“${name}”`);
    expect(
      localizeSnapShotSetupMessage(
        "zh-CN",
        "Could not capture a test snapshot. Capturing the window timed out.",
      ),
    ).toBe("无法截取测试快照。截取窗口超时。");
    expect(
      localizeSnapShotSetupMessage(
        "zh-CN",
        "Could not capture a test snapshot. Finding the front window failed.",
      ),
    ).toBe("无法截取测试快照。查找前台窗口失败。");
  });
});

it("guards owned setup metadata against stale, future, malformed and raw collisions", () => {
  const source = "Could not set up the GNOME extension.";
  const descriptor = { code: "setup", action: "install-extension", reason: "setup-failed" };
  for (const locale of ["en", "zh-CN", "en"] as const) {
    expect(formatOwnedSnapShotSetupMessage(locale, source, descriptor)).toBe(
      locale === "en" ? source : "无法设置 GNOME 扩展。",
    );
    for (const metadata of [
      undefined,
      null,
      { ...descriptor, code: "future" },
      { ...descriptor, reason: "future" },
      { ...descriptor, action: "install-kde-helper" },
      { ...descriptor, appName: 9 },
    ]) {
      expect(formatOwnedSnapShotSetupMessage(locale, source, metadata)).toBe(source);
    }
    for (const raw of [
      "",
      ` ${source}`,
      `${source}\n`,
      `Error invoking remote method 'desktop:setup-snap-shot': DesktopSnapShotSetupError: ${source}`,
    ]) {
      expect(formatOwnedSnapShotSetupMessage(locale, raw, descriptor)).toBe(raw);
    }
  }
});
it("reconstructs setup action and macOS branch precedence with literal application names", () => {
  for (const [action, en, zh] of [
    ["install-extension", "Could not set up the GNOME extension.", "无法设置 GNOME 扩展。"],
    ["enable-extension", "Could not set up the GNOME extension.", "无法设置 GNOME 扩展。"],
    ["disable-extension", "Could not set up the GNOME extension.", "无法设置 GNOME 扩展。"],
    ["install-kde-helper", "Could not set up KDE capture.", "无法设置 KDE 截取。"],
    ["remove-kde-helper", "Could not set up KDE capture.", "无法设置 KDE 截取。"],
    ["install-hyprland-helper", "Could not set up Hyprland capture.", "无法设置 Hyprland 截取。"],
    ["remove-hyprland-helper", "Could not set up Hyprland capture.", "无法设置 Hyprland 截取。"],
    ["allow-accessibility", "Could not set up the GNOME extension.", "无法设置 GNOME 扩展。"],
    ["allow-screen-recording", "Could not set up the GNOME extension.", "无法设置 GNOME 扩展。"],
    ["retry-shortcut", "Could not set up the GNOME extension.", "无法设置 GNOME 扩展。"],
  ]) {
    expect(
      formatOwnedSnapShotSetupMessage("zh-CN", en!, {
        code: "setup",
        action,
        reason: "setup-failed",
      }),
    ).toBe(zh);
    const unsupported = action!.includes("hyprland")
      ? "Helper setup requires a Hyprland Wayland session outside a sandbox."
      : action!.includes("kde")
        ? "Helper setup requires a KDE Plasma Wayland session outside a sandbox."
        : "Extension setup requires a GNOME Wayland session outside a sandbox.";
    expect(
      formatOwnedSnapShotSetupMessage("zh-CN", unsupported, {
        code: "setup",
        action,
        reason: "unsupported-session",
      }),
    ).toBe(localizeSnapShotSetupMessage("zh-CN", unsupported));
    expect(
      formatOwnedSnapShotSetupMessage("zh-CN", "Could not open shortcut permissions.", {
        code: "setup",
        action,
        reason: "shortcut-permissions",
      }),
    ).toBe("无法打开快捷键权限设置。");
  }
  const appName = 'literal $& {appName} "quoted"\n应用';
  for (const step of [undefined, "find-window", "capture-window"]) {
    for (const status of [undefined, "missing", "timed-out", "exited", "failed"]) {
      for (const exitCode of [undefined, -1, 0]) {
        const task = step === "find-window" ? "Finding the front window" : "Capturing the window";
        const command = step === "find-window" ? "osascript" : "screencapture";
        const summary = "Could not capture a test snapshot.";
        const failure =
          status === "timed-out"
            ? `${task} timed out.`
            : status === "exited" && exitCode !== undefined
              ? `${task} failed: ${command} exited with code ${exitCode}.`
              : `${task} failed.`;
        const source =
          step === undefined
            ? summary
            : status === "missing"
              ? `${summary} No window is available to capture.`
              : `${summary} ${failure} macOS grants Screen Recording and Accessibility to each app separately. In System Settings, open Privacy & Security and check that "${appName}" is allowed for both.`;
        const descriptor = {
          code: "setup",
          action: "test-mac-capture",
          reason: "setup-failed",
          ...(step === undefined ? {} : { step }),
          ...(status === undefined ? {} : { status }),
          ...(exitCode === undefined ? {} : { exitCode }),
          appName,
        };
        expect(formatOwnedSnapShotSetupMessage("en", source, descriptor)).toBe(source);
        expect(formatOwnedSnapShotSetupMessage("zh-CN", source, descriptor)).toBe(
          localizeSnapShotSetupMessage("zh-CN", source),
        );
        expect(
          formatOwnedSnapShotSetupMessage("zh-CN", "Test capture requires macOS.", {
            ...descriptor,
            reason: "unsupported-session",
          }),
        ).toBe("测试截取需要 macOS。");
      }
    }
  }
});

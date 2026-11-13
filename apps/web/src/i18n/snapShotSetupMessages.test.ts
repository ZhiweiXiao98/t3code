import { describe, expect, it } from "vite-plus/test";
import { localizeSnapShotSetupMessage } from "./snapShotSetupMessages";

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

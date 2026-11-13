import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const SETUP_MESSAGES: Readonly<Record<string, string>> = {
  "Test capture requires macOS.": "测试截取需要 macOS。",
  "Could not capture a test snapshot.": "无法截取测试快照。",
  "Could not capture a test snapshot. No window is available to capture.":
    "无法截取测试快照。没有可供截取的窗口。",
  "Config setup requires a Niri or Hyprland session.": "配置设置需要 Niri 或 Hyprland 会话。",
  "Couldn't prepare your capture shortcut changes.": "无法准备截取快捷键更改。",
  "Couldn't save your capture shortcut.": "无法保存截取快捷键。",
  "Helper setup requires a Hyprland Wayland session outside a sandbox.":
    "辅助程序设置需要在沙盒外的 Hyprland Wayland 会话中进行。",
  "Helper setup requires a KDE Plasma Wayland session outside a sandbox.":
    "辅助程序设置需要在沙盒外的 KDE Plasma Wayland 会话中进行。",
  "Extension setup requires a GNOME Wayland session outside a sandbox.":
    "扩展设置需要在沙盒外的 GNOME Wayland 会话中进行。",
  "Could not open shortcut permissions.": "无法打开快捷键权限设置。",
  "Could not set up Hyprland capture.": "无法设置 Hyprland 截取。",
  "Could not set up KDE capture.": "无法设置 KDE 截取。",
  "Could not set up the GNOME extension.": "无法设置 GNOME 扩展。",
  "Could not list pending snapshots.": "无法列出待处理的快照。",
  "Could not read the snapshot.": "无法读取快照。",
  "Could not remove the snapshot.": "无法移除快照。",
  "SnapShots are not supported here.": "此处不支持快照。",
  "Enable SnapShots in Settings first.": "请先在设置中启用快照。",
  "No window was selected.": "未选择窗口。",
  "The active window is not available for capture.": "无法截取当前活动窗口。",
  "Finish SnapShot setup in Settings → SnapShots.": "请在“设置 → 快照”中完成快照设置。",
  "Could not capture the active window.": "无法截取当前活动窗口。",
};

export function localizeSnapShotSetupMessage(locale: ResolvedAppLocale, source: string): string {
  if (locale !== "zh-CN") return source;
  const wrapped =
    /^Error invoking remote method 'desktop:(setup-snap-shot|preview-snap-shot-config|apply-snap-shot-config|list-pending-snap-shots|read-snap-shot|acknowledge-snap-shot)': (Error|DesktopSnapShotSetupError|DesktopSnapShotError): ([\s\S]*)$/.exec(
      source,
    );
  if (wrapped) {
    const [, channel, errorType, message] = wrapped;
    const setupChannel =
      channel === "setup-snap-shot" ||
      channel === "preview-snap-shot-config" ||
      channel === "apply-snap-shot-config";
    if (
      errorType !== "Error" &&
      errorType !== (setupChannel ? "DesktopSnapShotSetupError" : "DesktopSnapShotError")
    )
      return source;
    const translated = translateOwnedSnapShotMessage(message!);
    return translated === message ? source : translated;
  }
  return translateOwnedSnapShotMessage(source);
}

function translateOwnedSnapShotMessage(source: string): string {
  if (Object.hasOwn(SETUP_MESSAGES, source)) return SETUP_MESSAGES[source]!;
  const testCapture =
    /^Could not capture a test snapshot\. (Finding the front window|Capturing the window) (timed out\.|failed\.|failed: (osascript|screencapture) exited with code (-?\d+)\.)(?: macOS grants Screen Recording and Accessibility to each app separately\. In System Settings, open Privacy & Security and check that "([\s\S]*)" is allowed for both\.)?$/.exec(
      source,
    );
  if (!testCapture) return source;
  const [, task, failure, command, exitCode, appName] = testCapture;
  if (
    command !== undefined &&
    command !== (task === "Finding the front window" ? "osascript" : "screencapture")
  )
    return source;
  const taskLabel = task === "Finding the front window" ? "查找前台窗口" : "截取窗口";
  const result =
    failure === "timed out."
      ? `${taskLabel}超时。`
      : command !== undefined
        ? `${taskLabel}失败：${command} 已退出，退出码为 ${exitCode}。`
        : `${taskLabel}失败。`;
  return `无法截取测试快照。${result}${appName === undefined ? "" : `macOS 分别向每个应用授予屏幕录制和辅助功能权限。请在系统设置中打开“隐私与安全性”，确认“${appName}”同时获准使用这两项权限。`}`;
}

import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

export const MAC_PERMISSION_SETTINGS_URLS = {
  "screen-recording":
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  "full-disk-access":
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles",
};

export type MacPermission = keyof typeof MAC_PERMISSION_SETTINGS_URLS;

const MAC_PERMISSION_TITLES: Record<MacPermission, string> = {
  "screen-recording": "Screen Recording",
  accessibility: "Accessibility",
  "full-disk-access": "Full Disk Access",
};

const helperMessages = {
  en: {
    title: (permission: MacPermission) => `Set up ${MAC_PERMISSION_TITLES[permission]}`,
    close: "Close permission helper",
    drag: "↑ Drag T3 Code into the list above",
    reveal: "Drag T3 Code to System Settings, or click to reveal in Finder",
  },
  "zh-CN": {
    title: (permission: MacPermission) =>
      `设置${
        {
          "screen-recording": "屏幕录制",
          accessibility: "辅助功能",
          "full-disk-access": "完全磁盘访问权限",
        }[permission]
      }`,
    close: "关闭权限助手",
    drag: "↑ 将 T3 Code 拖到上方列表中",
    reveal: "将 T3 Code 拖到系统设置中，或点击在访达中显示",
  },
};

export const macPermissionHelperMessages = (locale: ResolvedAppLocale) => helperMessages[locale];

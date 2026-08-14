import type { AppLocalePreference } from "@t3tools/contracts";
import { resolveAppLocale, type ResolvedAppLocale } from "@t3tools/shared/appLocale";

export interface DesktopApplicationMenuMessages {
  readonly file: string;
  readonly edit: string;
  readonly view: string;
  readonly window: string;
  readonly help: string;
  readonly settings: string;
  readonly checkForUpdates: string;
  readonly about: (appName: string) => string;
  readonly services: string;
  readonly hide: (appName: string) => string;
  readonly hideOthers: string;
  readonly showAll: string;
  readonly quit: (appName: string) => string;
  readonly closeWindow: string;
  readonly undo: string;
  readonly redo: string;
  readonly cut: string;
  readonly copy: string;
  readonly paste: string;
  readonly pasteAndMatchStyle: string;
  readonly delete: string;
  readonly selectAll: string;
  readonly reload: string;
  readonly forceReload: string;
  readonly toggleDeveloperTools: string;
  readonly toggleFullScreen: string;
  readonly minimize: string;
  readonly zoomWindow: string;
  readonly bringAllToFront: string;
  readonly actualSize: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly ok: string;
  readonly upToDateTitle: string;
  readonly upToDateMessage: (version: string) => string;
  readonly updateCheckFailedTitle: string;
  readonly updateCheckFailedMessage: string;
  readonly unknownUpdateError: string;
  readonly updatesUnavailableTitle: string;
  readonly updatesUnavailableMessage: string;
}

const messages = {
  en: {
    file: "File",
    edit: "Edit",
    view: "View",
    window: "Window",
    help: "Help",
    settings: "Settings...",
    checkForUpdates: "Check for Updates...",
    about: (appName) => `About ${appName}`,
    services: "Services",
    hide: (appName) => `Hide ${appName}`,
    hideOthers: "Hide Others",
    showAll: "Show All",
    quit: (appName) => `Quit ${appName}`,
    closeWindow: "Close Window",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    pasteAndMatchStyle: "Paste and Match Style",
    delete: "Delete",
    selectAll: "Select All",
    reload: "Reload",
    forceReload: "Force Reload",
    toggleDeveloperTools: "Toggle Developer Tools",
    toggleFullScreen: "Toggle Full Screen",
    minimize: "Minimize",
    zoomWindow: "Zoom",
    bringAllToFront: "Bring All to Front",
    actualSize: "Actual Size",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    ok: "OK",
    upToDateTitle: "You're up to date!",
    upToDateMessage: (version) => `T3 Code ${version} is currently the newest version available.`,
    updateCheckFailedTitle: "Update check failed",
    updateCheckFailedMessage: "Could not check for updates.",
    unknownUpdateError: "An unknown error occurred. Please try again later.",
    updatesUnavailableTitle: "Updates unavailable",
    updatesUnavailableMessage: "Automatic updates are not available right now.",
  },
  "zh-CN": {
    file: "文件",
    edit: "编辑",
    view: "视图",
    window: "窗口",
    help: "帮助",
    settings: "设置...",
    checkForUpdates: "检查更新...",
    about: (appName) => `关于 ${appName}`,
    services: "服务",
    hide: (appName) => `隐藏 ${appName}`,
    hideOthers: "隐藏其他应用",
    showAll: "全部显示",
    quit: (appName) => `退出 ${appName}`,
    closeWindow: "关闭窗口",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    paste: "粘贴",
    pasteAndMatchStyle: "粘贴并匹配样式",
    delete: "删除",
    selectAll: "全选",
    reload: "重新加载",
    forceReload: "强制重新加载",
    toggleDeveloperTools: "切换开发者工具",
    toggleFullScreen: "切换全屏",
    minimize: "最小化",
    zoomWindow: "缩放",
    bringAllToFront: "全部置于最前",
    actualSize: "实际大小",
    zoomIn: "放大",
    zoomOut: "缩小",
    ok: "确定",
    upToDateTitle: "已是最新版本",
    upToDateMessage: (version) => `T3 Code ${version} 当前已是最新版本。`,
    updateCheckFailedTitle: "检查更新失败",
    updateCheckFailedMessage: "无法检查更新。",
    unknownUpdateError: "发生未知错误，请稍后重试。",
    updatesUnavailableTitle: "暂时无法更新",
    updatesUnavailableMessage: "目前无法使用自动更新。",
  },
} satisfies Record<ResolvedAppLocale, DesktopApplicationMenuMessages>;

export function resolveDesktopApplicationMenuMessages(
  preference: AppLocalePreference,
  runtimeLocales: ReadonlyArray<string>,
): DesktopApplicationMenuMessages {
  return messages[resolveAppLocale(preference, runtimeLocales)];
}

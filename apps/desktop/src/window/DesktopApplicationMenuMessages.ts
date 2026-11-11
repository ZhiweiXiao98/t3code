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
  readonly open: (appName: string) => string;
  readonly quit: (appName: string) => string;
  readonly closeWindow: string;
  readonly closeDeveloperTools: string;
  readonly connectingToWsl: string;
  readonly undo: string;
  readonly redo: string;
  readonly cut: string;
  readonly copy: string;
  readonly copyLink: string;
  readonly copyEmailAddress: string;
  readonly copyImage: string;
  readonly noSpellingSuggestions: string;
  readonly paste: string;
  readonly pasteAndMatchStyle: string;
  readonly pasteAsText: string;
  readonly speech: string;
  readonly startSpeaking: string;
  readonly stopSpeaking: string;
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
  readonly updateDetail: (detail: string) => string;
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
    open: (appName) => `Open ${appName}`,
    quit: (appName) => `Quit ${appName}`,
    closeWindow: "Close Window",
    closeDeveloperTools: "Close Developer Tools",
    connectingToWsl: "Connecting to WSL…",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    copyLink: "Copy Link",
    copyEmailAddress: "Copy Email Address",
    copyImage: "Copy Image",
    noSpellingSuggestions: "No suggestions",
    paste: "Paste",
    pasteAndMatchStyle: "Paste and Match Style",
    pasteAsText: "Paste as Text",
    speech: "Speech",
    startSpeaking: "Start Speaking",
    stopSpeaking: "Stop Speaking",
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
    updateDetail: (detail) => detail,
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
    open: (appName) => `打开 ${appName}`,
    quit: (appName) => `退出 ${appName}`,
    closeWindow: "关闭窗口",
    closeDeveloperTools: "关闭开发者工具",
    connectingToWsl: "正在连接 WSL…",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    copyLink: "复制链接",
    copyEmailAddress: "复制电子邮件地址",
    copyImage: "复制图片",
    noSpellingSuggestions: "无拼写建议",
    paste: "粘贴",
    pasteAndMatchStyle: "粘贴并匹配样式",
    pasteAsText: "粘贴为纯文本",
    speech: "语音",
    startSpeaking: "开始朗读",
    stopSpeaking: "停止朗读",
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
    updateDetail: (detail) => {
      const fixed: Record<string, string> = {
        "Updates are turned off on this machine.": "此电脑已关闭更新。",
        "Automatic updates are not available because no update feed is configured.":
          "未配置更新源，无法使用自动更新。",
        "Automatic updates are only available in packaged production builds.":
          "自动更新仅适用于打包的正式版本。",
        "Automatic updates are disabled by the T3CODE_DISABLE_AUTO_UPDATE setting.":
          "T3CODE_DISABLE_AUTO_UPDATE 设置已禁用自动更新。",
        "Automatic updates on Linux require the AppImage or the .deb package.":
          "Linux 上的自动更新需要使用 AppImage 或 .deb 安装包。",
        "Nightly updates are turned off on this machine.": "此电脑已关闭每日构建版更新。",
      };
      const switchChannel = " Switch to the stable channel to keep getting updates.";
      const reason = detail.endsWith(switchChannel)
        ? detail.slice(0, -switchChannel.length)
        : detail;
      const managed =
        /^(.*) manages T3 Code updates\.( Only stable releases can be installed\.)?$/.exec(reason);
      const failedPolicy =
        /^Updates are off because T3 Code cannot use the managed policy at (.*)\. Contact your administrator\.$/.exec(
          reason,
        );
      const translated =
        fixed[reason] ??
        (managed
          ? `${managed[1]} 负责管理 T3 Code 更新。${managed[2] ? "仅可安装稳定版本。" : ""}`
          : failedPolicy
            ? `T3 Code 无法使用位于 ${failedPolicy[1]} 的受管策略，因此已关闭更新。请联系管理员。`
            : reason);
      return (
        translated + (detail.endsWith(switchChannel) ? "请切换到稳定版通道，以继续获取更新。" : "")
      );
    },
  },
} satisfies Record<ResolvedAppLocale, DesktopApplicationMenuMessages>;

export function resolveDesktopApplicationMenuMessages(
  preference: AppLocalePreference,
  runtimeLocales: ReadonlyArray<string>,
): DesktopApplicationMenuMessages {
  return messages[resolveAppLocale(preference, runtimeLocales)];
}

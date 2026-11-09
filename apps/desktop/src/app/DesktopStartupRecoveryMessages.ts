import type { AppLocalePreference } from "@t3tools/contracts";
import { resolveAppLocale, type ResolvedAppLocale } from "@t3tools/shared/appLocale";

interface StartupRecoveryMessages {
  readonly title: string;
  readonly checking: string;
  readonly update: (version: string) => string;
  readonly updateAction: (version: string) => string;
  readonly downloading: (version: string, progress: string) => string;
  readonly reinstall: (version: string) => string;
  readonly reinstallAction: (version: string) => string;
  readonly releases: string;
  readonly releasesAction: string;
  readonly managedPolicy: string;
  readonly copy: string;
  readonly quit: string;
  readonly noOutput: string;
  readonly footer: (version: string, logDir: string) => string;
  readonly failureReason: (reason: string) => string;
}

const messages = {
  en: {
    title: "T3 Code could not start",
    checking: "Checking for a newer version…",
    update: (version) => `Version ${version} is available. It can contain a fix.`,
    updateAction: (version) => `Update to ${version}`,
    downloading: (version, progress) =>
      `Downloading ${version}${progress}. T3 Code restarts when the download is done.`,
    reinstall: (version) =>
      `Version ${version} started correctly on this computer. Download it and install it to go back.`,
    reinstallAction: (version) => `Download ${version}`,
    releases: "Get a different version from the releases page.",
    releasesAction: "Open releases",
    managedPolicy:
      "Your organization's managed policy stopped T3 Code from starting. Send the details below to your IT administrator.",
    copy: "Copy details",
    quit: "Quit",
    noOutput: "The server wrote no output.",
    footer: (version, logDir) =>
      `Version ${version}. T3 Code tries again in the background. Logs: ${logDir}`,
    failureReason: (reason) => reason,
  },
  "zh-CN": {
    title: "T3 Code 无法启动",
    checking: "正在检查新版本…",
    update: (version) => `版本 ${version} 已可用，可能包含此问题的修复。`,
    updateAction: (version) => `更新至 ${version}`,
    downloading: (version, progress) =>
      `正在下载 ${version}${progress}。下载完成后，T3 Code 将重新启动。`,
    reinstall: (version) => `版本 ${version} 曾在这台电脑上正常启动。下载并安装该版本即可回退。`,
    reinstallAction: (version) => `下载 ${version}`,
    releases: "从发布页面获取其他版本。",
    releasesAction: "打开发布页面",
    managedPolicy: "你所在组织的受管策略阻止了 T3 Code 启动。请将以下详情发送给你的 IT 管理员。",
    copy: "复制详情",
    quit: "退出",
    noOutput: "服务器未产生输出。",
    footer: (version, logDir) => `版本 ${version}。T3 Code 正在后台重试。日志：${logDir}`,
    failureReason: (reason) => {
      if (reason === "The server started but did not become ready in time.") {
        return "服务器已启动，但未能及时就绪。";
      }
      const failed = /^The server could not start \((.*)\)\.$/.exec(reason);
      return failed ? `服务器无法启动（${failed[1]}）。` : reason;
    },
  },
} satisfies Record<ResolvedAppLocale, StartupRecoveryMessages>;

export function resolveStartupRecoveryMessages(
  preference: AppLocalePreference,
  runtimeLocales: ReadonlyArray<string>,
): StartupRecoveryMessages {
  return messages[resolveAppLocale(preference, runtimeLocales)];
}

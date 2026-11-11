import type { AppLocalePreference } from "@t3tools/contracts";
import { resolveAppLocale, type ResolvedAppLocale } from "@t3tools/shared/appLocale";

interface StartupRecoveryMessages {
  readonly title: string;
  readonly fatalTitle: string;
  readonly fatalStage: (stage: string) => string;
  readonly wslUnavailableTitle: string;
  readonly wslUnavailable: string;
  readonly wslFailedTitle: string;
  readonly wslFailed: string;
  readonly homeUnavailableTitle: string;
  readonly homeUnavailable: string;
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
    fatalTitle: "T3 Code failed to start",
    fatalStage: (stage) => `Stage: ${stage}`,
    wslUnavailableTitle: "WSL backend is still unavailable",
    wslUnavailable:
      "T3 Code will use the Windows backend for this launch and retry WSL the next time the app starts.",
    wslFailedTitle: "WSL backend couldn't start",
    wslFailed:
      "Falling back to the Windows backend so T3 Code can open. Re-enable the WSL backend from Settings > Sharing & access once the WSL distro is fixed.",
    homeUnavailableTitle: "This T3 home is unavailable",
    homeUnavailable:
      "Another T3 Code server, such as the background service, is using this data directory, or an older background service is set up for it. Stop that server or try `t3 update`. If the older launcher cannot update, run `t3 service uninstall` and optionally reinstall with `t3 service install` from a current CLI. Use `npx t3@latest` if `t3` is missing or outdated, and pass `--base-dir` with the service's T3 home to each command. Then reopen T3 Code. You can also set a separate T3CODE_HOME and pair with the running server.",
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
    fatalTitle: "T3 Code 启动失败",
    fatalStage: (stage) => `阶段：${stage}`,
    wslUnavailableTitle: "WSL 后端仍不可用",
    wslUnavailable: "本次启动将使用 Windows 后端，下次启动 T3 Code 时会重试 WSL。",
    wslFailedTitle: "WSL 后端无法启动",
    wslFailed:
      "将回退到 Windows 后端，以便打开 T3 Code。修复 WSL 发行版后，可在“设置 > 共享与访问”中重新启用 WSL 后端。",
    homeUnavailableTitle: "此 T3 主目录不可用",
    homeUnavailable:
      "其他 T3 Code 服务器（例如后台服务）正在使用此数据目录，或此目录已配置旧版后台服务。请停止该服务器，或尝试运行 `t3 update`。如果旧版启动器无法更新，请运行 `t3 service uninstall`，并按需使用当前版本的 CLI 运行 `t3 service install` 重新安装。如果 `t3` 不存在或版本过旧，请使用 `npx t3@latest`，并为每条命令添加 `--base-dir` 参数，指定该服务的 T3 主目录。然后重新打开 T3 Code。也可以设置单独的 T3CODE_HOME，并与正在运行的服务器配对。",
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

import type { DesktopCliCommandState } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

/** Only the CLI's own typed IPC rejection is unwrapped. OS and unrelated errors stay intact. */
export function cliCommandFailureMessage(message: string): string {
  const wrapped =
    /^Error invoking remote method 'desktop:cli-command-(?:install|uninstall|add-to-path)': (?:\(FiberFailure\) )?DesktopCliCommandError: ([\s\S]*)$/.exec(
      message,
    );
  return wrapped?.[1] ?? message;
}

export function installedCliDescription(
  locale: ResolvedAppLocale,
  state: DesktopCliCommandState,
): string {
  const path = state.installedPath;
  if (state.onPath)
    return locale === "zh-CN"
      ? `已安装至 ${path}。请打开新终端使用。`
      : `Installed at ${path}. Open a new terminal to use it.`;
  if (state.pathSetup?.added)
    return locale === "zh-CN"
      ? `已安装至 ${path}，并已在 ${state.pathSetup.file} 中加入 PATH。请打开新终端使用。`
      : `Installed at ${path} and added to PATH in ${state.pathSetup.file}. Open a new terminal to use it.`;
  return locale === "zh-CN"
    ? `已安装至 ${path}，但尚未加入 PATH。${state.pathSetup ? "" : "请将其文件夹加入 PATH，以运行 `t3`。"}`
    : `Installed at ${path}, which is not on your PATH yet.${state.pathSetup ? "" : " Add its folder to your PATH to run `t3`."}`;
}

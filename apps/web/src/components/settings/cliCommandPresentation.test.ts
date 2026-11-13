import type { DesktopCliCommandState } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { cliCommandFailureMessage, installedCliDescription } from "./cliCommandPresentation";

it("unwraps only the three typed CLI IPC rejections without interpreting their contents", () => {
  const message = "无法移除 C:\\literal:\n{0}/$&。";
  for (const action of ["install", "uninstall", "add-to-path"]) {
    const prefix = `Error invoking remote method 'desktop:cli-command-${action}': `;
    expect(cliCommandFailureMessage(`${prefix}DesktopCliCommandError: ${message}`)).toBe(message);
    expect(
      cliCommandFailureMessage(`${prefix}(FiberFailure) DesktopCliCommandError: ${message}`),
    ).toBe(message);
    const external = `${prefix}Error: ${message}`;
    expect(cliCommandFailureMessage(external)).toBe(external);
  }
  for (const raw of [
    message,
    `Error invoking remote method 'desktop:cli-command-get-state': DesktopCliCommandError: ${message}`,
    `Error invoking remote method 'other': DesktopCliCommandError: ${message}`,
    `prefix Error invoking remote method 'desktop:cli-command-install': DesktopCliCommandError: ${message}`,
  ]) {
    expect(cliCommandFailureMessage(raw)).toBe(raw);
  }
});

it("renders each installed state with opaque paths intact and the original English punctuation", () => {
  const path = "C:\\literal:\n{0}/$&";
  const file = "~/opaque\n{file}/$&";
  const state: DesktopCliCommandState = {
    supported: true,
    installedPath: path,
    launcherPath: path,
    onPath: true,
  };
  expect(installedCliDescription("en", state)).toBe(
    `Installed at ${path}. Open a new terminal to use it.`,
  );
  expect(installedCliDescription("zh-CN", state)).toBe(`已安装至 ${path}。请打开新终端使用。`);
  const configured = { ...state, onPath: false, pathSetup: { file, added: true } };
  expect(installedCliDescription("zh-CN", configured)).toContain(file);
  expect(installedCliDescription("en", configured)).toBe(
    `Installed at ${path} and added to PATH in ${file}. Open a new terminal to use it.`,
  );
  expect(installedCliDescription("en", { ...state, onPath: false })).toBe(
    `Installed at ${path}, which is not on your PATH yet. Add its folder to your PATH to run \`t3\`.`,
  );
  expect(installedCliDescription("zh-CN", { ...state, onPath: false })).toContain(
    "请将其文件夹加入 PATH",
  );
  const actionable = { ...configured, pathSetup: { file, added: false } };
  expect(installedCliDescription("en", actionable)).toBe(
    `Installed at ${path}, which is not on your PATH yet.`,
  );
  expect(installedCliDescription("zh-CN", actionable)).toBe(`已安装至 ${path}，但尚未加入 PATH。`);
});

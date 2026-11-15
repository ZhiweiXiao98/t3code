import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { AsyncResult } from "effect/reactivity";
import { RegistryContext } from "@effect/atom-react";
import type { DesktopCliCommandState } from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../../test/render";
import { desktopCliCommandStateAtom } from "../../state/desktopCliCommand";
import { CliCommandSettingsRow } from "./CliCommandSettingsRow";

it("blocks installation behind another t3 without blocking removal of our installation", async () => {
  const state: DesktopCliCommandState = {
    supported: true,
    installedPath: null,
    onPath: false,
    launcherPath: "/home/test/.t3/bin/t3",
  };
  const getState = vi.fn(async (): Promise<DesktopCliCommandState> => ({
    ...state,
    shadowedBy: "/usr/local/bin/t3",
  }));
  const uninstall = vi.fn(async () => state);
  using _bridge = stubGlobal("desktopBridge", {
    cliCommand: { getState, install: vi.fn(async () => state), uninstall },
    getLocalEnvironmentEnabled: () => true,
    getLocalEnvironmentBootstraps: () => [],
  });
  const registry = AtomRegistry.make();
  using _registry = { [Symbol.dispose]: () => registry.dispose() };
  await using screen = await render(
    <RegistryContext.Provider value={registry}>
      <CliCommandSettingsRow />
    </RegistryContext.Provider>,
  );

  await expect.element(screen.getByRole("button", { name: "Install" })).toBeDisabled();

  getState.mockResolvedValue(state);
  await act(() => registry.refresh(desktopCliCommandStateAtom));
  await expect.element(screen.getByRole("button", { name: "Install" })).toBeEnabled();

  getState.mockResolvedValue({
    ...state,
    installedPath: "/home/test/.local/bin/t3",
    shadowedBy: "/usr/local/bin/t3",
  });
  await act(() => registry.refresh(desktopCliCommandStateAtom));
  const remove = screen.getByRole("button", { name: "Remove" });
  await expect.element(remove).toBeEnabled();
  await remove.click();
  expect(uninstall).toHaveBeenCalledOnce();
});

const notices = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  toast: vi.fn(),
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => ({ locale: notices.locale }),
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: notices.toast },
}));

function failureSurface(locale: "en" | "zh-CN", registry: AtomRegistry.AtomRegistry) {
  notices.locale = locale;
  return (
    <RegistryContext.Provider value={registry}>
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <CliCommandSettingsRow />
      </WebI18nContext>
    </RegistryContext.Provider>
  );
}

it.each([
  ["install owned", "install", null, "无法安装 t3", "出现了问题。"],
  ["remove owned", "uninstall", null, "无法移除 t3", "出现了问题。"],
  ["path owned", "addToPath", null, "无法将 t3 添加到 PATH", "出现了问题。"],
  ["raw", "install", new Error("Literal $& {OS error}"), "无法安装 t3", "Literal $& {OS error}"],
  ["empty", "install", new Error(""), "无法安装 t3", ""],
  [
    "wrapped",
    "install",
    new Error(
      "Error invoking remote method 'desktop:cli-command-install': (FiberFailure) DesktopCliCommandError: Literal $& {detail}",
    ),
    "无法安装 t3",
    "Literal $& {detail}",
  ],
] as const)(
  "uses settlement locale for CLI command failure: %s",
  async (_kind, action, error, title, description) => {
    const state: DesktopCliCommandState = {
      supported: true,
      installedPath: action === "install" ? null : "/literal/$&/{bin}/t3",
      onPath: false,
      launcherPath: "/literal/$&/{launcher}/t3",
      ...(action === "addToPath"
        ? { pathSetup: { file: "/literal/$&/{profile}", added: false } }
        : {}),
    };
    let reject!: (error: unknown) => void;
    const pending = new Promise<DesktopCliCommandState>((_resolve, fail) => {
      reject = fail;
    });
    // Disposal can reject before an assertion reaches the button.
    void pending.catch(() => {});
    const methods = {
      install: vi.fn(() => pending),
      uninstall: vi.fn(() => pending),
      addToPath: vi.fn(() => pending),
    };
    const getState = vi.fn(async () => state);
    using _bridge = stubGlobal("desktopBridge", {
      cliCommand: { getState, ...methods },
      getLocalEnvironmentEnabled: () => true,
      getLocalEnvironmentBootstraps: () => [],
    });
    notices.toast.mockClear();
    using _locale = {
      [Symbol.dispose]() {
        notices.locale = "en";
      },
    };
    const registry = AtomRegistry.make();
    using _registry = {
      [Symbol.dispose]() {
        registry.dispose();
      },
    };
    await using screen = await render(failureSurface("en", registry));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          reject(new Error("Fixture disposed"));
          await pending.catch(() => {});
        });
      },
    };
    const label =
      action === "install" ? "Install" : action === "uninstall" ? "Remove" : "Add to PATH";
    const button = screen.getByRole("button", { name: label, exact: true });
    await expect.element(button).toBeEnabled();
    await button.click();
    expect(methods[action]).toHaveBeenCalledExactlyOnceWith();
    await expect.element(button).toBeDisabled();
    await act(async () => {
      button.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(methods[action]).toHaveBeenCalledTimes(1);
    await screen.rerender(failureSurface("zh-CN", registry));
    expect(notices.toast).not.toHaveBeenCalled();
    await act(async () => {
      reject(error);
      await pending.catch(() => {});
    });
    expect(notices.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title,
      description,
      data: { actionLayout: "stacked-end" },
    });
    const settledLabel =
      action === "install" ? "安装" : action === "uninstall" ? "移除" : "添加到 PATH";
    await expect
      .element(screen.getByRole("button", { name: settledLabel, exact: true }))
      .toBeEnabled();
    expect(AsyncResult.getOrElse(registry.get(desktopCliCommandStateAtom), () => null)).toBe(state);
    for (const other of ["install", "uninstall", "addToPath"] as const) {
      if (other !== action) expect(methods[other]).not.toHaveBeenCalled();
    }
    await screen.rerender(failureSurface("en", registry));
    expect(notices.toast).toHaveBeenCalledTimes(1);
    expect(methods[action]).toHaveBeenCalledTimes(1);
  },
);

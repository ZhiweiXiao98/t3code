import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => {
  const check = vi.fn();
  const suppress = vi.fn();
  const save = vi.fn();
  const setup = vi.fn();
  const refresh = vi.fn();
  const permissions = vi.fn();
  return {
    check,
    suppress,
    save,
    setup,
    refresh,
    permissions,
    resume: false,
    toast: vi.fn(),
    bridge: {
      checkSnapShotShortcut: check,
      setSnapShotShortcutSuppressed: suppress,
      setupSnapShot: setup,
      setupSnapShotOutcome: undefined as ReturnType<typeof vi.fn> | undefined,
      requestSnapShotPermissions: permissions,
    },
  };
});
vi.mock("../../hooks/useSettings", async (original) => {
  const { DEFAULT_CLIENT_SETTINGS } = await import("@t3tools/contracts");
  const settings = { ...DEFAULT_CLIENT_SETTINGS, snapShotEnabled: true };
  return {
    ...(await original<typeof import("../../hooks/useSettings")>()),
    useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
      select(settings),
    getClientSettings: () => settings,
    updateClientSettings: fixture.save,
  };
});
vi.mock("../../state/server", async (original) => {
  const { Atom } = await import("effect/reactivity");
  return {
    ...(await original<typeof import("../../state/server")>()),
    primaryServerKeybindingsAtom: Atom.make([]),
  };
});
vi.mock("../../state/desktopSnapShot", async (original) => {
  const { Atom } = await import("effect/reactivity");
  const { DEFAULT_CLIENT_SETTINGS } = await import("@t3tools/contracts");
  return {
    ...(await original<typeof import("../../state/desktopSnapShot")>()),
    refreshDesktopSnapShotState: fixture.refresh,
    desktopSnapShotAtom: Atom.make({
      state: {
        mode: "direct",
        shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
        shortcutRegistered: true,
        shortcutMessage: null,
        message: null,
      },
      refreshError: null,
    }),
  };
});
vi.mock("../../lib/desktopSnapShot", async (original) => ({
  ...(await original<typeof import("../../lib/desktopSnapShot")>()),
  getDesktopSnapShotBridge: () => fixture.bridge,
}));
import { SnapShotSettings } from "./SnapShotSettings";

it.each([false, true])(
  "renders cached shortcut-check fallback while preserving raw=%s",
  async (raw) => {
    fixture.resume = false;
    fixture.check
      .mockReset()
      .mockRejectedValueOnce(
        raw ? new Error("Could not check this shortcut.") : "private native detail",
      );
    fixture.suppress.mockReset().mockResolvedValue(undefined);
    fixture.save.mockReset();
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <SnapShotSettings />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    const button = screen.container.querySelector<HTMLButtonElement>("[data-keybinding-capture]")!;
    await userEvent.click(button);
    await expect
      .element(screen.getByRole("button", { name: /Record snapshot shortcut/ }))
      .toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Control>}k{/Control}");
    const english = "Could not check this shortcut.";
    await expect.element(screen.getByText(english, { exact: true })).toBeVisible();
    const notice = screen.getByText(english, { exact: true }).element();
    await screen.rerender(surface("zh-CN"));
    await expect.poll(() => notice.textContent).toBe(raw ? english : "无法检查此快捷键。");
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.textContent).toBe(english);
    expect(fixture.check).toHaveBeenCalledOnce();
    expect(fixture.suppress).toHaveBeenCalledTimes(2);
    expect(fixture.save).not.toHaveBeenCalled();
    expect(screen.container.textContent).not.toContain("private native detail");
  },
);

vi.mock("../../lib/snapShotSetupResume", () => ({
  readSnapShotSetupResume: () => (fixture.resume ? { wasEnabled: true } : null),
  saveSnapShotSetupResume: vi.fn(),
  clearSnapShotSetupResume: vi.fn(),
}));
vi.mock("../../lib/documentActivity", () => {
  const activity = { visible: true, focused: true };
  return { getDocumentActivity: () => activity, subscribeDocumentActivity: () => () => {} };
});
import { RegistryContext } from "@effect/atom-react";
import { AtomRegistry } from "effect/reactivity";
import { DEFAULT_CLIENT_SETTINGS, type DesktopSnapShotState } from "@t3tools/contracts";
import { desktopSnapShotAtom, snapShotSetupError } from "../../state/desktopSnapShot";

it.each([
  "legacy-fallback",
  "legacy-raw",
  "owned-action",
  "owned-enable",
  "transport",
  "raw-outcome",
] as const)(
  "presents cached setup %s at the current locale without repeating operations",
  async (mode) => {
    fixture.resume = true;
    fixture.setup
      .mockReset()
      .mockRejectedValue(
        mode === "legacy-raw" ? new Error("Could not set up the GNOME extension.") : null,
      );
    fixture.save.mockReset();
    fixture.permissions.mockReset();
    fixture.suppress.mockReset().mockResolvedValue(undefined);
    const enable = mode === "owned-enable";
    const state: DesktopSnapShotState = {
      mode: "direct",
      shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
      shortcutRegistered: false,
      shortcutMessage: null,
      message: null,
      macPermissions: { screenRecording: enable, accessibility: enable },
    };
    fixture.refresh.mockReset().mockResolvedValue(state);
    const action = enable ? "test-mac-capture" : "allow-screen-recording";
    const english =
      mode === "legacy-fallback"
        ? "Try again."
        : enable
          ? "Could not capture a test snapshot."
          : "Could not set up the GNOME extension.";
    const chinese =
      mode === "legacy-fallback"
        ? "请重试。"
        : enable
          ? "无法截取测试快照。"
          : mode === "owned-action"
            ? "无法设置 GNOME 扩展。"
            : english;
    const outcome = vi.fn().mockResolvedValue({
      _tag: "Failure",
      message: english,
      ...(mode.startsWith("owned")
        ? { messageDescriptor: { code: "setup", action, reason: "setup-failed" } }
        : {}),
    });
    if (mode === "transport") outcome.mockRejectedValue(new Error(english));
    fixture.bridge.setupSnapShotOutcome = mode.startsWith("legacy") ? undefined : outcome;
    const schedule = globalThis.setInterval;
    using interval = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(() => schedule(() => {}, 2_147_483_647));
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    registry.set(desktopSnapShotAtom, { state, refreshError: null });
    const surface = (locale: "en" | "zh-CN") => (
      <RegistryContext value={registry}>
        <WebI18nContext
          value={{
            locale,
            appLocale: locale,
            setAppLocale: () => undefined,
            t: (key, values) => translateWebMessage(locale, key, values),
          }}
        >
          <SnapShotSettings />
        </WebI18nContext>
      </RegistryContext>
    );
    await using screen = await render(surface("en"));
    if (enable)
      await page.getByRole("button", { name: "Test capture and continue", exact: true }).click();
    else await page.getByRole("button", { name: "Allow", exact: true }).first().click();
    await page.getByText("Advanced", { exact: true }).click();
    await expect.element(page.getByText(english, { exact: true })).toBeVisible();
    // Detail paragraphs are keyed by their translated text; retain the stable details container.
    const notice = page.getByText(english, { exact: true }).element().closest("details")!;
    const refreshCount = fixture.refresh.mock.calls.length;
    await screen.rerender(surface("zh-CN"));
    await expect.poll(() => notice.querySelector("p")?.textContent).toBe(chinese);
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.querySelector("p")?.textContent).toBe(english);
    expect(fixture.refresh).toHaveBeenCalledTimes(refreshCount);
    expect(fixture.permissions).not.toHaveBeenCalled();
    expect(fixture.save).not.toHaveBeenCalled();
    if (mode.startsWith("legacy")) {
      expect(fixture.setup).toHaveBeenCalledExactlyOnceWith(action);
      expect(outcome).not.toHaveBeenCalled();
    } else {
      expect(outcome).toHaveBeenCalledExactlyOnceWith(action);
      expect(fixture.setup).not.toHaveBeenCalled();
    }
    expect(interval).toHaveBeenCalled();
  },
);

vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: fixture.toast },
}));

it.each([false, true])(
  "renders cached background error raw=%s without another read",
  async (raw) => {
    fixture.resume = false;
    fixture.refresh.mockReset();
    fixture.suppress.mockReset().mockResolvedValue(undefined);
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    const error = snapShotSetupError(
      "Couldn't check capture setup",
      raw ? new Error("Could not read the snapshot.") : null,
    );
    registry.set(desktopSnapShotAtom, { state: null, refreshError: error });
    const surface = (locale: "en" | "zh-CN") => (
      <RegistryContext value={registry}>
        <WebI18nContext
          value={{
            locale,
            appLocale: locale,
            setAppLocale: () => undefined,
            t: (key, values) => translateWebMessage(locale, key, values),
          }}
        >
          <SnapShotSettings />
        </WebI18nContext>
      </RegistryContext>
    );
    await using screen = await render(surface("en"));
    const english = `Couldn't check capture setup. ${raw ? "Could not read the snapshot." : "Try again."}`;
    await expect.element(screen.getByText(english, { exact: true })).toBeVisible();
    const notice = screen.getByText(english, { exact: true }).element();
    await screen.rerender(surface("zh-CN"));
    await expect
      .poll(() => notice.textContent)
      .toBe(`无法检查捕获设置. ${raw ? "Could not read the snapshot." : "请重试。"}`);
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.textContent).toBe(english);
    expect(fixture.refresh).not.toHaveBeenCalled();
  },
);

it("uses the locale at asynchronous failure settlement for the setup toast", async () => {
  fixture.resume = false;
  fixture.toast.mockReset();
  fixture.refresh.mockReset();
  fixture.suppress.mockReset().mockResolvedValue(undefined);
  let rejectWrite!: (reason: unknown) => void;
  const pending = new Promise<void>((_resolve, reject) => {
    rejectWrite = reject;
  });
  fixture.save.mockReset().mockReturnValue(pending);
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <SnapShotSettings />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await screen.getByRole("switch", { name: "Enable snapshots", exact: true }).click();
  expect(fixture.save).toHaveBeenCalledExactlyOnceWith({ snapShotEnabled: false });
  await screen.rerender(surface("zh-CN"));
  rejectWrite(null);
  await expect
    .poll(() => fixture.toast.mock.calls)
    .toEqual([[{ type: "error", title: "无法保存捕获设置", description: "请重试。" }]]);
  expect(fixture.refresh).not.toHaveBeenCalled();
});

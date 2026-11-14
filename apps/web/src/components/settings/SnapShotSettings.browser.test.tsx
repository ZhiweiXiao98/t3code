import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => {
  const check = vi.fn();
  const suppress = vi.fn();
  const save = vi.fn();
  return {
    check,
    suppress,
    save,
    bridge: { checkSnapShotShortcut: check, setSnapShotShortcutSuppressed: suppress },
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

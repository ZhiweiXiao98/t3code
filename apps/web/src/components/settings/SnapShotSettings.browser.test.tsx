import "~/index.css";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({ check: vi.fn(), suppress: vi.fn(), save: vi.fn() }));
vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select({ ...DEFAULT_CLIENT_SETTINGS, snapShotEnabled: true }),
  updateClientSettings: fixture.save,
}));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: "keys" }));
vi.mock("../../state/desktopSnapShot", async (original) => ({
  ...(await original<typeof import("../../state/desktopSnapShot")>()),
  desktopSnapShotAtom: "capture",
}));
vi.mock("@effect/atom-react", async (original) => ({
  ...(await original<typeof import("@effect/atom-react")>()),
  useAtomValue: (atom: unknown) =>
    atom === "keys"
      ? []
      : {
          state: {
            mode: "direct",
            shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
            shortcutRegistered: true,
            shortcutMessage: null,
            message: null,
          },
          refreshError: null,
        },
}));
vi.mock("../../lib/desktopSnapShot", () => {
  const bridge = {
    checkSnapShotShortcut: fixture.check,
    setSnapShotShortcutSuppressed: fixture.suppress,
  };
  return { getDesktopSnapShotBridge: () => bridge };
});
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

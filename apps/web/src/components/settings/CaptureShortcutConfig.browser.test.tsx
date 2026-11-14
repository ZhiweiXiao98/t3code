import "~/index.css";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { SnapShotSetupDialog } from "./SnapShotSetupDialog";
import {
  DEFAULT_CLIENT_SETTINGS,
  type DesktopCaptureConfigPreview,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { page, userEvent } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";

const bridge = vi.hoisted(() => ({
  previewSnapShotConfig: vi.fn(),
  applySnapShotConfig: vi.fn(),
  setSnapShotShortcutSuppressed: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock(import("../../lib/desktopSnapShot"), async (original) => ({
  ...(await original()),
  getDesktopSnapShotBridge: () => bridge as never,
}));
vi.mock(import("../ui/toast"), async (original) => {
  const actual = await original();
  return { ...actual, toastManager: { ...actual.toastManager, add: toast } };
});

import { CaptureShortcutConfig } from "./CaptureShortcutConfig";

const preview: DesktopCaptureConfigPreview = {
  id: "approved-snapshot",
  path: "/config/niri/config.kdl",
  resolvedPath: "/config/niri/config.kdl",
  before: "binds {\n}\n",
  after: 'binds {\n    Ctrl+Shift+2 { spawn "gdbus"; }\n}\n',
  shortcut: "Ctrl+Shift+2",
  operation: "install",
};
const complete = vi.fn<() => Promise<void>>();

function setup() {
  const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux");
  bridge.setSnapShotShortcutSuppressed.mockReset().mockResolvedValue(undefined);
  bridge.previewSnapShotConfig.mockReset().mockResolvedValue(preview);
  bridge.applySnapShotConfig
    .mockReset()
    .mockResolvedValue({ backupPath: "/config/backup", warning: null });
  complete.mockReset().mockResolvedValue(undefined);
  toast.mockClear();
  return { [Symbol.dispose]: () => platform.mockRestore() };
}

async function renderConfig(desktop: "niri" | "hyprland" = "niri") {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: desktop,
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutActionRegistered: true,
    shortcutMessage: null,
    message: null,
    shortcutConfigPath: preview.path,
    shortcutBinding: "manual binding",
  };
  const screen = await render(<CaptureShortcutConfig state={state} onComplete={complete} />);
  const { container } = screen;
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find((element) => element.textContent === label);
  const recorder = () => container.querySelector<HTMLButtonElement>("[data-keybinding-capture]")!;
  return Object.assign(screen, {
    button,
    recorder,
    diff: () => container.querySelector('[aria-label="Shortcut changes"]'),
    alert: () => container.querySelector('[role="alert"]'),
    advanced: () => container.querySelector("details")!,
    async click(label: string) {
      const target = button(label);
      expect(target, `button ${label}`).toBeDefined();
      await act(async () => target!.click());
    },
    async recordKeys(keys: string) {
      await userEvent.click(recorder());
      await userEvent.keyboard(keys);
    },
  });
}

it.each(["niri", "hyprland"] as const)(
  "shows the fallback before review and requires separate read and write approval on %s",
  async (desktop) => {
    using _env = setup();
    await using screen = await renderConfig(desktop);
    expect(screen.recorder().getAttribute("aria-label")).toBe(
      "Record snapshot shortcut, currently Ctrl+Shift+2",
    );
    expect(screen.advanced().textContent).toContain("manual binding");
    expect(bridge.previewSnapShotConfig).not.toHaveBeenCalled();
    await screen.click("Review changes");
    expect(screen.recorder().getAttribute("aria-label")).toBe(
      "Record snapshot shortcut, currently Ctrl+Shift+2",
    );
    expect(bridge.applySnapShotConfig).not.toHaveBeenCalled();
    expect(screen.diff()).not.toBeNull();
    await screen.click("Save shortcut");
    expect(bridge.applySnapShotConfig).toHaveBeenCalledExactlyOnceWith(preview.id);
    expect(complete).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  },
);

it("withdraws a stale diff and requires another read instead of retrying its write", async () => {
  using _env = setup();
  await using screen = await renderConfig();
  await screen.click("Review changes");
  bridge.applySnapShotConfig.mockRejectedValue(
    new Error("Your config changed since this preview."),
  );
  await screen.click("Save shortcut");
  expect(screen.alert()?.textContent).toContain("Review the changes and try again");
  expect(screen.advanced().textContent).toContain("Your config changed since this preview.");
  expect(screen.button("Review changes")).toBeDefined();
  expect(screen.diff()).toBeNull();
  expect(complete).not.toHaveBeenCalled();
});

it("updates capture setup copy with locale and helper state without changing the requested action", async () => {
  using _env = setup();
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "kde",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutMessage: null,
    message: null,
    kdeHelper: { status: "update-required", message: "Helper v2 required" },
  };
  const onAction = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const onEnable = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const onRefresh = vi.fn<() => Promise<DesktopSnapShotState>>().mockResolvedValue(state);
  const localized = (locale: "en" | "zh-CN", current: DesktopSnapShotState) => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <SnapShotSetupDialog
        state={current}
        initialStep="access"
        wasEnabled={false}
        includeAccessibility={false}
        busy={false}
        error={null}
        shortcutInput={<input aria-label="User shortcut" defaultValue="Ctrl+Shift+2" />}
        shortcutStatus={null}
        shortcutChanged={false}
        canSaveShortcut={false}
        onSaveShortcut={async () => true}
        onEnable={onEnable}
        onAction={onAction}
        onRefresh={onRefresh}
        onClose={async () => undefined}
        onLeaveStep={() => undefined}
      />
    </WebI18nContext>
  );
  await using screen = await render(localized("en", state));
  await expect
    .element(page.getByRole("heading", { name: "Update the capture helper" }))
    .toBeVisible();
  await screen.rerender(localized("zh-CN", state));
  await expect.element(page.getByRole("heading", { name: "更新捕获助手" })).toBeVisible();
  await expect
    .element(
      page.getByText(
        "T3 Code 捕获助手可让你截取其他应用的画面并返回草稿。它随 T3 Code 一同提供。",
        { exact: true },
      ),
    )
    .toBeVisible();
  await screen.rerender(localized("en", state));
  await page.getByRole("button", { name: "Update helper", exact: true }).click();
  expect(onAction).toHaveBeenCalledExactlyOnceWith("install-kde-helper");
  expect(onEnable).not.toHaveBeenCalled();
  const ready: DesktopSnapShotState = {
    ...state,
    kdeHelper: { status: "ready", message: "Helper ready" },
  };
  await screen.rerender(localized("zh-CN", ready));
  await expect.element(page.getByRole("heading", { name: "捕获已就绪" })).toBeVisible();
  await expect.element(page.getByText("接下来，请选择快捷键。", { exact: true })).toBeVisible();
  await screen.rerender(localized("en", ready));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "Choose your shortcut" })).toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "User shortcut" }))
    .toHaveValue("Ctrl+Shift+2");
  expect(onEnable).toHaveBeenCalledOnce();
  expect(onRefresh).not.toHaveBeenCalled();
});

it.each(["preview", "apply"] as const)(
  "renders cached %s failure in the current locale with literal native detail",
  async (phase) => {
    using _env = setup();
    const english =
      phase === "preview"
        ? "Couldn't prepare the changes. Check Advanced for help."
        : "Couldn't save your shortcut. Review the changes and try again.";
    const chinese =
      phase === "preview"
        ? "无法准备更改。请查看“高级”以获取帮助。"
        : "无法保存快捷键。请检查更改后重试。";
    const detail = english + " /native/$&/{0}/中文";
    if (phase === "preview") bridge.previewSnapShotConfig.mockRejectedValueOnce(new Error(detail));
    else bridge.applySnapShotConfig.mockRejectedValueOnce(new Error(detail));
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <CaptureShortcutConfig
          state={{
            mode: "portal",
            linuxBackend: "niri",
            shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
            shortcutRegistered: false,
            shortcutActionRegistered: true,
            shortcutMessage: null,
            message: null,
          }}
          onComplete={complete}
        />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await screen.getByRole("button", { name: "Review changes", exact: true }).click();
    if (phase === "apply")
      await screen.getByRole("button", { name: "Save shortcut", exact: true }).click();
    const alert = screen.getByRole("alert");
    await expect.element(alert).toHaveTextContent(english);
    await screen.getByText("Advanced", { exact: true }).click();
    await expect.element(screen.getByText(detail, { exact: true })).toBeVisible();
    await screen.rerender(surface("zh-CN"));
    await expect.element(alert).toHaveTextContent(chinese);
    await expect.element(screen.getByText(detail, { exact: true })).toBeVisible();
    await screen.rerender(surface("en"));
    await expect.element(alert).toHaveTextContent(english);
    await expect.element(screen.getByText(detail, { exact: true })).toBeVisible();
    expect(bridge.previewSnapShotConfig).toHaveBeenCalledOnce();
    expect(bridge.applySnapShotConfig).toHaveBeenCalledTimes(phase === "apply" ? 1 : 0);
    expect(bridge.setSnapShotShortcutSuppressed).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  },
);

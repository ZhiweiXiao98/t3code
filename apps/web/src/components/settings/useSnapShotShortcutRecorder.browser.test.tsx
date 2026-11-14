import "~/index.css";
import { useState } from "react";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { act, render } from "../../../test/render";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import { userEvent } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";

const suppress = vi.hoisted(() => vi.fn<(enabled: boolean) => Promise<void>>());
vi.mock(import("../../lib/desktopSnapShot"), async (original) => {
  const bridge = { setSnapShotShortcutSuppressed: suppress };
  return {
    ...(await original()),
    getDesktopSnapShotBridge: () => bridge as never,
  };
});

import {
  useSnapShotShortcutRecorder,
  formatSnapShotShortcutError,
  type SnapShotShortcutError,
} from "./useSnapShotShortcutRecorder";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const recorded = vi.fn();
const error = vi.fn();

function Recorder(props: { allowModifierPairs?: boolean; shortcutLabel?: string }) {
  const recorder = useSnapShotShortcutRecorder({
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutLabel: props.shortcutLabel,
    allowModifierPairs: props.allowModifierPairs ?? false,
    onRecord: recorded,
    onError: error,
  });
  return recorder.input;
}

function setup() {
  suppress.mockReset().mockResolvedValue(undefined);
  recorded.mockReset();
  error.mockReset();
}
async function renderRecorder(props: Parameters<typeof Recorder>[0] = {}) {
  const screen = await render(<Recorder {...props} />);
  const button = () =>
    screen.container.querySelector<HTMLButtonElement>("[data-keybinding-capture]")!;
  // aria-pressed mirrors the hook's recording state, which flips once suppression resolves.
  const expectRecording = (recording: boolean) =>
    expect.element(screen.getByRole("button")).toHaveAttribute("aria-pressed", String(recording));
  return {
    ...screen,
    button,
    expectRecording,
    async start() {
      await userEvent.click(button());
      await expectRecording(true);
    },
  };
}

it("ignores late suppression acknowledgements after cancellation", async () => {
  setup();
  using _platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
  const pending = deferred<void>();
  suppress.mockImplementation((enabled) => (enabled ? pending.promise : Promise.resolve()));
  await using screen = await renderRecorder();
  const { button } = screen;
  await userEvent.click(button());
  await act(async () => button().blur());
  await act(async () => pending.resolve());
  await screen.expectRecording(false);
  expect(suppress).toHaveBeenLastCalledWith(false);
  expect(recorded).not.toHaveBeenCalled();
});

it("updates recorder instructions with locale without interrupting shortcut capture", async () => {
  setup();
  const localized = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Recorder />
    </WebI18nContext>
  );
  await using screen = await render(localized("en"));
  await expect.element(screen.getByRole("button")).toHaveTextContent("Choose shortcut");
  const englishLabel = screen.container.querySelector("button")!.getAttribute("aria-label")!;
  await userEvent.click(screen.getByRole("button"));
  await expect.element(screen.getByRole("button")).toHaveTextContent("Press shortcut…");
  await screen.rerender(localized("zh-CN"));
  await expect.element(screen.getByRole("button")).toHaveTextContent("请按快捷键…");
  await expect.element(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  await expect
    .element(screen.getByRole("button"))
    .toHaveAttribute(
      "aria-label",
      `录制快照快捷键，当前为 ${englishLabel.replace("Record snapshot shortcut, currently ", "")}`,
    );
  expect(suppress).toHaveBeenCalledTimes(1);
  await userEvent.keyboard("{Escape}");
  await expect.element(screen.getByRole("button")).toHaveTextContent("选择快捷键");
  await expect.element(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  expect(suppress).toHaveBeenLastCalledWith(false);
  expect(recorded).not.toHaveBeenCalled();
});

function FailingRecorder({ locale }: { locale: "en" | "zh-CN" }) {
  const [failure, setFailure] = useState<SnapShotShortcutError | null>(null);
  const recorder = useSnapShotShortcutRecorder({
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    allowModifierPairs: false,
    onRecord: recorded,
    onError: setFailure,
  });
  return (
    <>
      {recorder.input}
      {failure !== null ? <p role="alert">{formatSnapShotShortcutError(locale, failure)}</p> : null}
    </>
  );
}

it.each(["fallback", "raw", "modifier"] as const)(
  "keeps cached recorder %s current without restarting",
  async (kind) => {
    setup();
    if (kind !== "modifier")
      suppress.mockRejectedValueOnce(
        kind === "raw" ? new Error("Could not start shortcut recording.") : "native rejection",
      );
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <FailingRecorder locale={locale} />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await screen.getByRole("button").click();
    if (kind === "modifier") {
      await expect.element(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
      await act(async () => {
        const button = screen.getByRole("button").element();
        button.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Shift",
            code: "ShiftLeft",
            shiftKey: true,
            bubbles: true,
          }),
        );
        button.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Shift",
            code: "ShiftRight",
            shiftKey: true,
            bubbles: true,
          }),
        );
      });
    }
    const english =
      kind === "modifier"
        ? "Add a letter, number, or function key to your shortcut."
        : "Could not start shortcut recording.";
    const chinese =
      kind === "modifier"
        ? "请为快捷键添加字母、数字或功能键。"
        : kind === "raw"
          ? english
          : "无法开始录制快捷键。";
    await expect.element(screen.getByRole("alert")).toHaveTextContent(english);
    await screen.rerender(surface("zh-CN"));
    await expect.element(screen.getByRole("alert")).toHaveTextContent(chinese);
    await screen.rerender(surface("en"));
    await expect.element(screen.getByRole("alert")).toHaveTextContent(english);
    expect(suppress).toHaveBeenCalledExactlyOnceWith(true);
    expect(recorded).not.toHaveBeenCalled();
  },
);

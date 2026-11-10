import { EnvironmentId } from "@t3tools/contracts";
import type {
  PreviewStreamControl,
  PreviewStreamEvents,
  PreviewStreamInput,
} from "@t3tools/client-runtime/preview/server-browser-stream";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render } from "../../test/render";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn<(target: unknown, handlers: PreviewStreamEvents) => unknown>(),
  sent: [] as PreviewStreamInput[],
  locale: "en" as "en" | "zh-CN",
  addToast: vi.fn(),
  uploadFiles: vi.fn(),
  access: { url: "ws://preview.test", token: "test" },
  painted: null as (() => void) | null,
}));

vi.mock(import("@t3tools/client-runtime/preview/server-browser-stream"), async (original) => ({
  ...(await original()),
  createPreviewStreamClient: mocks.createClient as never,
  uploadPreviewStreamFiles: mocks.uploadFiles,
  createPreviewFramePainter: (_canvas, onPainted) => {
    mocks.painted = onPainted ?? null;
    return { paint: () => undefined, stop: () => undefined };
  },
}));

vi.mock(import("~/state/previewStream"), async (original) => ({
  ...(await original()),
  usePreviewStreamAccess: () => mocks.access as never,
}));

vi.mock("~/i18n/readWebI18n", () => ({ readWebI18n: () => ({ locale: mocks.locale }) }));
vi.mock("~/components/ui/toast", () => ({
  toastManager: { add: mocks.addToast, close: vi.fn() },
}));

import { ServerBrowserSurface } from "./ServerBrowserSurface";

function setup() {
  mocks.locale = "en";
  mocks.addToast.mockReset();
  mocks.uploadFiles.mockReset();
  mocks.sent.length = 0;
  mocks.painted = null;
  mocks.createClient.mockReset().mockImplementation(() => ({
    send: (input: PreviewStreamInput) => mocks.sent.push(input),
    stop: () => undefined,
  }));
}

async function renderSurface(controller: PreviewStreamControl["controller"]) {
  const container = document.createElement("div");
  container.style.cssText = "width: 400px; height: 300px; display: flex;";
  await using stack = new AsyncDisposableStack();
  const screen = stack.use(
    await render(
      <ServerBrowserSurface
        environmentId={EnvironmentId.make("environment-copy")}
        threadId="thread-copy"
        tabId="tab-copy"
        visible
        followSize={false}
        className="flex-1"
      />,
      { container },
    ),
  );
  await vi.waitFor(() => expect(mocks.createClient).toHaveBeenCalled());
  const handlers = mocks.createClient.mock.calls.at(-1)![1];
  await act(() =>
    handlers.onControl?.({ canOperate: true, controller, generation: 1, dialog: null }),
  );
  mocks.sent.length = 0;
  const input = container.querySelector("textarea")!;
  const canvas = container.querySelector("canvas")!;
  stack.move();
  return { screen, input, canvas };
}

const keys = () => mocks.sent.filter((input) => input.type === "key");

describe("ServerBrowserSurface clipboard commands", () => {
  it("sends a native Copy or Cut menu command to the page once", async () => {
    setup();
    const { screen, input, canvas } = await renderSurface("you");
    await using _screen = screen;
    // Chromium runs a script Copy or Cut only during a user gesture, as a menu click is.
    await userEvent.click(canvas);
    input.focus();
    mocks.sent.length = 0;

    // Like Electron's webContents.copy(): the browser's Copy command, with no key.
    expect(document.execCommand("copy")).toBe(true);
    expect(keys()).toEqual([
      { type: "key", action: "down", key: "c", code: "KeyC", keyCode: 67, modifiers: 2 },
      { type: "key", action: "up", key: "c", code: "KeyC", keyCode: 67, modifiers: 2 },
    ]);

    mocks.sent.length = 0;
    expect(document.execCommand("cut")).toBe(true);
    expect(input.value).toBe("\u200b");
    expect(keys()).toEqual([
      { type: "key", action: "down", key: "x", code: "KeyX", keyCode: 88, modifiers: 2 },
      { type: "key", action: "up", key: "x", code: "KeyX", keyCode: 88, modifiers: 2 },
    ]);
  });

  it("sends a keyboard Copy or Cut once and leaves menu Copy working after any shortcut", async () => {
    setup();
    const { screen, input, canvas } = await renderSurface("you");
    await using _screen = screen;
    await userEvent.click(canvas);
    input.focus();
    const prevented: boolean[] = [];
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^[cx]$/i.test(event.key)) prevented.push(event.defaultPrevented);
    };
    window.addEventListener("keydown", onKeyDown);
    using _listener = { [Symbol.dispose]: () => window.removeEventListener("keydown", onKeyDown) };

    // An unprevented copy or cut key also makes the browser fire copy or cut: here Chromium's
    // Ctrl key binding, on macOS Electron's menu after the Meta keyup.
    for (const [shortcut, cancels] of [
      ["{Control>}x{/Control}", true],
      ["{Control>}c{/Control}", true],
      ["{Meta>}{x>}{/Meta}{/x}", true],
      ["{Control>}{Shift>}c{/Shift}{/Control}", false],
      ["{Control>}{Alt>}x{/Alt}{/Control}", false],
    ] as const) {
      mocks.sent.length = 0;
      prevented.length = 0;
      await userEvent.keyboard(shortcut);
      expect(prevented, shortcut).toEqual([cancels]);
      expect(keys().filter((key) => /^[cx]$/i.test(key.key)).length, shortcut).toBe(2);
      expect(input.value).toBe("\u200b");

      mocks.sent.length = 0;
      expect(document.execCommand("copy")).toBe(true);
      expect(keys(), shortcut).toEqual([
        { type: "key", action: "down", key: "c", code: "KeyC", keyCode: 67, modifiers: 2 },
        { type: "key", action: "up", key: "c", code: "KeyC", keyCode: 67, modifiers: 2 },
      ]);
    }
  });

  it("sends nothing when another viewer controls the page", async () => {
    setup();
    const { screen, input } = await renderSurface("another-viewer");
    await using _screen = screen;

    expect(
      input.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true })),
    ).toBe(false);
    expect(
      input.dispatchEvent(new ClipboardEvent("cut", { bubbles: true, cancelable: true })),
    ).toBe(false);
    expect(mocks.sent).toEqual([]);
  });
});

const mouseUp = (canvas: HTMLCanvasElement, button: number) => {
  const event = new MouseEvent("mouseup", { button, bubbles: true, cancelable: true });
  canvas.dispatchEvent(event);
  return event;
};

describe("ServerBrowserSurface history", () => {
  it("routes mouse thumb buttons to the preview's history instead of the app", async () => {
    setup();
    const { screen, input } = await renderSurface("you");
    await using _screen = screen;
    const canvas = input.closest("[data-server-browser-surface]")!.querySelector("canvas")!;

    expect(mouseUp(canvas, 3).defaultPrevented).toBe(true);
    expect(mouseUp(canvas, 4).defaultPrevented).toBe(true);
    expect(mocks.sent).toEqual([
      { type: "history", delta: -1 },
      { type: "history", delta: 1 },
    ]);
  });

  it("leaves other mouse buttons alone", async () => {
    setup();
    const { screen, input } = await renderSurface("you");
    await using _screen = screen;
    const canvas = input.closest("[data-server-browser-surface]")!.querySelector("canvas")!;

    expect(mouseUp(canvas, 0).defaultPrevented).toBe(false);
    expect(mocks.sent).toEqual([]);
  });

  it("does not forward thumb-button presses to the page", async () => {
    setup();
    const { screen, input } = await renderSurface("you");
    await using _screen = screen;
    const canvas = input.closest("[data-server-browser-surface]")!.querySelector("canvas")!;
    canvas.width = 400;
    canvas.height = 300;
    // Synthetic pointers have no active pointer id to capture.
    canvas.setPointerCapture = () => undefined;
    const handlers = mocks.createClient.mock.calls.at(-1)![1];
    await act(() => {
      mocks.painted?.();
      handlers.onViewport({ width: 400, height: 300 });
    });
    const { left, top } = canvas.getBoundingClientRect();
    const press = (type: "pointerdown" | "pointerup", button: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          button,
          buttons: type === "pointerdown" ? 1 << button : 0,
          clientX: left + 10,
          clientY: top + 10,
          pointerType: "mouse",
          bubbles: true,
        }),
      );
    const mouseInputs = () => mocks.sent.filter((input) => input.type === "mouse");

    for (const button of [3, 4]) {
      press("pointerdown", button);
      press("pointerup", button);
    }
    expect(mouseInputs()).toEqual([]);

    press("pointerdown", 0);
    expect(mouseInputs()).not.toEqual([]);
  });
});

it.each([
  ["clipboard", "en", "zh-CN"],
  ["clipboard", "zh-CN", "en"],
  ["file chooser", "en", "zh-CN"],
  ["file chooser", "zh-CN", "en"],
] as const)(
  "%s failure uses the current language after switching from %s to %s",
  async (operation, initialLocale, nextLocale) => {
    setup();
    mocks.locale = initialLocale;
    const { screen, input } = await renderSurface("you");
    await using _screen = screen;
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
    using _write = vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(pending);
    mocks.uploadFiles.mockReturnValue(pending);
    const handlers = mocks.createClient.mock.calls.at(-1)![1];
    if (operation === "clipboard") {
      await act(() => handlers.onClipboard?.("copied page text"));
      expect(_write).toHaveBeenCalledExactlyOnceWith("copied page text");
    } else {
      await act(() =>
        handlers.onFileChooser?.({
          multiple: false,
          accept: "",
          uploadUrl: "https://preview.test/upload",
          credentials: false,
        }),
      );
      const fileInput = input
        .closest("[data-server-browser-surface]")!
        .querySelector('input[type="file"]') as HTMLInputElement;
      const transfer = new DataTransfer();
      const file = new File(["contents"], "example.txt");
      transfer.items.add(file);
      await act(() => {
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(mocks.uploadFiles).toHaveBeenCalledWith(expect.anything(), [file]);
    }
    expect(mocks.addToast).not.toHaveBeenCalled();
    mocks.locale = nextLocale;
    await act(async () => {
      reject(new Error("REMOTE opaque failure"));
      await pending.catch(() => undefined);
    });
    expect(mocks.addToast).toHaveBeenCalledExactlyOnceWith(
      operation === "clipboard"
        ? expect.objectContaining({
            type: "info",
            title: nextLocale === "zh-CN" ? "网页已复制文本" : "The page copied text",
            actionProps: expect.objectContaining({
              children: nextLocale === "zh-CN" ? "复制" : "Copy",
            }),
          })
        : expect.objectContaining({
            type: "error",
            title:
              nextLocale === "zh-CN"
                ? "无法将文件发送到网页"
                : "Could not send the files to the page",
            description: "REMOTE opaque failure",
          }),
    );
  },
);

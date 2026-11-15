import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { ClipboardApiUnavailableError, ClipboardWriteError } from "../../hooks/useCopyToClipboard";
import { APP_VERSION } from "../../branding";
import { AnchoredToastProvider } from "../ui/toast";
import { AboutVersionTitle } from "./AboutVersionTitle";

const fixture = vi.hoisted(() => ({ locale: null as "en" | "zh-CN" | null, toast: vi.fn() }));
vi.mock("../../i18n/readWebI18n", async (original) => {
  const actual = await original<typeof import("../../i18n/readWebI18n")>();
  return {
    ...actual,
    readWebI18n: () => {
      const locale = fixture.locale;
      return locale === null
        ? actual.readWebI18n()
        : {
            locale,
            t: (
              key: Parameters<typeof translateWebMessage>[1],
              values: Parameters<typeof translateWebMessage>[2],
            ) => translateWebMessage(locale, key, values),
          };
    },
  };
});
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: fixture.toast },
}));

it("shows copy confirmation when the version is clicked without waiting for a hover tooltip", async () => {
  await using screen = await render(
    <AnchoredToastProvider>
      <AboutVersionTitle />
    </AnchoredToastProvider>,
  );
  using write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

  await screen.getByRole("button", { name: `Copy version ${APP_VERSION}` }).click();

  expect(write).toHaveBeenCalledWith(APP_VERSION);
  await expect.element(page.getByText(/^Copied!?$/)).toBeVisible();
});

it.each(["owned", "raw", "empty"] as const)(
  "uses settlement locale for version copy failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.toast.mockReset();
    const toast = fixture.toast;
    using log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let reject!: (error: unknown) => void;
    const pending = new Promise<void>((_resolve, no) => {
      reject = no;
    });
    void pending.catch(() => undefined);
    const writeText = vi.fn().mockReturnValue(pending);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, write },
    });
    using _restore = {
      [Symbol.dispose]() {
        if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
        else Reflect.deleteProperty(navigator, "clipboard");
        fixture.locale = null;
      },
    };
    const surface = (language: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale: language,
          appLocale: language,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(language, key, values),
        }}
      >
        <AboutVersionTitle />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          reject(null);
          await pending.catch(() => undefined);
        });
      },
    };
    await screen.getByRole("button", { name: `Copy version ${APP_VERSION}`, exact: true }).click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(APP_VERSION);
    expect(write).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    const cause =
      kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {clipboard}" : "");
    await act(async () => {
      reject(cause);
      await pending.catch(() => undefined);
    });
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法复制版本号",
      description: "无法将 版本号 复制到剪贴板。",
      data: { actionLayout: "stacked-end" },
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ target: "version", cause }),
    );
    expect(log.mock.calls[0]?.[0]).toBeInstanceOf(ClipboardWriteError);
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  },
);

it.each(["English", "reverse", "unavailable"] as const)(
  "preserves version copy description: %s",
  async (kind) => {
    fixture.locale = kind === "English" ? "en" : "zh-CN";
    fixture.toast.mockReset();
    const toast = fixture.toast;
    using log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let reject!: (error: unknown) => void;
    const pending = new Promise<void>((_resolve, no) => {
      reject = no;
    });
    void pending.catch(() => undefined);
    const writeText = vi.fn().mockReturnValue(pending);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: kind === "unavailable" ? undefined : { writeText, write },
    });
    using _restore = {
      [Symbol.dispose]() {
        if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
        else Reflect.deleteProperty(navigator, "clipboard");
        fixture.locale = null;
      },
    };
    const surface = (language: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale: language,
          appLocale: language,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(language, key, values),
        }}
      >
        <AboutVersionTitle />
      </WebI18nContext>
    );
    using exec = vi.spyOn(document, "execCommand").mockReturnValue(false);
    const initial = kind === "English" ? "en" : "zh-CN";
    await using screen = await render(surface(initial));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          reject(null);
          await pending.catch(() => undefined);
        });
      },
    };
    await screen
      .getByRole("button", {
        name: initial === "en" ? `Copy version ${APP_VERSION}` : `复制版本号 ${APP_VERSION}`,
        exact: true,
      })
      .click();
    if (kind === "unavailable") {
      await expect.poll(() => toast.mock.calls.length).toBe(1);
      expect(writeText).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(exec).toHaveBeenCalledExactlyOnceWith("copy");
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法复制版本号",
        description: "复制 版本号 时剪贴板 API 不可用。",
        data: { actionLayout: "stacked-end" },
      });
      expect(log.mock.calls[0]?.[0]).toBeInstanceOf(ClipboardApiUnavailableError);
    } else {
      expect(writeText).toHaveBeenCalledExactlyOnceWith(APP_VERSION);
      expect(write).not.toHaveBeenCalled();
      expect(exec).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
      fixture.locale = "en";
      await screen.rerender(surface("en"));
      const cause = new Error("Literal $& {clipboard}");
      await act(async () => {
        reject(cause);
        await pending.catch(() => undefined);
      });
      const target = kind === "English" ? "version" : "版本号";
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "Could not copy version",
        description: `Failed to copy ${target} to the clipboard.`,
        data: { actionLayout: "stacked-end" },
      });
      expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          target,
          cause,
          message: `Failed to copy ${target} to the clipboard.`,
        }),
      );
      expect(log.mock.calls[0]?.[0]).toBeInstanceOf(ClipboardWriteError);
    }
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(writeText).toHaveBeenCalledTimes(kind === "unavailable" ? 0 : 1);
    expect(toast).toHaveBeenCalledTimes(1);
  },
);

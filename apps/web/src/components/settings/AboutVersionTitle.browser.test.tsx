import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { ClipboardWriteError } from "../../hooks/useCopyToClipboard";
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
      description: "Failed to copy version to the clipboard.",
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

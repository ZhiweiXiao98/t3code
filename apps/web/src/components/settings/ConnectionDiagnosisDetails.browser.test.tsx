import "~/index.css";
import type { ConnectionDiagnosis } from "@t3tools/client-runtime/connection";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { ClipboardWriteError } from "../../hooks/useCopyToClipboard";
import { ConnectionDiagnosisPanel } from "./ConnectionDiagnosisDetails";

const fixture = vi.hoisted(() => ({ locale: "en" as "en" | "zh-CN", toast: vi.fn() }));
vi.mock("../../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../../i18n/readWebI18n")>()),
  readWebI18n: () => {
    const locale = fixture.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: fixture.toast },
}));

it.each(["zh-CN", "en"] as const)(
  "uses settlement locale for connection diagnostics copy success: %s",
  async (locale) => {
    fixture.locale = "en";
    fixture.toast.mockReset();
    const diagnosis: ConnectionDiagnosis = {
      headline: "Literal $& {headline}",
      hops: [],
      steps: ["Literal $& {step}"],
      facts: [["Fixture", "Literal $& {fact}"]],
      moreInfoUrl: null,
    };
    const retry = vi.fn();
    const addRoute = vi.fn();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
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
        fixture.locale = "en";
      },
    };
    const surface = (language: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale: language,
          appLocale: language,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(language, key, values),
        }}
      >
        <ConnectionDiagnosisPanel
          hostLabel="Literal $& {host}"
          diagnosis={diagnosis}
          onRetry={retry}
          onAddRoute={addRoute}
        />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish();
          await pending;
        });
      },
    };
    await screen.getByRole("button", { name: "Copy diagnostics", exact: true }).click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      "T3 Code connection to Literal $& {host}: Literal $& {headline}\n\n\nFixture: Literal $& {fact}",
    );
    expect(write).not.toHaveBeenCalled();
    expect(fixture.toast).not.toHaveBeenCalled();
    fixture.locale = locale;
    await screen.rerender(surface(locale));
    await act(async () => {
      finish();
      await pending;
    });
    expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: locale === "zh-CN" ? "已复制诊断信息" : "Diagnostics copied",
    });
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(fixture.toast).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(addRoute).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
  },
);

it.each(["owned", "raw", "empty", "English"] as const)(
  "uses settlement locale for connection diagnostics copy failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.toast.mockReset();
    const diagnosis: ConnectionDiagnosis = {
      headline: "Literal $& {headline}",
      hops: [],
      steps: [],
      facts: [["Fixture", "Literal $& {fact}"]],
      moreInfoUrl: null,
    };
    const retry = vi.fn();
    const addRoute = vi.fn();
    using log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let reject!: (cause: unknown) => void;
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
        fixture.locale = "en";
      },
    };
    const surface = (language: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale: language,
          appLocale: language,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(language, key, values),
        }}
      >
        <ConnectionDiagnosisPanel
          hostLabel="Literal $& {host}"
          diagnosis={diagnosis}
          onRetry={retry}
          onAddRoute={addRoute}
        />
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
    await screen.getByRole("button", { name: "Copy diagnostics", exact: true }).click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      "T3 Code connection to Literal $& {host}: Literal $& {headline}\n\n\nFixture: Literal $& {fact}",
    );
    expect(write).not.toHaveBeenCalled();
    expect(fixture.toast).not.toHaveBeenCalled();
    const locale = kind === "English" ? "en" : "zh-CN";
    fixture.locale = locale;
    await screen.rerender(surface(locale));
    const cause =
      kind === "raw" ? new Error("Literal $& {cause}") : kind === "empty" ? new Error("") : null;
    await act(async () => {
      reject(cause);
      await pending.catch(() => undefined);
    });
    expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: locale === "zh-CN" ? "无法复制诊断信息" : "Could not copy diagnostics",
      description: "Failed to copy connection diagnostics to the clipboard.",
      data: { actionLayout: "stacked-end" },
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ target: "connection diagnostics", cause }),
    );
    expect(log.mock.calls[0]?.[0]).toBeInstanceOf(ClipboardWriteError);
    expect(log.mock.calls[0]?.[0].message).toBe(
      "Failed to copy connection diagnostics to the clipboard.",
    );
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(fixture.toast).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(addRoute).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
  },
);

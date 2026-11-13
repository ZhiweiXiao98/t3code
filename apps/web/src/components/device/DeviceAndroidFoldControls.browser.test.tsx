import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import { AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { act, render, stubGlobal } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { androidFoldViewAtom } from "./deviceHubAtoms";
import { DeviceAndroidFoldControls } from "./DeviceAndroidFoldControls";

it.each(["owned", "external", "empty", "non-error"] as const)(
  "keeps %s fold errors and retry behavior correct while locale changes",
  async (mode) => {
    const registry = AtomRegistry.make();
    const deviceKey = "device/{key}/$&";
    const unmount = registry.mount(androidFoldViewAtom(deviceKey));
    registry.set(androidFoldViewAtom(deviceKey), {
      fold: { supported: true, posture: "opened", hingeAngle: 180 },
      angle: 180,
    });
    const access = {
      httpBase: "https://example.test",
      wsBase: "wss://example.test",
      query: {},
      credentials: true,
    };
    const renewed = { ...access, httpBase: "https://renewed.test" };
    const renewAccess = vi.fn(async () => renewed);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 401 }));
    if (mode === "non-error") fetch.mockRejectedValueOnce("opaque external rejection");
    else
      fetch.mockResolvedValueOnce(
        Response.json(
          mode === "owned" ? {} : { error: mode === "empty" ? "" : "Fold command failed (503)." },
          { status: 503 },
        ),
      );
    const english =
      mode === "non-error" ? "Could not change fold posture." : "Fold command failed (503).";
    const chinese =
      mode === "non-error"
        ? "无法更改折叠姿态。"
        : mode === "owned"
          ? "折叠命令失败（503）。"
          : english;
    using _fetch = stubGlobal("fetch", fetch);
    const surface = (locale: "en" | "zh-CN") => (
      <RegistryContext.Provider value={registry}>
        <WebI18nContext
          value={{
            locale,
            appLocale: locale,
            setAppLocale: () => {},
            t: (key, values) => translateWebMessage(locale, key, values),
          }}
        >
          <DeviceAndroidFoldControls
            access={access}
            deviceKey={deviceKey}
            deviceId="device/{id}/$&"
            visible
            enabled
            screenWidth={undefined}
            screenHeight={undefined}
            renewAccess={renewAccess}
          />
        </WebI18nContext>
      </RegistryContext.Provider>
    );
    try {
      await using screen = await render(surface("en"));
      await screen.getByRole("button", { name: "Fold device", exact: true }).click();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      await expect
        .element(screen.getByRole("button", { name: "Fold device", exact: true }))
        .toBeEnabled();
      if (mode !== "empty")
        await expect.element(screen.getByRole("alert")).toHaveAttribute("aria-label", english);
      else expect(screen.container.querySelector('[role="alert"]')).toBeNull();
      await screen.rerender(surface("zh-CN"));
      if (mode !== "empty")
        await expect.element(screen.getByRole("alert")).toHaveAttribute("aria-label", chinese);
      else expect(screen.container.querySelector('[role="alert"]')).toBeNull();
      await screen.rerender(surface("en"));
      if (mode !== "empty")
        await expect.element(screen.getByRole("alert")).toHaveAttribute("aria-label", english);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(renewAccess).toHaveBeenCalledOnce();
      expect(String(fetch.mock.calls[1]?.[0])).toContain("https://renewed.test/");
      expect(fetch.mock.calls[1]?.[1]?.body).toBe('{"posture":"closed"}');
      expect(registry.get(androidFoldViewAtom(deviceKey)).angle).toBe(180);
    } finally {
      unmount();
      registry.dispose();
    }
  },
);

it("relocalizes the captured timeout without retrying or changing the device posture", async () => {
  const registry = AtomRegistry.make();
  const atom = androidFoldViewAtom("timeout-device");
  const unmount = registry.mount(atom);
  registry.set(atom, { fold: { supported: true, posture: "opened", hingeAngle: 180 }, angle: 180 });
  const fetch = vi.fn<typeof globalThis.fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("opaque abort", "AbortError")),
          { once: true },
        );
      }),
  );
  using _fetch = stubGlobal("fetch", fetch);
  let expire: (() => void) | undefined;
  const browserWindow: Window = window;
  const setTimeout = browserWindow.setTimeout.bind(browserWindow);
  const timer = vi
    .spyOn(browserWindow, "setTimeout")
    .mockImplementation((handler, delay, ...args) => {
      if (delay === 12_000 && typeof handler === "function") expire = () => handler(...args);
      return setTimeout(handler, delay, ...args);
    });
  const access = {
    httpBase: "https://example.test",
    wsBase: "wss://example.test",
    query: {},
    credentials: true,
  };
  const renewAccess = vi.fn(async () => null);
  const surface = (locale: "en" | "zh-CN") => (
    <RegistryContext.Provider value={registry}>
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <DeviceAndroidFoldControls
          access={access}
          deviceKey="timeout-device"
          deviceId="literal/{id}/$&"
          visible
          enabled
          screenWidth={undefined}
          screenHeight={undefined}
          renewAccess={renewAccess}
        />
      </WebI18nContext>
    </RegistryContext.Provider>
  );
  try {
    await using screen = await render(surface("en"));
    await screen.getByRole("button", { name: "Fold device", exact: true }).click();
    expect(expire).toBeTypeOf("function");
    await act(async () => {
      expire!();
    });
    await expect
      .element(screen.getByRole("alert"))
      .toHaveAttribute("aria-label", "Fold command timed out.");
    await screen.rerender(surface("zh-CN"));
    await expect.element(screen.getByRole("alert")).toHaveAttribute("aria-label", "折叠命令超时。");
    await screen.rerender(surface("en"));
    await expect
      .element(screen.getByRole("alert"))
      .toHaveAttribute("aria-label", "Fold command timed out.");
    expect(fetch).toHaveBeenCalledOnce();
    expect(renewAccess).not.toHaveBeenCalled();
    expect(registry.get(atom).angle).toBe(180);
  } finally {
    timer.mockRestore();
    unmount();
    registry.dispose();
  }
});

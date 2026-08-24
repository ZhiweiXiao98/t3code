import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { reactHookHarness as hooks } from "../test/reactHookHarness";

const testState = vi.hoisted(() => ({
  settings: { appLocale: "en" },
  runtimeLanguages: ["en-US"],
  desktopSystemLocale: null as string | null,
  languageChangeListener: null as (() => void) | null,
  updateClientSettings: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return {
    ...actual,
    useCallback: reactHookHarness.useCallback,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useMemo: reactHookHarness.useMemo,
    useState: reactHookHarness.useState,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("../hooks/useSettings", () => ({
  useClientSettings: (selector: (settings: typeof testState.settings) => unknown) =>
    selector(testState.settings),
  useUpdateClientSettings: () => testState.updateClientSettings,
}));

import { splitWebTranslation, type WebI18nContextValue, WebI18nProvider } from "./WebI18nProvider";

type ProviderElement = ReactElement<{
  readonly children: ReactNode;
  readonly value: WebI18nContextValue;
}>;

function renderProvider(): ProviderElement {
  hooks.beginRender();
  return WebI18nProvider({ children: null }) as ProviderElement;
}

describe("WebI18nProvider", () => {
  beforeEach(() => {
    hooks.reset();
    testState.settings.appLocale = "en";
    testState.runtimeLanguages = ["en-US"];
    testState.desktopSystemLocale = null;
    testState.languageChangeListener = null;
    testState.updateClientSettings.mockReset();

    vi.stubGlobal("navigator", {
      get language() {
        return testState.runtimeLanguages[0] ?? "";
      },
      get languages() {
        return testState.runtimeLanguages;
      },
    });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    vi.stubGlobal("window", {
      desktopBridge: {
        getSystemLocale: () => testState.desktopSystemLocale,
      },
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === "languagechange") testState.languageChangeListener = listener;
      }),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders explicit Simplified Chinese immediately and syncs the document language", () => {
    testState.settings.appLocale = "zh-CN";

    const provider = renderProvider();

    expect(provider.props.value.locale).toBe("zh-CN");
    expect(provider.props.value.t("settings.title")).toBe("设置");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("resolves the system preference from a Simplified Chinese runtime locale", () => {
    testState.settings.appLocale = "system";
    testState.runtimeLanguages = ["zh-SG", "en-US"];

    const provider = renderProvider();

    expect(provider.props.value.locale).toBe("zh-CN");
    expect(provider.props.value.t("common.confirm")).toBe("确认");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("prefers the desktop bridge's OS locale over Chromium's packaged locale", () => {
    testState.settings.appLocale = "system";
    testState.runtimeLanguages = ["en-US"];
    testState.desktopSystemLocale = "zh-Hans-CN";

    const provider = renderProvider();

    expect(provider.props.value.locale).toBe("zh-CN");
    expect(provider.props.value.t("settings.title")).toBe("设置");
  });

  it("updates when the runtime language changes while following the system", () => {
    testState.settings.appLocale = "system";
    const initial = renderProvider();
    expect(initial.props.value.locale).toBe("en");

    testState.runtimeLanguages = ["zh-Hans-CN"];
    testState.languageChangeListener?.();
    const updated = renderProvider();

    expect(updated.props.value.locale).toBe("zh-CN");
    expect(updated.props.value.t("common.back")).toBe("返回");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("persists an explicit language selection as a client-settings patch", () => {
    const provider = renderProvider();

    provider.props.value.setAppLocale("zh-CN");

    expect(testState.updateClientSettings).toHaveBeenCalledOnce();
    expect(testState.updateClientSettings).toHaveBeenCalledWith({ appLocale: "zh-CN" });
  });

  it("splits localized copy around a styled placeholder", () => {
    const provider = renderProvider();

    expect(
      splitWebTranslation(provider.props.value.t, "chat.branchSwitch.title", "branch", {
        branch: "ignored",
      }),
    ).toEqual(["Switch to ", "?"]);

    testState.settings.appLocale = "zh-CN";
    const chineseProvider = renderProvider();
    expect(
      splitWebTranslation(chineseProvider.props.value.t, "chat.branchSwitch.title", "branch"),
    ).toEqual(["切换到 ", "？"]);
  });
});

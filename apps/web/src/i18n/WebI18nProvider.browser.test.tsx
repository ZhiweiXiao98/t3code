import type { AppLocalePreference } from "@t3tools/contracts/settings";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

const testState = vi.hoisted(() => ({
  settings: { appLocale: "en" as AppLocalePreference },
  updateClientSettings: vi.fn(),
}));

vi.mock("../hooks/useSettings", () => ({
  useClientSettings: (selector: (settings: typeof testState.settings) => unknown) =>
    selector(testState.settings),
  updateClientSettings: testState.updateClientSettings,
}));

import { act, render } from "../../test/render";
import { useI18n } from "./WebI18nContext";
import { WebI18nProvider } from "./WebI18nProvider";

function setup({
  appLocale = "en",
  runtimeLanguages = ["en-US"],
  desktopSystemLocale = null,
}: {
  appLocale?: AppLocalePreference;
  runtimeLanguages?: string[];
  desktopSystemLocale?: string | null;
} = {}) {
  testState.settings = { appLocale };
  testState.updateClientSettings.mockReset();
  const language = Object.getOwnPropertyDescriptor(navigator, "language");
  const languages = Object.getOwnPropertyDescriptor(navigator, "languages");
  const bridge = Object.getOwnPropertyDescriptor(window, "desktopBridge");
  const documentLanguage = document.documentElement.lang;
  let currentLanguages = runtimeLanguages;
  Object.defineProperty(navigator, "language", {
    configurable: true,
    get: () => currentLanguages[0] ?? "",
  });
  Object.defineProperty(navigator, "languages", {
    configurable: true,
    get: () => currentLanguages,
  });
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: { getSystemLocale: () => desktopSystemLocale },
  });
  return {
    updateClientSettings: testState.updateClientSettings,
    changeLanguages(next: string[]) {
      currentLanguages = next;
      window.dispatchEvent(new Event("languagechange"));
    },
    [Symbol.dispose]() {
      if (language) Object.defineProperty(navigator, "language", language);
      else Reflect.deleteProperty(navigator, "language");
      if (languages) Object.defineProperty(navigator, "languages", languages);
      else Reflect.deleteProperty(navigator, "languages");
      if (bridge) Object.defineProperty(window, "desktopBridge", bridge);
      else Reflect.deleteProperty(window, "desktopBridge");
      document.documentElement.lang = documentLanguage;
    },
  };
}

function LocaleControls() {
  const { locale, t, setAppLocale } = useI18n();
  return (
    <>
      <output aria-label="Current locale">{locale}</output>
      <h1>{t("settings.title")}</h1>
      <p>{t("common.confirm")}</p>
      <p>{t("common.back")}</p>
      <button onClick={() => setAppLocale("zh-CN")}>Choose Chinese</button>
    </>
  );
}

function provider() {
  return (
    <WebI18nProvider>
      <LocaleControls />
    </WebI18nProvider>
  );
}

it("renders explicit Simplified Chinese immediately and syncs the document language", async () => {
  using _state = setup({ appLocale: "zh-CN" });
  await using screen = await render(provider());
  expect(screen.getByRole("status", { name: "Current locale" }).element().textContent).toBe(
    "zh-CN",
  );
  expect(screen.getByRole("heading").element().textContent).toBe("设置");
  expect(document.documentElement.lang).toBe("zh-CN");
});

it("resolves the system preference from a Simplified Chinese runtime locale", async () => {
  using _state = setup({ appLocale: "system", runtimeLanguages: ["zh-SG", "en-US"] });
  await using screen = await render(provider());
  expect(screen.getByRole("status", { name: "Current locale" }).element().textContent).toBe(
    "zh-CN",
  );
  expect(screen.container.innerText).toContain("确认");
  expect(document.documentElement.lang).toBe("zh-CN");
});

it("prefers the desktop bridge's OS locale over Chromium's packaged locale", async () => {
  using _state = setup({ appLocale: "system", desktopSystemLocale: "zh-Hans-CN" });
  await using screen = await render(provider());
  expect(screen.getByRole("status", { name: "Current locale" }).element().textContent).toBe(
    "zh-CN",
  );
  expect(screen.getByRole("heading").element().textContent).toBe("设置");
});

it("updates when the runtime language changes while following the system", async () => {
  using state = setup({ appLocale: "system" });
  await using screen = await render(provider());
  expect(screen.getByRole("status", { name: "Current locale" }).element().textContent).toBe("en");
  await act(() => state.changeLanguages(["zh-Hans-CN"]));
  expect(screen.getByRole("status", { name: "Current locale" }).element().textContent).toBe(
    "zh-CN",
  );
  expect(screen.container.innerText).toContain("返回");
  expect(document.documentElement.lang).toBe("zh-CN");
});

it("persists an explicit language selection as a client-settings patch", async () => {
  using state = setup();
  await using screen = await render(provider());
  await userEvent.click(screen.getByRole("button", { name: "Choose Chinese" }));
  expect(state.updateClientSettings).toHaveBeenCalledExactlyOnceWith({ appLocale: "zh-CN" });
});

it("keeps an explicit locale when repeated runtime language events arrive", async () => {
  using state = setup({ appLocale: "en", runtimeLanguages: ["en-US"] });
  await using screen = await render(provider());
  await act(() => state.changeLanguages(["zh-Hans-CN"]));
  await act(() => state.changeLanguages(["zh-Hans-CN"]));
  expect(screen.getByRole("status", { name: "Current locale" }).element().textContent).toBe("en");
  expect(screen.getByRole("heading").element().textContent).toBe("Settings");
  expect(document.documentElement.lang).toBe("en");
});

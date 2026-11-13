import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";
import { render } from "../../../test/render";
import { TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "../../appearanceFonts";
import { getLocalStorageItem, removeLocalStorageItem } from "../../hooks/useLocalStorage";
import { TypographySection } from "./TypographySettings";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";

const state = vi.hoisted(() => ({ searchTargetId: null as string | null }));

vi.mock(import("./useScopedSettings"), async (original) => ({
  ...(await original()),
  useScopedSettings: (() => DEFAULT_UNIFIED_SETTINGS) as never,
  useUpdateScopedSettings: (() => vi.fn()) as never,
}));
// The previews mount Ghostty and Shiki, which this test does not exercise.
vi.mock(import("./SettingsFontPreviews"), () => ({
  CodeFontPreview: () => <div />,
  PromptFontPreview: () => <div />,
  TerminalFontPreview: () => <div />,
}));
vi.mock(import("./settingsLayout"), async (original) => ({
  ...(await original()),
  useSettingsSearchTargetId: () => state.searchTargetId,
}));

function setup(searchTargetId: string | null) {
  state.searchTargetId = searchTargetId;
  removeLocalStorageItem(TYPOGRAPHY_ADVANCED_STORAGE_KEY);
  return { [Symbol.dispose]: () => removeLocalStorageItem(TYPOGRAPHY_ADVANCED_STORAGE_KEY) };
}

describe("TypographySection", () => {
  it("persists the advanced flag the terminal reads when a deep link targets an advanced row", async () => {
    using _storage = setup("terminal-font");
    await using screen = await render(<TypographySection />);

    await expect.element(screen.getByRole("heading", { name: "Terminal font" })).toBeVisible();
    expect(getLocalStorageItem(TYPOGRAPHY_ADVANCED_STORAGE_KEY, Schema.Boolean)).toBe(true);
  });
});

it("updates all advanced size controls when the interface language changes", async () => {
  using _storage = setup("terminal-font");
  const section = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <TypographySection />
    </WebI18nContext>
  );
  await using screen = await render(section("zh-CN"));
  for (const name of ["界面字号", "输入区字号", "代码字号", "终端字号"]) {
    await expect.element(screen.getByRole("combobox", { name, exact: true })).toBeVisible();
  }
  await screen.rerender(section("en"));
  for (const name of [
    "Interface font size",
    "Prompt font size",
    "Code font size",
    "Terminal font size",
  ]) {
    await expect.element(screen.getByRole("combobox", { name, exact: true })).toBeVisible();
  }
});

import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { parseThemeFile, type ThemeDefinition } from "../../themePalette";
import type { OpenVsxThemeExtension } from "../../openVsxThemes";
const fixture = vi.hoisted(() => ({
  search: vi.fn(),
  importTheme: vi.fn(),
  stored: vi.fn(),
  replace: vi.fn(),
  installed: vi.fn(),
  themes: [] as ThemeDefinition[],
}));
vi.mock("../../openVsxThemes", async (original) => ({
  ...(await original<typeof import("../../openVsxThemes")>()),
  searchOpenVsxThemes: fixture.search,
  importOpenVsxThemeExtension: fixture.importTheme,
}));
vi.mock("../../themePalette", async (original) => ({
  ...(await original<typeof import("../../themePalette")>()),
  getCustomThemes: () => fixture.themes,
  getStoredCustomThemeCollection: fixture.stored,
  replaceCustomThemeCollection: fixture.replace,
}));
import { ThemeSearchSection } from "./ThemeSearchSection";
const extension: OpenVsxThemeExtension = {
  id: "literal.theme",
  collectionId: "literal.theme",
  name: "Literal $& {theme}",
  publisher: "Fixture",
  description: "Mock only",
  downloadCount: 1,
  iconUrl: null,
  sourceUrl: null,
  manifestUrl: "https://example.test/manifest",
  sha256Url: "https://example.test/checksum",
  vsixUrl: "https://example.test/archive",
  version: "1",
  license: "MIT",
};
function setup() {
  fixture.themes = [];
  fixture.search.mockReset().mockResolvedValue([extension]);
  fixture.importTheme.mockReset().mockResolvedValue([]);
  fixture.stored.mockReset().mockReturnValue([]);
  fixture.replace.mockReset().mockReturnValue([]);
  fixture.installed.mockReset();
  return new AbortController();
}
function surface(locale: "en" | "zh-CN", signal: AbortSignal) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ThemeSearchSection signal={signal} onInstalled={fixture.installed} />
    </WebI18nContext>
  );
}
const errorText = () =>
  document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? "";
async function search() {
  await page.getByRole("button", { name: "Dracula", exact: true }).click();
  await expect.poll(() => fixture.search.mock.calls.length).toBe(1);
}
async function add() {
  await page.getByRole("button", { name: `Add ${extension.name}`, exact: true }).click();
}
it.each(["search", "stored", "import", "replace"] as const)(
  "keeps owned theme search %s failure current without reoperation",
  async (stage) => {
    const session = setup();
    let reject!: (cause: unknown) => void;
    let finish!: (themes: ThemeDefinition[]) => void;
    const pending = new Promise<ThemeDefinition[]>((resolve, fail) => {
      reject = fail;
      finish = resolve;
    });
    if (stage === "search") fixture.search.mockReturnValue(pending);
    if (stage === "stored")
      fixture.stored.mockImplementation(() => {
        throw null;
      });
    if (stage === "replace")
      fixture.replace.mockImplementation(() => {
        throw null;
      });
    if (stage === "import" || stage === "replace") fixture.importTheme.mockReturnValue(pending);
    await using screen = await render(surface("en", session.signal));
    await search();
    if (stage !== "search") await add();
    // Storage read is synchronous; both network steps remain pending across the locale change.
    if (stage !== "stored") {
      await screen.rerender(surface("zh-CN", session.signal));
      if (stage === "replace") finish([]);
      else reject(null);
    }
    const english =
      stage === "search"
        ? "Open VSX search failed."
        : stage === "stored"
          ? "Installed themes could not be read."
          : "That theme could not be added.";
    const chinese =
      stage === "search"
        ? "Open VSX 搜索失败。"
        : stage === "stored"
          ? "无法读取已安装的主题。"
          : "无法添加该主题。";
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, session.signal));
      await expect.poll(errorText).toBe(locale === "en" ? english : chinese);
    }
    expect(fixture.search).toHaveBeenCalledOnce();
    expect(fixture.stored).toHaveBeenCalledTimes(stage === "search" ? 0 : 1);
    expect(fixture.importTheme).toHaveBeenCalledTimes(
      stage === "import" || stage === "replace" ? 1 : 0,
    );
    expect(fixture.replace).toHaveBeenCalledTimes(stage === "replace" ? 1 : 0);
    expect(fixture.installed).not.toHaveBeenCalled();
  },
);
it.each(["Open VSX search failed.", ""])(
  "keeps raw theme search failure opaque (%s)",
  async (raw) => {
    const session = setup();
    fixture.search.mockRejectedValue(new Error(raw));
    await using screen = await render(surface("en", session.signal));
    await search();
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, session.signal));
      await expect.poll(errorText).toBe(raw);
    }
    expect(fixture.search).toHaveBeenCalledOnce();
  },
);
it.each(["stored", "import"] as const)("keeps raw %s theme failure opaque", async (stage) => {
  const session = setup();
  const raw =
    stage === "stored" ? "Installed themes could not be read." : "That theme could not be added.";
  if (stage === "stored")
    fixture.stored.mockImplementation(() => {
      throw new Error(raw);
    });
  else fixture.importTheme.mockRejectedValue(new Error(raw));
  await using screen = await render(surface("en", session.signal));
  await search();
  await add();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale, session.signal));
    await expect.poll(errorText).toBe(raw);
  }
  expect(fixture.stored).toHaveBeenCalledOnce();
  expect(fixture.replace).not.toHaveBeenCalled();
});
it.each(["cancel", "confirm"] as const)(
  "preserves theme update confirmation %s",
  async (choice) => {
    const session = setup();
    const stored = {
      ...parseThemeFile({
        version: 1,
        name: "Existing",
        appearance: "dark",
        colors: { accent: "#123456" },
      }),
      collection: { id: extension.collectionId, label: extension.name },
    };
    fixture.themes = [stored];
    fixture.stored.mockReturnValue([stored]);
    fixture.importTheme.mockRejectedValue(null);
    await using screen = await render(surface("en", session.signal));
    await search();
    await page.getByRole("button", { name: `Update ${extension.name}`, exact: true }).click();
    expect(fixture.importTheme).not.toHaveBeenCalled();
    await page
      .getByRole("button", { name: choice === "cancel" ? "Cancel" : "Update theme", exact: true })
      .click();
    if (choice === "confirm") await expect.poll(errorText).toBe("That theme could not be added.");
    await screen.rerender(surface("zh-CN", session.signal));
    await expect.poll(errorText).toBe(choice === "cancel" ? "" : "无法添加该主题。");
    expect(fixture.importTheme).toHaveBeenCalledTimes(choice === "cancel" ? 0 : 1);
    expect(fixture.replace).not.toHaveBeenCalled();
  },
);
it.each(["search", "import"] as const)("ignores aborted theme %s failure", async (stage) => {
  const session = setup();
  let reject!: (cause: unknown) => void;
  const pending = new Promise<never>((_resolve, fail) => {
    reject = fail;
  });
  if (stage === "search") fixture.search.mockReturnValue(pending);
  else fixture.importTheme.mockReturnValue(pending);
  await using screen = await render(surface("en", session.signal));
  await search();
  if (stage === "import") await add();
  session.abort();
  reject(null);
  await screen.rerender(surface("zh-CN", session.signal));
  expect(errorText()).toBe("");
  expect(fixture.replace).not.toHaveBeenCalled();
  expect(fixture.installed).not.toHaveBeenCalled();
});

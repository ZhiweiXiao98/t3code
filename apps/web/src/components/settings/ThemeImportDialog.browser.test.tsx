import { StrictMode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  getCustomThemes,
  installCustomTheme,
  invalidateCustomThemes,
  parseThemeFile,
  themeColorToHex,
  THEME_FILE_VERSION,
} from "../../themePalette";
import type { OpenVsxThemeExtension } from "../../openVsxThemes";
import { ThemeImportDialog } from "./ThemeImportDialog";

const searchOpenVsxThemes = vi.hoisted(() => vi.fn());

vi.mock("../../openVsxThemes", () => ({
  searchOpenVsxThemes,
  importOpenVsxThemeExtension: vi.fn(),
}));

import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage, translateWebSource } from "../../i18n/messages";
import type { ThemeDefinition } from "../../themePalette";
const errors = vi.hoisted(() => ({
  themes: null as ThemeDefinition[] | null,
  install: null as ((theme: ThemeDefinition) => ThemeDefinition) | null,
  update: null as ((theme: ThemeDefinition) => ThemeDefinition) | null,
  remove: null as ((id: string) => void) | null,
  imported: vi.fn(),
  many: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../../themePalette", async (original) => {
  const actual = await original<typeof import("../../themePalette")>();
  return {
    ...actual,
    getCustomThemes: () => errors.themes ?? actual.getCustomThemes(),
    installCustomTheme: (theme: ThemeDefinition) =>
      errors.install ? errors.install(theme) : actual.installCustomTheme(theme),
    updateCustomTheme: (theme: ThemeDefinition) =>
      errors.update ? errors.update(theme) : actual.updateCustomTheme(theme),
    removeCustomTheme: (id: string) =>
      errors.remove ? errors.remove(id) : actual.removeCustomTheme(id),
  };
});

const extension: OpenVsxThemeExtension = {
  id: "acme.nightfall",
  collectionId: "acme.nightfall",
  name: "Nightfall",
  publisher: "acme",
  description: "A dark theme",
  downloadCount: 10,
  iconUrl: null,
  sourceUrl: null,
  manifestUrl: "https://example.test/manifest",
  sha256Url: "https://example.test/sha256",
  vsixUrl: "https://example.test/vsix",
  version: "1.0.0",
  license: "MIT",
};

describe("ThemeImportDialog", () => {
  // StrictMode replays ref attach/detach on mount, which must not end the session.
  it("searches Open VSX under StrictMode", async () => {
    searchOpenVsxThemes.mockReset();
    searchOpenVsxThemes.mockResolvedValue([extension]);
    await using _screen = await render(
      <StrictMode>
        <ThemeImportDialog
          open
          onOpenChange={() => {}}
          onImported={() => true}
          onImportedMany={() => {}}
        />
      </StrictMode>,
    );

    await userEvent.type(page.getByLabelText("Search Open VSX themes"), "night");

    await expect.element(page.getByRole("heading", { name: "Nightfall" })).toBeVisible();
    expect(searchOpenVsxThemes).toHaveBeenCalledWith(
      "night",
      expect.objectContaining({ sortBy: "downloadCount" }),
    );
  });
});

const theme = (name: string, accent = "#3b82f6") => ({
  version: THEME_FILE_VERSION,
  name,
  appearance: "dark",
  colors: { accent },
});

const themeFile = (name: string, accent?: string) =>
  new File([JSON.stringify(theme(name, accent))], `${name}.json`, { type: "application/json" });

it.each(["Update existing", "Keep both"])(
  "keeps batch failures visible after %s",
  async (choice) => {
    using _themes = {
      [Symbol.dispose]() {
        window.localStorage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
        invalidateCustomThemes();
      },
    };
    installCustomTheme(parseThemeFile(theme("Dusk")));
    const onOpenChange = vi.fn();
    await using _screen = await render(
      <ThemeImportDialog
        open
        onOpenChange={onOpenChange}
        onImported={() => true}
        onImportedMany={() => {}}
      />,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, [
      themeFile("Dawn"),
      themeFile("Dusk", "#f97316"),
      new File(["{"], "broken.json", { type: "application/json" }),
    ]);

    await expect.element(page.getByText("Already installed")).toBeVisible();
    await expect.element(page.getByText(/^broken\.json:/)).toBeVisible();
    expect(getCustomThemes().map((theme) => theme.label)).toContain("Dawn");
    await page.getByRole("button", { name: choice }).click();
    invalidateCustomThemes();
    const label = choice === "Update existing" ? "Dusk" : "Dusk (1)";
    expect(getCustomThemes().find((theme) => theme.label === label)?.colors).toEqual(
      parseThemeFile(theme("Dusk", "#f97316")).colors,
    );
    await expect.element(page.getByText(/^broken\.json:/)).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  },
);

function isolateThemes() {
  const previous = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
  localStorage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
  invalidateCustomThemes();
  return {
    [Symbol.dispose]() {
      if (previous === null) localStorage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
      else localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, previous);
      invalidateCustomThemes();
    },
  };
}

function themeJsonc(name: string, background: string) {
  return `{
    // VS Code themes use JSONC even with a .json extension.
    "name": "${name}",
    "colors": {
      "editor.background": "${background}",
    },
    "tokenColors": [],
  }`;
}

describe("ThemeImportDialog JSONC imports", () => {
  it.each(["paste", "file"])("imports a VS Code JSONC theme from %s", async (source) => {
    using _themes = isolateThemes();
    await using _screen = await render(
      <ThemeImportDialog
        open
        onOpenChange={() => {}}
        onImported={() => true}
        onImportedMany={() => {}}
      />,
    );
    const json = themeJsonc("JSONC Night", "#002b36");
    if (source === "paste") {
      await page.getByRole("textbox", { name: "Theme JSON" }).fill(json);
    } else {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      await userEvent.upload(input, new File([json], "night.json", { type: "application/json" }));
      await expect.element(page.getByRole("textbox", { name: "Theme JSON" })).toHaveValue(json);
    }
    await page.getByRole("button", { name: "Add theme", exact: true }).click();

    expect(getCustomThemes().map((theme) => theme.label)).toEqual(["JSONC Night"]);
    expect(themeColorToHex(getCustomThemes()[0]!.colors.canvas)).toBe("#002b36");
  });

  it("imports each VS Code JSONC theme in a file batch", async () => {
    using _themes = isolateThemes();
    await using _screen = await render(
      <ThemeImportDialog
        open
        onOpenChange={() => {}}
        onImported={() => true}
        onImportedMany={() => {}}
      />,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, [
      new File([themeJsonc("JSONC Night", "#002b36")], "night.json", {
        type: "application/json",
      }),
      new File([themeJsonc("JSONC Day", "#fdf6e3")], "day.json", {
        type: "application/json",
      }),
    ]);

    await vi.waitFor(() => {
      expect(getCustomThemes().map((theme) => theme.label)).toEqual(["JSONC Night", "JSONC Day"]);
    });
    expect(getCustomThemes().map((theme) => themeColorToHex(theme.colors.canvas))).toEqual([
      "#002b36",
      "#fdf6e3",
    ]);
  });
});

function errorSession() {
  errors.themes = [];
  errors.install = vi.fn((theme: ThemeDefinition) => theme);
  errors.update = vi.fn((theme: ThemeDefinition) => theme);
  errors.remove = vi.fn();
  errors.imported.mockReset().mockReturnValue(true);
  errors.many.mockReset();
  errors.close.mockReset();
  return {
    [Symbol.dispose]() {
      errors.themes = null;
      errors.install = null;
      errors.update = null;
      errors.remove = null;
    },
  };
}
function localized(locale: "en" | "zh-CN") {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ThemeImportDialog
        open
        onOpenChange={errors.close}
        onImported={errors.imported}
        onImportedMany={errors.many}
      />
    </WebI18nContext>
  );
}
function mockFileReads(reads: ReadonlyMap<string, () => Promise<string>>) {
  const original = File.prototype.text;
  return vi.spyOn(File.prototype, "text").mockImplementation(function (this: File) {
    const read = reads.get(this.name);
    return read ? read() : original.call(this);
  });
}
const errorText = () =>
  document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent ?? "";
it("keeps cached owned theme file read error current without rereading", async () => {
  using _session = errorSession();
  const file = themeFile("Literal $& {file}");
  let reject!: (cause: unknown) => void;
  const read = vi.fn<() => Promise<string>>().mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  using _reads = mockFileReads(new Map([[file.name, read]]));
  await using screen = await render(localized("en"));
  await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);
  await screen.rerender(localized("zh-CN"));
  reject(new Error("private read detail"));
  for (const locale of ["zh-CN", "en", "zh-CN"] as const) {
    await screen.rerender(localized(locale));
    await expect
      .poll(errorText)
      .toBe(translateWebSource(locale, "Could not read that file. Paste the JSON below instead."));
  }
  expect(read).toHaveBeenCalledOnce();
  expect(errors.install).not.toHaveBeenCalled();
});
it.each(["file", "paste"] as const)(
  "keeps cached owned oversized theme %s current",
  async (source) => {
    using _session = errorSession();
    const text = "x".repeat(256 * 1024 + 1);
    const file = new File([text], "Literal $& {file}.json", { type: "application/json" });
    using read = vi.spyOn(File.prototype, "text");
    await using screen = await render(localized("en"));
    if (source === "file")
      await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    else {
      await page.getByRole("textbox", { name: "Theme JSON", exact: true }).fill(text);
      await page.getByRole("button", { name: "Add theme", exact: true }).click();
    }
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(localized(locale));
      await expect.poll(errorText).toBe(
        translateWebMessage(locale, "settingsControls.themeTooLarge", {
          size: "256 KB",
          limit: "256 KB",
        }),
      );
    }
    expect(read).not.toHaveBeenCalled();
    expect(errors.install).not.toHaveBeenCalled();
  },
);
it.each(["fallback", "activation", "raw", "empty"] as const)(
  "keeps theme submit %s error ownership",
  async (kind) => {
    using _session = errorSession();
    if (kind === "activation") errors.imported.mockReturnValue(false);
    else
      errors.install = vi.fn(() => {
        throw kind === "fallback"
          ? null
          : new Error(kind === "empty" ? "" : "That theme file is invalid.");
      });
    await using screen = await render(localized("en"));
    await page
      .getByRole("textbox", { name: "Theme JSON", exact: true })
      .fill(JSON.stringify(theme("Literal $& {theme}")));
    await page.getByRole("button", { name: "Add theme", exact: true }).click();
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(localized(locale));
      await expect
        .poll(errorText)
        .toBe(
          kind === "empty"
            ? ""
            : kind === "raw"
              ? "That theme file is invalid."
              : translateWebSource(
                  locale,
                  kind === "activation"
                    ? "Theme added, but it could not be selected. Try again."
                    : "That theme file is invalid.",
                ),
        );
    }
    expect(errors.install).toHaveBeenCalledOnce();
    expect(errors.remove).toHaveBeenCalledTimes(kind === "activation" ? 1 : 0);
    expect(errors.close).not.toHaveBeenCalled();
  },
);
it("keeps owned theme batch segments and conflict append current with literal raw labels", async () => {
  using _session = errorSession();
  const conflict = parseThemeFile(theme("Conflict $& {theme}"));
  errors.themes = [conflict];
  errors.install = vi.fn(() => {
    throw null;
  });
  errors.update = vi.fn(() => {
    throw null;
  });
  const failed = themeFile("Literal $& {file}");
  const failedRead = vi.fn<() => Promise<string>>().mockRejectedValue(null);
  const raw = themeFile("Raw $& {file}");
  const rawRead = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("not a theme file"));
  const empty = themeFile("Empty $& {file}");
  const emptyRead = vi.fn<() => Promise<string>>().mockRejectedValue(new Error(""));
  const large = new File(["x".repeat(256 * 1024 + 1)], "Large $& {file}.json", {
    type: "application/json",
  });
  const largeRead = vi.fn<() => Promise<string>>().mockResolvedValue("");
  using _reads = mockFileReads(
    new Map([
      [failed.name, failedRead],
      [raw.name, rawRead],
      [empty.name, emptyRead],
      [large.name, largeRead],
    ]),
  );
  await using screen = await render(localized("en"));
  await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, [
    failed,
    raw,
    empty,
    large,
    themeFile("Install $& {theme}"),
    themeFile(conflict.label),
  ]);
  await expect
    .element(page.getByRole("button", { name: "Update existing", exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Update existing", exact: true }).click();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(localized(locale));
    const expected = [
      `${failed.name}: ${translateWebSource(locale, "not a theme file")}`,
      `${raw.name}: not a theme file`,
      `${empty.name}: `,
      translateWebMessage(locale, "settingsControls.themeFileTooLarge", { name: large.name }),
      `Install $& {theme}: ${translateWebSource(locale, "could not install")}`,
      `${conflict.label}: ${translateWebSource(locale, "failed")}`,
    ].join("; ");
    await expect.poll(errorText).toBe(expected);
  }
  expect(failedRead).toHaveBeenCalledOnce();
  expect(rawRead).toHaveBeenCalledOnce();
  expect(emptyRead).toHaveBeenCalledOnce();
  expect(largeRead).not.toHaveBeenCalled();
  expect(errors.install).toHaveBeenCalledOnce();
  expect(errors.update).toHaveBeenCalledOnce();
  expect(errors.close).not.toHaveBeenCalled();
});
it("keeps the actual owned copy-cap error current without installing a copy", async () => {
  using _session = errorSession();
  const name = "Literal $& {theme}";
  errors.themes = [
    parseThemeFile(theme(name)),
    ...Array.from({ length: 99 }, (_, i) => parseThemeFile(theme(`${name} (${i + 1})`))),
  ];
  await using screen = await render(localized("en"));
  await page
    .getByRole("textbox", { name: "Theme JSON", exact: true })
    .fill(JSON.stringify(theme(name)));
  await page.getByRole("button", { name: "Add theme", exact: true }).click();
  await page.getByRole("button", { name: "Keep both", exact: true }).click();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(localized(locale));
    await expect
      .poll(errorText)
      .toBe(
        `${name}: ${translateWebMessage(locale, "settingsControls.tooManyThemeCopies", { name })}`,
      );
  }
  expect(errors.install).not.toHaveBeenCalled();
  expect(errors.close).not.toHaveBeenCalled();
});

it("does not mistake a raw copy-cap lookalike for the local constructor", async () => {
  using _session = errorSession();
  const name = "Literal $& {theme}";
  const raw = `Too many copies of "${name}".`;
  errors.themes = [parseThemeFile(theme(name))];
  errors.update = vi.fn(() => {
    throw Object.assign(new Error(raw), { code: "copies" });
  });
  await using screen = await render(localized("en"));
  await page
    .getByRole("textbox", { name: "Theme JSON", exact: true })
    .fill(JSON.stringify(theme(name)));
  await page.getByRole("button", { name: "Add theme", exact: true }).click();
  await page.getByRole("button", { name: "Update existing", exact: true }).click();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(localized(locale));
    await expect.poll(errorText).toBe(`${name}: ${raw}`);
  }
  expect(errors.update).toHaveBeenCalledOnce();
  expect(errors.close).not.toHaveBeenCalled();
});

import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { ThemeEditorPanel } from "./ThemeEditorPanel";

import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { getStandardThemeColors, parseThemeFile, type ThemeDefinition } from "../../themePalette";
const fixture = vi.hoisted(() => ({
  themes: [] as ThemeDefinition[],
  install: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  saved: vi.fn(),
  close: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("../../themePalette", async (original) => ({
  ...(await original<typeof import("../../themePalette")>()),
  getCustomThemes: () => fixture.themes,
  installCustomTheme: fixture.install,
  updateCustomTheme: fixture.update,
  removeCustomTheme: fixture.remove,
}));

function dragHeader(panel: HTMLElement, toX: number, toY: number) {
  const header = panel.querySelector<HTMLElement>("h2")!.closest<HTMLElement>(".cursor-grab")!;
  const rect = panel.getBoundingClientRect();
  const start = { clientX: rect.left + 40, clientY: rect.top + 10 };
  const init = { bubbles: true, button: 0, pointerId: 1 };
  header.dispatchEvent(new PointerEvent("pointerdown", { ...init, ...start }));
  header.dispatchEvent(
    new PointerEvent("pointermove", { ...init, clientX: toX + 40, clientY: toY + 10 }),
  );
  header.dispatchEvent(new PointerEvent("pointerup", init));
}

function dragResizeHandle(panel: HTMLElement, byX: number) {
  const handle = panel.querySelector<HTMLElement>(".cursor-se-resize")!;
  const rect = handle.getBoundingClientRect();
  const init = { bubbles: true, button: 0, pointerId: 2 };
  const start = { clientX: rect.left + 4, clientY: rect.top + 4 };
  handle.dispatchEvent(new PointerEvent("pointerdown", { ...init, ...start }));
  handle.dispatchEvent(
    new PointerEvent("pointermove", {
      ...init,
      clientX: start.clientX + byX,
      clientY: start.clientY,
    }),
  );
  handle.dispatchEvent(new PointerEvent("pointerup", init));
}

function pointerAt(target: HTMLElement, type: string, xFraction: number) {
  const rect = target.getBoundingClientRect();
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      pointerId: 3,
      clientX: rect.left + rect.width * xFraction,
      clientY: rect.top + rect.height / 2,
    }),
  );
}

async function renderPanel() {
  await page.viewport(1280, 900);
  const stack = new AsyncDisposableStack();
  // Synthetic pointer ids are not active pointers, so the browser would reject capture.
  stack.use(vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {}));
  // Tailwind is not loaded here; give the panel its fixed, card-sized box.
  const style = document.head.appendChild(document.createElement("style"));
  style.textContent = "[data-theme-editor-panel]{position:fixed;width:400px;height:300px}";
  stack.defer(() => style.remove());
  const screen = stack.use(
    await render(
      <ThemeEditorPanel
        open
        onOpenChange={() => {}}
        onSaved={() => true}
        editingTheme={null}
        initialAppearance="dark"
        restoreTheme={() => {}}
      />,
    ),
  );
  const panel = screen.getByRole("dialog", { name: "Create theme" });
  await expect.element(panel).toBeVisible();
  return {
    panel: panel.element() as HTMLElement,
    [Symbol.asyncDispose]: () => stack.disposeAsync(),
  };
}

describe("ThemeEditorPanel", () => {
  it("keeps its left edge when resized after the window shrank", async () => {
    await using view = await renderPanel();
    dragHeader(view.panel, 700, 40);
    await expect.poll(() => view.panel.style.left).toBe("700px");

    await page.viewport(600, 900);
    await expect.poll(() => Number.parseFloat(view.panel.style.left)).toBeLessThan(600);
    const clampedLeft = view.panel.style.left;

    dragResizeHandle(view.panel, -100);
    await expect.poll(() => view.panel.style.width).not.toBe("");
    expect(view.panel.style.left).toBe(clampedLeft);
  });

  it("returns to where the user left it when the window shrinks and grows back", async () => {
    await page.viewport(1280, 900);
    // Synthetic pointer ids are not active pointers, so the browser would reject capture.
    using _capture = vi
      .spyOn(HTMLElement.prototype, "setPointerCapture")
      .mockImplementation(() => {});
    // Tailwind is not loaded here; give the panel its fixed, card-sized box.
    const style = document.head.appendChild(document.createElement("style"));
    style.textContent = "[data-theme-editor-panel]{position:fixed;width:400px;height:300px}";
    using _style = { [Symbol.dispose]: () => style.remove() };
    await using screen = await render(
      <ThemeEditorPanel
        open
        onOpenChange={() => {}}
        onSaved={() => true}
        editingTheme={null}
        initialAppearance="dark"
        restoreTheme={() => {}}
      />,
    );
    const panel = screen.getByRole("dialog", { name: "Create theme" });
    await expect.element(panel).toBeVisible();

    dragHeader(panel.element() as HTMLElement, 700, 40);
    await expect.poll(() => (panel.element() as HTMLElement).style.left).toBe("700px");

    await page.viewport(600, 900);
    await expect
      .poll(() => Number.parseFloat((panel.element() as HTMLElement).style.left))
      .toBeLessThan(600);

    await page.viewport(1280, 900);
    await expect.poll(() => (panel.element() as HTMLElement).style.left).toBe("700px");
  });

  it("restores the colors from before the picker opened when Escape closes it", async () => {
    await using _view = await renderPanel();
    const hex = page.getByRole("textbox", { name: "Accent hex value" });
    const original = (hex.element() as HTMLInputElement).value;
    await userEvent.click(page.getByRole("button", { name: "Choose Accent color" }));
    const hue = page.getByRole("slider", { name: "Accent hue" });
    await expect.element(hue).toBeInTheDocument();
    const hueSlider = hue.element() as HTMLElement;

    await act(async () => {
      pointerAt(hueSlider, "pointerdown", 0.5);
      pointerAt(hueSlider, "pointerup", 0.5);
    });
    await expect.element(hex).not.toHaveValue(original);

    await act(async () => {
      pointerAt(hueSlider, "pointerdown", 0.25);
      hueSlider.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      // The drag keeps going while the picker animates out.
      pointerAt(hueSlider, "pointermove", 0.75);
      pointerAt(hueSlider, "pointerup", 0.75);
    });
    expect((hex.element() as HTMLInputElement).value).toBe(original);
  });
});

function setupErrors() {
  fixture.themes = [];
  fixture.install.mockReset().mockImplementation((theme: ThemeDefinition) => theme);
  fixture.update.mockReset().mockImplementation((theme: ThemeDefinition) => theme);
  fixture.remove.mockReset();
  fixture.saved.mockReset().mockReturnValue(true);
  fixture.close.mockReset();
  fixture.restore.mockReset();
}
function theme(label: string, both = false) {
  return parseThemeFile({
    version: 1,
    name: label,
    appearance: "dark",
    colors: getStandardThemeColors("dark"),
    ...(both ? { variants: { light: getStandardThemeColors("light") } } : {}),
  });
}
function localizedPanel(
  locale: "en" | "zh-CN",
  editingTheme: ThemeDefinition | null,
  seedName: string,
) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ThemeEditorPanel
        open
        onOpenChange={fixture.close}
        onSaved={fixture.saved}
        editingTheme={editingTheme}
        initialAppearance="dark"
        seedName={seedName}
        restoreTheme={fixture.restore}
      />
    </WebI18nContext>
  );
}
const errorText = () =>
  document.querySelector('[data-theme-editor-panel] p[aria-live="polite"]')?.textContent ?? "";
it.each(["create", "save", "activate", "collision", "full"] as const)(
  "keeps cached owned theme %s failure current",
  async (kind) => {
    setupErrors();
    const opaque = "Literal $& {theme}";
    const editing = kind === "save" || kind === "collision" ? theme("Editing fixture") : null;
    if (kind === "create")
      fixture.install.mockImplementation(() => {
        throw null;
      });
    if (kind === "save")
      fixture.update.mockImplementation(() => {
        throw null;
      });
    if (kind === "activate") fixture.saved.mockReturnValue(false);
    if (kind === "collision" || kind === "full") fixture.themes = [theme(opaque, kind === "full")];
    await using screen = await render(localizedPanel("en", editing, opaque));
    if (kind === "collision")
      await page.getByRole("textbox", { name: "Theme name", exact: true }).fill(opaque);
    const action =
      kind === "save"
        ? "Save changes"
        : kind === "collision"
          ? `Merge into “${opaque}”`
          : kind === "full"
            ? "Add Dark palette"
            : "Create theme";
    await page.getByRole("button", { name: action, exact: true }).click();
    const english =
      kind === "create"
        ? "Could not create the theme."
        : kind === "save"
          ? "Could not save the theme."
          : kind === "activate"
            ? "Theme saved, but it could not be made active. Try again."
            : kind === "collision"
              ? `“${opaque}” already has a dark palette. Pick another name.`
              : `“${opaque}” already has light and dark palettes. Pick another name.`;
    const chinese =
      kind === "create"
        ? "无法创建主题。"
        : kind === "save"
          ? "无法保存主题。"
          : kind === "activate"
            ? "主题已保存，但无法启用。请重试。"
            : kind === "collision"
              ? `“${opaque}”已有深色调色板。请使用其他名称。`
              : `“${opaque}”已有浅色和深色调色板。请使用其他名称。`;
    await expect.poll(errorText).toBe(english);
    const counts = [
      fixture.install.mock.calls.length,
      fixture.update.mock.calls.length,
      fixture.remove.mock.calls.length,
      fixture.saved.mock.calls.length,
    ];
    for (const locale of ["zh-CN", "en"] as const) {
      await screen.rerender(localizedPanel(locale, editing, opaque));
      await expect.poll(errorText).toBe(locale === "en" ? english : chinese);
    }
    expect([
      fixture.install.mock.calls.length,
      fixture.update.mock.calls.length,
      fixture.remove.mock.calls.length,
      fixture.saved.mock.calls.length,
    ]).toEqual(counts);
    expect(fixture.close).not.toHaveBeenCalled();
    expect(fixture.restore).not.toHaveBeenCalled();
    if (kind === "activate") {
      expect(fixture.install).toHaveBeenCalledOnce();
      expect(fixture.remove).toHaveBeenCalledOnce();
    }
    if (kind === "collision" || kind === "full") {
      expect(fixture.install).not.toHaveBeenCalled();
      expect(fixture.update).not.toHaveBeenCalled();
    }
  },
);
it.each(["Could not create the theme.", ""])("keeps raw theme failure opaque (%s)", async (raw) => {
  setupErrors();
  fixture.install.mockImplementation(() => {
    throw new Error(raw);
  });
  await using screen = await render(localizedPanel("en", null, "Literal $& {theme}"));
  await page.getByRole("button", { name: "Create theme", exact: true }).click();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(localizedPanel(locale, null, "Literal $& {theme}"));
    expect(errorText()).toBe(raw);
  }
  expect(fixture.install).toHaveBeenCalledOnce();
  expect(fixture.saved).not.toHaveBeenCalled();
});

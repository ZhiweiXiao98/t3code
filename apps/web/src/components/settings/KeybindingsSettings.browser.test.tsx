import { RegistryProvider } from "@effect/atom-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent, type Locator } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: () => true,
  useEnvironmentsWithScope: ((environments: ReadonlyArray<{ environmentId: string }>) =>
    new Set(environments.map(({ environmentId }) => environmentId))) as never,
  readEnvironmentScope: () => true,
}));
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => vi.fn()) as never,
}));
vi.mock(import("./SettingsScopeContext"), async (original) => ({
  ...(await original()),
  useSettingsScope: (() => {
    const environment = {
      environmentId: "env",
      label: "Build workstation",
      serverConfig: { keybindings: [], keybindingsConfigPath: null, availableEditors: [] },
    };
    return {
      scope: { kind: "environment" },
      environment,
      environments: [environment],
      connectedEnvironments: [environment],
      targets: [],
      target: null,
    };
  }) as never,
}));

import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { KeybindingsSettingsPanel } from "./KeybindingsSettings";

// The modal dialog's inert layer swallows pointer events in this harness, so drive the DOM.
async function activate(locator: Locator, action: "click" | "focus") {
  await expect.element(locator).toBeVisible();
  (locator.element() as HTMLElement)[action]();
}

const existingField = page.getByRole("textbox", { name: "Keybinding for Sidebar: Toggle" });
const existingPill = page.getByRole("button", { name: /^Edit shortcut for Sidebar: Toggle:/ });
const newField = page.getByRole("textbox", { name: "Keybinding for new keybinding" });
const chineseNewField = page.getByRole("textbox", { name: "新快捷键 的快捷键" });

describe("Esc in a shortcut recorder", () => {
  it.each<{
    name: string;
    locale: "en" | "zh-CN";
    field: Locator;
    open: () => Promise<void>;
    expectReset: () => Promise<void>;
  }>([
    {
      name: "existing binding",
      locale: "en",
      field: existingField,
      open: () => activate(existingPill, "click"),
      expectReset: async () => {
        await expect.element(existingField).not.toBeInTheDocument();
        await expect.element(existingPill).toHaveFocus();
        await expect.element(page.getByRole("button", { name: "Save" })).not.toBeInTheDocument();
      },
    },
    {
      name: "new binding",
      locale: "en",
      field: newField,
      open: async () => {
        await activate(page.getByRole("button", { name: "Add keybinding" }), "click");
        await activate(newField, "focus");
      },
      expectReset: async () => {
        await expect.element(newField).toHaveValue("");
        await expect.element(newField).toHaveAttribute("placeholder", "Unassigned");
      },
    },
    {
      name: "new binding in Simplified Chinese",
      locale: "zh-CN",
      field: chineseNewField,
      open: async () => {
        await activate(page.getByRole("button", { name: "添加快捷键" }), "click");
        await activate(chineseNewField, "focus");
      },
      expectReset: async () => {
        await expect.element(chineseNewField).toHaveValue("");
        await expect.element(chineseNewField).toHaveAttribute("placeholder", "未分配");
      },
    },
  ])(
    "leaves the $name field without closing Settings",
    async ({ locale, field, open, expectReset }) => {
      const onOpenChange = vi.fn();
      await using _screen = await render(
        <WebI18nContext
          value={{
            locale,
            appLocale: locale,
            setAppLocale: () => undefined,
            t: (key, values) => translateWebMessage(locale, key, values),
          }}
        >
          <Dialog open onOpenChange={onOpenChange}>
            <DialogPopup>
              <DialogTitle>Settings</DialogTitle>
              <KeybindingsSettingsPanel />
            </DialogPopup>
          </Dialog>
        </WebI18nContext>,
      );

      await open();
      await userEvent.keyboard("{Control>}k{/Control}");
      await expect.element(field).not.toHaveValue("");
      await userEvent.tab();
      await activate(field, "focus");
      await expect
        .element(field)
        .toHaveAttribute("placeholder", locale === "en" ? "Press shortcut" : "按下快捷键");

      await userEvent.keyboard("{Escape}");

      expect(onOpenChange).not.toHaveBeenCalled();
      expect(document.activeElement?.matches("[data-keybinding-capture]")).toBe(false);
      await expectReset();

      await userEvent.keyboard("{Escape}");
      expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
    },
  );
});

it("re-enables Save when a When editor closes on an expression it could not parse", async () => {
  await using screen = await render(
    <RegistryProvider>
      <KeybindingsSettingsPanel />
    </RegistryProvider>,
  );
  const whenTrigger = screen.getByRole("button", { name: "Edit when clause for Terminal: Toggle" });
  const expression = screen.getByRole("textbox", { name: "When expression" });

  await whenTrigger.click();
  await userEvent.type(expression, "terminalFocus");
  await userEvent.type(expression, " &&");
  await expect.element(screen.getByRole("button", { name: "Save" })).toBeDisabled();

  await userEvent.keyboard("{Escape}");
  await whenTrigger.click();

  await expect.element(expression).toHaveValue("terminalFocus");
  await expect.element(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("relocalizes a real invalid when expression while preserving the draft and disabled Save", async () => {
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <RegistryProvider>
        <KeybindingsSettingsPanel />
      </RegistryProvider>
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await screen.getByRole("button", { name: "Edit when clause for Terminal: Toggle" }).click();
  const expression = screen.getByRole("textbox", { name: "When expression" });
  await userEvent.type(expression, "terminalFocus &&");
  await expect
    .element(screen.getByText("Use variables with !, &&, ||, and parentheses.", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await screen.rerender(surface("zh-CN"));
  await expect
    .element(screen.getByText("请使用变量以及 !、&&、|| 和括号。", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await screen.rerender(surface("en"));
  await expect.element(expression).toHaveValue("terminalFocus &&");
  await expect.element(screen.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

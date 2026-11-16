import { compileResolvedKeybindingsConfig } from "@t3tools/shared/keybindings";
import { RegistryProvider } from "@effect/atom-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent, type Locator } from "vite-plus/test/browser";

import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({
  active: false,
  saveMode: false,
  removeMode: false,
  remove: vi.fn(),
  upsert: vi.fn(),
  path: null as string | null,
  allowed: true,
  locale: "en" as "en" | "zh-CN",
  open: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("../../editorPreferences", async (original) => {
  const actual = await original<typeof import("../../editorPreferences")>();
  return {
    ...actual,
    useOpenInPreferredEditor: (...args: Parameters<typeof actual.useOpenInPreferredEditor>) => {
      const open = actual.useOpenInPreferredEditor(...args);
      return fixture.active ? fixture.open : open;
    },
  };
});
vi.mock("~/i18n/readWebI18n", async (original) => {
  const actual = await original<typeof import("~/i18n/readWebI18n")>();
  return {
    ...actual,
    readWebI18n: () => {
      if (!fixture.active) return actual.readWebI18n();
      const locale = fixture.locale;
      return {
        locale,
        t: (
          key: Parameters<typeof translateWebMessage>[1],
          values: Parameters<typeof translateWebMessage>[2],
        ) => translateWebMessage(locale, key, values),
      };
    },
  };
});

vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: () => fixture.allowed,
  useEnvironmentsWithScope: ((environments: ReadonlyArray<{ environmentId: string }>) =>
    new Set(environments.map(({ environmentId }) => environmentId))) as never,
  readEnvironmentScope: () => fixture.allowed,
}));
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: unknown) =>
    fixture.removeMode && command === serverEnvironment.removeKeybinding
      ? fixture.remove
      : fixture.saveMode && command === serverEnvironment.upsertKeybinding
        ? fixture.upsert
        : fixture.active
          ? fixture.mutation
          : vi.fn()) as never,
}));
vi.mock(import("./SettingsScopeContext"), async (original) => ({
  ...(await original()),
  useSettingsScope: (() => {
    const environment = {
      environmentId: "env",
      label: "Build workstation",
      serverConfig: {
        keybindings: fixture.removeMode
          ? compileResolvedKeybindingsConfig([
              { command: "sidebar.toggle", key: "f8", when: "terminalFocus" },
            ])
          : [],
        keybindingsConfigPath: fixture.path,
        availableEditors: [],
      },
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

import { serverEnvironment } from "../../state/server";
import { toastManager } from "../ui/toast";
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

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "uses settlement locale for keybindings editor failure: %s",
  async (kind) => {
    fixture.active = true;
    fixture.path = "/fixture/Literal $& {path}/keybindings.json";
    fixture.allowed = true;
    fixture.locale = "en";
    fixture.open.mockReset();
    fixture.mutation.mockReset();
    using _restore = {
      [Symbol.dispose]() {
        fixture.active = false;
        fixture.path = null;
        fixture.allowed = true;
        fixture.locale = "en";
      },
    };
    let finish!: (result: AsyncResult.AsyncResult<never, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<never, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.open.mockReturnValue(pending);
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
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
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await pending;
        });
      },
    };
    await screen.getByRole("button", { name: "Open keybindings.json", exact: true }).click();
    expect(fixture.open).toHaveBeenCalledExactlyOnceWith(fixture.path);
    expect(toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "raw"
                  ? new Error("Literal $& {editor}")
                  : kind === "empty"
                    ? new Error("")
                    : null,
              ),
        ),
      );
      await pending;
    });
    if (kind === "interrupted") expect(toast).not.toHaveBeenCalled();
    else
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法打开快捷键配置文件",
        description:
          kind === "raw"
            ? "Literal $& {editor}"
            : kind === "empty"
              ? ""
              : "未能打开快捷键配置文件。",
      });
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
    expect(fixture.mutation).not.toHaveBeenCalled();
    expect(fixture.open).toHaveBeenCalledTimes(1);
  },
);

it("does not open the keybindings editor without a path or current scope", async () => {
  fixture.active = true;
  fixture.path = null;
  fixture.allowed = true;
  fixture.locale = "en";
  fixture.open.mockReset();
  fixture.mutation.mockReset();
  using _restore = {
    [Symbol.dispose]() {
      fixture.active = false;
      fixture.path = null;
      fixture.allowed = true;
    },
  };
  using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
  const surface = () => (
    <RegistryProvider>
      <KeybindingsSettingsPanel />
    </RegistryProvider>
  );
  await using screen = await render(surface());
  const button = screen.getByRole("button", { name: "Open keybindings.json", exact: true });
  await expect.element(button).toBeDisabled();
  await act(() => {
    button.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  fixture.path = "/fixture/keybindings.json";
  await screen.rerender(surface());
  await expect.element(button).toBeEnabled();
  fixture.allowed = false;
  await button.click();
  expect(fixture.open).not.toHaveBeenCalled();
  await screen.rerender(surface());
  await expect.element(button).toBeDisabled();
  expect(fixture.mutation).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
});

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "uses settlement locale for keybinding save failure: %s",
  async (kind) => {
    fixture.active = true;
    fixture.saveMode = true;
    fixture.allowed = true;
    fixture.path = null;
    fixture.locale = "en";
    fixture.upsert.mockReset();
    fixture.mutation.mockReset();
    fixture.open.mockReset();
    using _restore = {
      [Symbol.dispose]() {
        fixture.active = false;
        fixture.saveMode = false;
        fixture.allowed = true;
        fixture.path = null;
        fixture.locale = "en";
      },
    };
    let finish!: (result: AsyncResult.AsyncResult<never, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<never, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.upsert.mockReturnValue(pending);
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
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
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await pending;
        });
      },
    };
    await screen.getByRole("button", { name: /^Edit shortcut for Sidebar: Toggle:/ }).click();
    const input = screen.getByRole("textbox", {
      name: "Keybinding for Sidebar: Toggle",
      exact: true,
    });
    await expect.element(input).toHaveFocus();
    await userEvent.keyboard("{F8}");
    await expect.element(input).toHaveValue("f8");
    await screen.getByRole("button", { name: "Save", exact: true }).click();
    expect(fixture.upsert).toHaveBeenCalledExactlyOnceWith({
      environmentId: "env",
      input: {
        command: "sidebar.toggle",
        key: "f8",
        replace: { command: "sidebar.toggle", key: "mod+b" },
      },
    });
    const saving = screen.getByRole("button", { name: "Saving", exact: true });
    await expect.element(saving).toBeDisabled();
    await act(() => {
      saving.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(fixture.upsert).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "raw"
                  ? new Error("Literal $& {save}")
                  : kind === "empty"
                    ? new Error("")
                    : null,
              ),
        ),
      );
      await pending;
    });
    if (kind === "interrupted") expect(toast).not.toHaveBeenCalled();
    else
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法保存快捷键",
        description:
          kind === "raw" ? "Literal $& {save}" : kind === "empty" ? "" : "未能保存快捷键。",
      });
    await expect.element(screen.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    await expect
      .element(screen.getByRole("textbox", { name: "Keybinding for Sidebar: Toggle", exact: true }))
      .toHaveValue("f8");
    expect(toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
    expect(fixture.upsert).toHaveBeenCalledTimes(1);
    expect(fixture.mutation).not.toHaveBeenCalled();
    expect(fixture.open).not.toHaveBeenCalled();
  },
);

it("rechecks write scope before saving a recorded keybinding and allows Escape cancellation", async () => {
  fixture.active = true;
  fixture.saveMode = true;
  fixture.allowed = true;
  fixture.path = null;
  fixture.locale = "en";
  fixture.upsert.mockReset();
  fixture.mutation.mockReset();
  fixture.open.mockReset();
  using _restore = {
    [Symbol.dispose]() {
      fixture.active = false;
      fixture.saveMode = false;
      fixture.allowed = true;
      fixture.path = null;
      fixture.locale = "en";
    },
  };
  using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
  await using screen = await render(
    <RegistryProvider>
      <KeybindingsSettingsPanel />
    </RegistryProvider>,
  );
  await screen.getByRole("button", { name: /^Edit shortcut for Sidebar: Toggle:/ }).click();
  const input = screen.getByRole("textbox", {
    name: "Keybinding for Sidebar: Toggle",
    exact: true,
  });
  await expect.element(input).toHaveFocus();
  await userEvent.keyboard("{F8}");
  const save = screen.getByRole("button", { name: "Save", exact: true });
  await expect.element(save).toBeEnabled();
  fixture.allowed = false;
  await save.click();
  expect(fixture.upsert).not.toHaveBeenCalled();
  await input.click();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(screen.getByRole("button", { name: /^Edit shortcut for Sidebar: Toggle:/ }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Save", exact: true }))
    .not.toBeInTheDocument();
  expect(fixture.mutation).not.toHaveBeenCalled();
  expect(fixture.open).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
});

it.each(["owned", "raw", "empty", "interrupted", "denied"] as const)(
  "uses settlement locale for keybinding remove failure: %s",
  async (kind) => {
    fixture.active = true;
    fixture.removeMode = true;
    fixture.allowed = true;
    fixture.locale = "en";
    fixture.remove.mockReset();
    fixture.upsert.mockReset();
    fixture.mutation.mockReset();
    fixture.open.mockReset();
    using _restore = {
      [Symbol.dispose]() {
        fixture.active = false;
        fixture.removeMode = false;
        fixture.allowed = true;
        fixture.locale = "en";
      },
    };
    let finish!: (result: AsyncResult.AsyncResult<never, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<never, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.remove.mockReturnValue(pending);
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
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
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await pending;
        });
      },
    };
    const trigger = screen.getByRole("button", {
      name: "Actions for Sidebar: Toggle",
      exact: true,
    });
    await trigger.click();
    const remove = page.getByRole("menuitem", { name: "Remove", exact: true });
    await expect.element(remove).toBeEnabled();
    if (kind === "denied") fixture.allowed = false;
    await remove.click();
    if (kind === "denied") {
      expect(fixture.remove).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    } else {
      expect(fixture.remove).toHaveBeenCalledExactlyOnceWith({
        environmentId: "env",
        input: { command: "sidebar.toggle", key: "f8", when: "terminalFocus" },
      });
      await expect.element(trigger).toBeDisabled();
      await act(() => {
        trigger.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
      });
      expect(fixture.remove).toHaveBeenCalledTimes(1);
      expect(toast).not.toHaveBeenCalled();
      fixture.locale = "zh-CN";
      await screen.rerender(surface("zh-CN"));
      await act(async () => {
        finish(
          AsyncResult.failure(
            kind === "interrupted"
              ? Cause.interrupt()
              : Cause.fail(
                  kind === "raw"
                    ? new Error("Literal $& {remove}")
                    : kind === "empty"
                      ? new Error("")
                      : null,
                ),
          ),
        );
        await pending;
      });
      if (kind === "interrupted") expect(toast).not.toHaveBeenCalled();
      else
        expect(toast).toHaveBeenCalledExactlyOnceWith({
          type: "error",
          title: "无法移除快捷键",
          description:
            kind === "raw" ? "Literal $& {remove}" : kind === "empty" ? "" : "未能移除快捷键。",
        });
      fixture.locale = "en";
      await screen.rerender(surface("en"));
      expect(toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
      expect(fixture.remove).toHaveBeenCalledTimes(1);
    }
    await expect.element(trigger).toBeEnabled();
    await expect
      .element(screen.getByRole("button", { name: /^Edit shortcut for Sidebar: Toggle:/ }))
      .toBeVisible();
    expect(fixture.upsert).not.toHaveBeenCalled();
    expect(fixture.mutation).not.toHaveBeenCalled();
    expect(fixture.open).not.toHaveBeenCalled();
  },
);

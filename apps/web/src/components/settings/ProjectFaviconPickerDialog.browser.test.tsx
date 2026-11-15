import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId } from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { getLocalFileManagerName } from "~/lib/utils";
import { act, render } from "../../../test/render";
import { ProjectFaviconPickerDialog } from "./ProjectFaviconPickerDialog";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  toast: vi.fn(),
  pick: vi.fn(),
  select: vi.fn(),
  open: vi.fn(),
}));
vi.mock("../files/projectFilesQueryState", async (original) => {
  const actual = await original<typeof import("../files/projectFilesQueryState")>();
  const result = { entries: [], error: null, isPending: false, matchedQuery: "" };
  return { ...actual, useProjectFilePickerQuery: () => result };
});
vi.mock("~/state/server", async (original) => {
  const actual = await original<typeof import("~/state/server")>();
  const { Atom } = await import("effect/reactivity");
  const { compileResolvedKeybindingsConfig } = await import("@t3tools/shared/keybindings");
  return {
    ...actual,
    primaryServerKeybindingsAtom: Atom.make(compileResolvedKeybindingsConfig([])),
  };
});
vi.mock("~/hooks/useTheme", async (original) => ({
  ...(await original<typeof import("~/hooks/useTheme")>()),
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: state.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = state.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
const manager = getLocalFileManagerName(navigator.platform);
function surface(locale: "en" | "zh-CN", registry: AtomRegistry.AtomRegistry, withPicker = true) {
  state.locale = locale;
  return (
    <RegistryContext.Provider value={registry}>
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <ProjectFaviconPickerDialog
          open
          cwd="/literal/$&/{project}"
          environmentId={EnvironmentId.make("favicon-fixture")}
          projectName="Literal $& {project}"
          onSelect={state.select}
          onOpenChange={state.open}
          {...(withPicker ? { onPickExternal: state.pick } : {})}
        />
      </WebI18nContext>
    </RegistryContext.Provider>
  );
}
function reset() {
  state.pick.mockReset();
  state.toast.mockClear();
  state.select.mockClear();
  state.open.mockClear();
  return {
    [Symbol.dispose]() {
      state.locale = "en";
      state.pick.mockReset();
    },
  };
}
it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {picker}")],
  ["empty", new Error("")],
] as const)("uses settlement locale for project icon picker failure: %s", async (_kind, error) => {
  using _reset = reset();
  let reject!: (error: unknown) => void;
  let resolve!: (path: string | null) => void;
  const promise = new Promise<string | null>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  void promise.catch(() => {});
  state.pick.mockReturnValue(promise);
  const registry = AtomRegistry.make();
  using _registry = {
    [Symbol.dispose]() {
      registry.dispose();
    },
  };
  await using screen = await render(surface("en", registry));
  await using _drain = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        resolve(null);
        await promise.catch(() => {});
      });
    },
  };
  const button = page.getByRole("button", { name: "Open in " + manager, exact: true });
  await expect
    .element(page.getByRole("dialog", { name: "Choose project icon", exact: true }))
    .toBeVisible();
  await button.click();
  expect(state.pick).toHaveBeenCalledExactlyOnceWith();
  await expect.element(button).toBeDisabled();
  await act(async () => {
    button.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(state.pick).toHaveBeenCalledTimes(1);
  await screen.rerender(surface("zh-CN", registry));
  expect(state.toast).not.toHaveBeenCalled();
  await act(async () => {
    reject(error);
    await promise.catch(() => {});
  });
  expect(state.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法打开图片选择器",
    description: error instanceof Error ? error.message : "发生错误。",
  });
  await expect
    .element(page.getByRole("button", { name: "在 " + manager + " 中打开", exact: true }))
    .toBeEnabled();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.open).not.toHaveBeenCalled();
  await screen.rerender(surface("en", registry));
  expect(state.toast).toHaveBeenCalledTimes(1);
});
it("keeps the project icon dialog open when external picking is cancelled", async () => {
  using _reset = reset();
  let resolve!: (path: string | null) => void;
  const promise = new Promise<string | null>((done) => {
    resolve = done;
  });
  state.pick.mockReturnValue(promise);
  const registry = AtomRegistry.make();
  using _registry = {
    [Symbol.dispose]() {
      registry.dispose();
    },
  };
  await using _screen = await render(surface("en", registry));
  await using _drain = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        resolve(null);
        await promise;
      });
    },
  };
  const button = page.getByRole("button", { name: "Open in " + manager, exact: true });
  await button.click();
  await expect.element(button).toBeDisabled();
  await act(async () => {
    resolve(null);
    await promise;
  });
  await expect.element(button).toBeEnabled();
  await expect
    .element(page.getByRole("dialog", { name: "Choose project icon", exact: true }))
    .toBeVisible();
  expect(state.pick).toHaveBeenCalledExactlyOnceWith();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.open).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
});
it("omits the external picker action when no callback is supplied", async () => {
  using _reset = reset();
  const registry = AtomRegistry.make();
  using _registry = {
    [Symbol.dispose]() {
      registry.dispose();
    },
  };
  await using _screen = await render(surface("en", registry, false));
  await expect
    .element(page.getByRole("dialog", { name: "Choose project icon", exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Open in " + manager, exact: true }))
    .not.toBeInTheDocument();
  expect(state.pick).not.toHaveBeenCalled();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.open).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
});

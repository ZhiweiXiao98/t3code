import { threadChipCopyTarget } from "@t3tools/client-runtime/thread-reference";
import {
  COMPOSER_CONTEXT_CLIPBOARD_MIME,
  encodeComposerContextFragment,
} from "@t3tools/shared/composerContextClipboard";
import { configuredHostedAppUrl } from "../hostedPairing";
import { toastManager } from "./ui/toast";
import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The thread route loads ChatView lazily; its first transform would eat the test's timeout.
import "~/components/ChatView";
import {
  __setClientSettingsForTests,
  updateClientSettings,
  getClientSettings,
} from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  dispatchedCommands,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

vi.mock(import("~/state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const { compileResolvedKeybindingsConfig } = await import("@t3tools/shared/keybindings");
  const keybindings = compileResolvedKeybindingsConfig([
    { key: "mod+shift+]", command: "thread.next", when: "!previewFocus && !previewOpen" },
    { key: "mod+1", command: "thread.jump.1", when: "!previewFocus" },
  ]);
  return { ...actual, primaryServerKeybindingsAtom: Atom.make(keybindings) };
});

it("uses the current language each time a sidebar context menu opens", async () => {
  const thread = threadWithHistory("locale-menu", 1);
  using _environment = installFakeEnvironment([thread]);
  const previousSettings = getClientSettings();
  using _settings = {
    [Symbol.dispose]() {
      __setClientSettingsForTests(previousSettings);
    },
  };
  const settings = {
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  };
  __setClientSettingsForTests({ ...settings, appLocale: "zh-CN" });
  await page.viewport(1400, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  await page.getByRole("combobox", { name: "按项目筛选任务", exact: true }).click();
  await expect.element(page.getByRole("option", { name: "全部项目", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "全部项目", exact: true }).click();
  // The title also has an sr-only duplicate. Click the actual context-menu owner.
  const threadKey = scopedThreadKey(scopeThreadRef(ENVIRONMENT_ID, thread.id));
  const row = page.getByRole("button", { name: /^Thread locale-menu(?:,|$)/ });
  await expect.element(row).toBeVisible();
  await expect.element(row).toHaveAttribute("data-sidebar-row", threadKey);
  await userEvent.click(row, { button: "right" });
  await expect
    .element(page.getByRole("menuitem", { name: "在 main 分支新建任务", exact: true }))
    .toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "置顶任务", exact: true })).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "项目设置", exact: true })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
  // Mounted subscribers must observe the same update path as the language setting.
  await act(() => updateClientSettings({ appLocale: "en" }));
  await page.getByRole("combobox", { name: "Filter threads by project", exact: true }).click();
  await expect
    .element(page.getByRole("option", { name: "All projects", exact: true }))
    .toBeVisible();
  await page.getByRole("option", { name: "All projects", exact: true }).click();
  await userEvent.click(row, { button: "right" });
  await expect
    .element(page.getByRole("menuitem", { name: "New thread on main", exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("menuitem", { name: "Project settings", exact: true }))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(router.history.location.pathname).toBe(`/${ENVIRONMENT_ID}/${thread.id}`);
});

it("uses settlement locale for sidebar rich thread reference copy", async () => {
  const thread = {
    ...threadWithHistory("sidebar-copy-locale", 1),
    title: "Literal $& {sidebar} title",
  };
  using _environment = installFakeEnvironment([thread]);
  const previousSettings = getClientSettings();
  using _settings = {
    [Symbol.dispose]() {
      __setClientSettingsForTests(previousSettings);
    },
  };
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    appLocale: "en",
  });
  await page.viewport(1400, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  console.info("[sidebar-copy] router load start");
  await router.load();
  console.info("[sidebar-copy] router load complete");
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  using write = vi.spyOn(navigator.clipboard, "write").mockReturnValue(pending);
  using plain = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "sidebar-copy-toast");
  console.info("[sidebar-copy] render start");
  await using _app = await render(<AppRoot router={router} />, { router: false });
  console.info("[sidebar-copy] render complete");
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish();
        await Promise.resolve();
      });
    },
  };
  console.info("[sidebar-copy] filter wait");
  await expect
    .element(page.getByRole("combobox", { name: "Filter threads by project", exact: true }), {
      timeout: 5000,
    })
    .toBeVisible();
  await page.getByRole("combobox", { name: "Filter threads by project", exact: true }).click();
  await page.getByRole("option", { name: "All projects", exact: true }).click();
  const row = page.getByRole("button", { name: /^Literal \$& \{sidebar\} title(?:,|$)/ });
  console.info("[sidebar-copy] thread row wait");
  await expect.element(row, { timeout: 5000 }).toBeVisible();
  await expect
    .element(row)
    .toHaveAttribute(
      "data-sidebar-row",
      scopedThreadKey(scopeThreadRef(ENVIRONMENT_ID, thread.id)),
    );
  const commandsBefore = dispatchedCommands().slice();
  await userEvent.click(row, { button: "right" });
  await userEvent.hover(page.getByRole("menuitem", { name: "Copy", exact: true }));
  await page.getByRole("menuitem", { name: "Thread", exact: true }).click();
  console.info("[sidebar-copy] rich write wait");
  await expect.poll(() => write.mock.calls.length, { timeout: 5000 }).toBe(1);
  const expected = threadChipCopyTarget(
    scopeThreadRef(ENVIRONMENT_ID, thread.id),
    thread.title,
    configuredHostedAppUrl(),
  );
  const item = write.mock.calls[0]?.[0]?.[0];
  if (!item || !expected.fragment) throw new Error("Missing rich thread reference");
  expect(await (await item.getType("text/plain")).text()).toBe(expected.value);
  expect(await (await item.getType(COMPOSER_CONTEXT_CLIPBOARD_MIME)).text()).toBe(
    encodeComposerContextFragment(expected.fragment),
  );
  expect(item.types).toContain("text/html");
  expect(toast).not.toHaveBeenCalled();
  await act(() => updateClientSettings({ appLocale: "zh-CN" }));
  await act(async () => {
    finish();
  });
  expect(toast).toHaveBeenCalledExactlyOnceWith({
    type: "success",
    title: "会话已复制",
    description: thread.title,
  });
  await act(() => updateClientSettings({ appLocale: "en" }));
  expect(toast).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(1);
  expect(plain).not.toHaveBeenCalled();
  expect(router.history.location.pathname).toBe(`/${ENVIRONMENT_ID}/${thread.id}`);
  expect(dispatchedCommands()).toEqual(commandsBefore);
});

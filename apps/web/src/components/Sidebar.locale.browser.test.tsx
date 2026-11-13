import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The thread route loads ChatView lazily; its first transform would eat the test's timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests, updateClientSettings } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
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

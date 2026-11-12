import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The thread route loads ChatView lazily; its first transform would eat the test's timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests, getClientSettings } from "~/hooks/useSettings";
import { useRightPanelStore } from "~/rightPanelStore";
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

it("leaves thread shortcuts and their hints to the preview when their rules exclude it", async () => {
  const [first, second] = [threadWithHistory("thread-a", 1), threadWithHistory("thread-b", 1)];
  using _environment = installFakeEnvironment([first, second]);
  using _platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  await page.viewport(1400, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${first.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  await expect.element(page.getByText(`Thread ${second.id}`).first()).toBeVisible();

  const previewChrome = document.createElement("div");
  previewChrome.dataset.previewPanelMode = "browser";
  previewChrome.innerHTML = '<button type="button">Reload</button>';
  document.body.append(previewChrome);
  using _chrome = { [Symbol.dispose]: () => previewChrome.remove() };

  const press = () => userEvent.keyboard("{Control>}{Shift>}]{/Shift}{/Control}");
  const jumpHint = () => document.querySelector("[data-jump-hint]");
  const whileHoldingControl = async (assertJumpHints: () => void) => {
    // Every deadline reads as due on subscribe, so hints skip the hold delay.
    let now = Date.parse("2026-01-01T00:00:00.000Z");
    using _clock = vi.spyOn(Date, "now").mockImplementation(() => (now += 1000));
    await userEvent.keyboard("{Control>}");
    await act(() => {});
    await vi.waitFor(assertJumpHints);
    await userEvent.keyboard("{/Control}");
  };
  const firstPath = `/${ENVIRONMENT_ID}/${first.id}`;

  await userEvent.click(page.getByRole("button", { name: "Reload" }));
  await press();
  expect(router.history.location.pathname).toBe(firstPath);
  await whileHoldingControl(() => expect(jumpHint()).toBeNull());

  const firstRef = scopeThreadRef(ENVIRONMENT_ID, first.id);
  await act(() => useRightPanelStore.getState().openBrowser(firstRef, null));
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  await press();
  expect(router.history.location.pathname).toBe(firstPath);

  await act(() => useRightPanelStore.getState().close(firstRef));
  await press();
  await vi.waitFor(() =>
    expect(router.history.location.pathname).toBe(`/${ENVIRONMENT_ID}/${second.id}`),
  );
  await whileHoldingControl(() => expect(jumpHint()).not.toBeNull());
});

it("uses the current language each time a sidebar context menu opens", async () => {
  const thread = threadWithHistory("locale-menu", 1);
  using _environment = installFakeEnvironment([thread]);
  const settings = {
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  };
  __setClientSettingsForTests({ ...settings, appLocale: "zh-CN" });
  console.log("v019-sidebar-stage-01");
  await page.viewport(1400, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  console.log("v019-sidebar-stage-02");
  await router.load();
  console.log("v019-sidebar-stage-03");
  await using _app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  const row = page.getByText(`Thread ${thread.id}`, { exact: true }).first();
  console.log("v019-sidebar-stage-04");
  await expect.element(row).toBeVisible();
  console.log("v019-sidebar-stage-05");
  await userEvent.click(row, { button: "right" });
  console.log("v019-sidebar-stage-06");
  // Diagnostic-only: disclose booleans and known locale enums, never arbitrary DOM text.
  const reportMenuState = () => {
    const names = [...document.querySelectorAll('[role="menuitem"]')].map((element) =>
      element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
    );
    const locale = getClientSettings().appLocale;
    console.log("v019-sidebar-state", JSON.stringify({
      hasMenu: document.querySelector('[role="menu"]') !== null,
      branchChinese: names.includes("在 main 分支新建任务"),
      branchEnglish: names.includes("New thread on main"),
      pinChinese: names.includes("置顶任务"),
      pinEnglish: names.includes("Pin thread"),
      settingsChinese: names.includes("项目设置"),
      settingsEnglish: names.includes("Project settings"),
      documentChinese: document.documentElement.lang === "zh-CN",
      documentEnglish: document.documentElement.lang === "en",
      settingsChineseLocale: locale === "zh-CN",
      settingsEnglishLocale: locale === "en",
    }));
  };
  reportMenuState();
  setTimeout(reportMenuState, 250);
  setTimeout(reportMenuState, 1000);
  setTimeout(reportMenuState, 5000);
  await expect
    .element(page.getByRole("menuitem", { name: "在 main 分支新建任务", exact: true }))
    .toBeVisible();
  console.log("v019-sidebar-stage-07");
  await expect.element(page.getByRole("menuitem", { name: "置顶任务", exact: true })).toBeVisible();
  console.log("v019-sidebar-stage-08");
  await expect.element(page.getByRole("menuitem", { name: "项目设置", exact: true })).toBeVisible();
  console.log("v019-sidebar-stage-09");
  await userEvent.keyboard("{Escape}");
  console.log("v019-sidebar-stage-10");
  await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
  console.log("v019-sidebar-stage-11");
  await act(() => __setClientSettingsForTests({ ...settings, appLocale: "en" }));
  console.log("v019-sidebar-stage-12");
  await userEvent.click(row, { button: "right" });
  console.log("v019-sidebar-stage-13");
  await expect
    .element(page.getByRole("menuitem", { name: "New thread on main", exact: true }))
    .toBeVisible();
  console.log("v019-sidebar-stage-14");
  await expect
    .element(page.getByRole("menuitem", { name: "Project settings", exact: true }))
    .toBeVisible();
  console.log("v019-sidebar-stage-15");
  await userEvent.keyboard("{Escape}");
  expect(router.history.location.pathname).toBe(`/${ENVIRONMENT_ID}/${thread.id}`);
  console.log("v019-sidebar-stage-complete");
});

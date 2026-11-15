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

it("uses settlement locale for sidebar plain clipboard success titles", async () => {
  const thread = {
    ...threadWithHistory("sidebar-plain-locale", 1),
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
  await router.load();
  using rich = vi.spyOn(navigator.clipboard, "write").mockResolvedValue(undefined);
  using plain = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "sidebar-copy-toast");
  await using _app = await render(<AppRoot router={router} />, { router: false });
  await expect
    .element(page.getByRole("combobox", { name: "Filter threads by project", exact: true }), {
      timeout: 5000,
    })
    .toBeVisible();
  await page.getByRole("combobox", { name: "Filter threads by project", exact: true }).click();
  await page.getByRole("option", { name: "All projects", exact: true }).click();
  const row = page.getByRole("button", { name: /^Literal \$& \{sidebar\} title(?:,|$)/ });
  await expect.element(row, { timeout: 5000 }).toBeVisible();
  await expect
    .element(row)
    .toHaveAttribute(
      "data-sidebar-row",
      scopedThreadKey(scopeThreadRef(ENVIRONMENT_ID, thread.id)),
    );
  const commandsBefore = dispatchedCommands().slice();
  const cases = [
    { label: "Path", value: "/workspace/render", title: "路径已复制" },
    { label: "Branch", value: "main", title: "分支已复制" },
    { label: "Thread ID", value: thread.id, title: "任务 ID 已复制" },
  ];
  for (const [index, entry] of cases.entries()) {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    plain.mockReturnValueOnce(pending);
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish();
          await Promise.resolve();
        });
      },
    };
    await userEvent.click(row, { button: "right" });
    await userEvent.hover(page.getByRole("menuitem", { name: "Copy", exact: true }));
    await page.getByRole("menuitem", { name: entry.label, exact: true }).click();
    await expect.poll(() => plain.mock.calls.length, { timeout: 5000 }).toBe(index + 1);
    expect(plain).toHaveBeenNthCalledWith(index + 1, entry.value);
    expect(toast).toHaveBeenCalledTimes(index);
    await act(() => updateClientSettings({ appLocale: "zh-CN" }));
    await act(async () => {
      finish();
    });
    expect(toast).toHaveBeenNthCalledWith(index + 1, {
      type: "success",
      title: entry.title,
      description: entry.value,
    });
    await act(() => updateClientSettings({ appLocale: "en" }));
    expect(toast).toHaveBeenCalledTimes(index + 1);
    expect(plain).toHaveBeenCalledTimes(index + 1);
  }
  expect(rich).not.toHaveBeenCalled();
  expect(router.history.location.pathname).toBe(`/${ENVIRONMENT_ID}/${thread.id}`);
  expect(dispatchedCommands()).toEqual(commandsBefore);
});

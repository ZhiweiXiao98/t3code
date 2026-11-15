import { ThreadSettlementUnsupportedError } from "../hooks/useThreadActions";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
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

const commands = vi.hoisted(() => ({ settle: vi.fn() }));
vi.mock("../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../state/use-atom-command")>();
  const { threadEnvironment } = await import("../state/threads");
  return {
    ...actual,
    useAtomCommand: (...args: Parameters<typeof actual.useAtomCommand>) =>
      args[0] === threadEnvironment.settle ? commands.settle : actual.useAtomCommand(...args),
  };
});

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

it("uses settlement locale for sidebar settle failures", async () => {
  const thread = {
    ...threadWithHistory("sidebar-settle-locale", 1),
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
    { cause: null, description: "发生错误。", interrupted: false },
    {
      cause: new ThreadSettlementUnsupportedError({
        environmentId: ENVIRONMENT_ID,
        threadId: thread.id,
      }),
      description: "此环境的服务器尚不支持收起任务。请更新服务器以使用收起功能。",
      interrupted: false,
    },
    {
      cause: new Error("Failed to settle thread"),
      description: "Failed to settle thread",
      interrupted: false,
    },
    { cause: new Error(""), description: "", interrupted: false },
    { cause: null, description: "", interrupted: true },
  ];
  commands.settle.mockReset();
  let notices = 0;
  for (const [index, entry] of cases.entries()) {
    let finish!: (result: AtomCommandResult<unknown, unknown>) => void;
    const pending = new Promise<AtomCommandResult<unknown, unknown>>((resolve) => {
      finish = resolve;
    });
    commands.settle.mockReturnValueOnce(pending);
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await userEvent.click(row, { button: "right" });
    const settle = page.getByRole("menuitem", { name: "Settle thread", exact: true });
    await expect.element(settle).toBeEnabled();
    await settle.click();
    await expect.poll(() => commands.settle.mock.calls.length, { timeout: 5000 }).toBe(index + 1);
    expect(commands.settle).toHaveBeenNthCalledWith(index + 1, {
      environmentId: ENVIRONMENT_ID,
      input: { threadId: thread.id },
    });
    await userEvent.click(row, { button: "right" });
    await page.getByRole("menuitem", { name: "Settle thread", exact: true }).click();
    expect(commands.settle).toHaveBeenCalledTimes(index + 1);
    expect(toast).toHaveBeenCalledTimes(notices);
    await act(() => updateClientSettings({ appLocale: "zh-CN" }));
    await act(async () => {
      finish(AsyncResult.failure(entry.interrupted ? Cause.interrupt() : Cause.fail(entry.cause)));
    });
    if (!entry.interrupted) {
      expect(toast.mock.calls[notices]?.[0]).toMatchObject({
        type: "error",
        title: "收起任务失败",
        description: entry.description,
      });
      notices++;
    }
    await act(() => updateClientSettings({ appLocale: "en" }));
    expect(toast).toHaveBeenCalledTimes(notices);
    expect(commands.settle).toHaveBeenCalledTimes(index + 1);
  }
  expect(rich).not.toHaveBeenCalled();
  expect(plain).not.toHaveBeenCalled();
  expect(router.history.location.pathname).toBe(`/${ENVIRONMENT_ID}/${thread.id}`);
  expect(dispatchedCommands()).toEqual(commandsBefore);
});

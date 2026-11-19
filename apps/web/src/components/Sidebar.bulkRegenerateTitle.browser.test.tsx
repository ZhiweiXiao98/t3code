import { useThreadSelectionStore } from "../threadSelectionStore";
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

const commands = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../state/use-atom-command")>();
  const { threadEnvironment } = await import("../state/threads");
  return {
    ...actual,
    useAtomCommand: (...args: Parameters<typeof actual.useAtomCommand>) =>
      args[0] === threadEnvironment.regenerateTitle
        ? commands.update
        : actual.useAtomCommand(...args),
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

it("uses settlement locale for sidebar bulk regenerate title failures", async () => {
  const thread = {
    ...threadWithHistory("sidebar-bulk-regenerate-locale", 1),
    title: "Literal $& {sidebar} title",
  };
  const second = {
    ...threadWithHistory("sidebar-bulk-second", 1),
    title: "Second literal {target}",
  };
  using _environment = installFakeEnvironment([thread, second]);
  const previousSelection = useThreadSelectionStore.getState();
  using _selection = {
    [Symbol.dispose]() {
      useThreadSelectionStore.setState(previousSelection);
    },
  };
  useThreadSelectionStore.getState().clearSelection();
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
  const secondRow = page.getByRole("button", { name: /^Second literal \{target\}(?:,|$)/ });
  await expect.element(secondRow, { timeout: 5000 }).toBeVisible();
  const selectedKeys = [thread, second].map((entry) =>
    scopedThreadKey(scopeThreadRef(ENVIRONMENT_ID, entry.id)),
  );
  const commandsBefore = dispatchedCommands().slice();
  const cases = [
    { cause: null, description: "发生错误。", interrupted: false },
    {
      cause: new Error("Failed to regenerate thread titles"),
      description: "Failed to regenerate thread titles",
      interrupted: false,
    },
    { cause: new Error(""), description: "", interrupted: false },
    { cause: null, description: "", interrupted: true },
  ];
  commands.update.mockReset();
  // Preserve the real pointer flow and strict selection assertion. A failed click can be
  // consumed by a drag cancellation or clear selection through navigation; record which
  // path occurred instead of retrying the click (which would toggle a successful selection).
  const selectionTrace: unknown[] = [];
  const recordSelection = (phase: string, event?: Event) => {
    if (selectionTrace.length === 64) selectionTrace.shift();
    const pointer = event instanceof MouseEvent ? event : undefined;
    selectionTrace.push({
      phase,
      type: event?.type,
      row:
        event?.target instanceof Element
          ? event.target.closest("[data-sidebar-row]")?.getAttribute("data-sidebar-row")
          : undefined,
      ctrl: pointer?.ctrlKey,
      meta: pointer?.metaKey,
      button: pointer?.button,
      buttons: pointer?.buttons,
      prevented: event?.defaultPrevented,
      platform: navigator.platform,
      route: router.history.location.pathname,
      selection: [...useThreadSelectionStore.getState().selectedThreadKeys],
    });
  };
  const recordCapture = (event: Event) => recordSelection("capture", event);
  const recordBubble = (event: Event) => recordSelection("bubble", event);
  const eventTypes = ["pointerdown", "pointerup", "pointercancel", "click", "blur", "resize"];
  for (const type of eventTypes) {
    window.addEventListener(type, recordCapture, true);
    window.addEventListener(type, recordBubble);
  }
  const unsubscribeSelection = useThreadSelectionStore.subscribe(() => recordSelection("store"));
  using _selectionTrace = {
    [Symbol.dispose]() {
      unsubscribeSelection();
      for (const type of eventTypes) {
        window.removeEventListener(type, recordCapture, true);
        window.removeEventListener(type, recordBubble);
      }
    },
  };
  let notices = 0;
  for (const [index, entry] of cases.entries()) {
    // The batch action now clears selection when dispatched; reselect for each case.
    selectionTrace.length = 0;
    recordSelection(`case-${index}:before`);
    await userEvent.click(row, { modifiers: ["Control"] });
    recordSelection(`case-${index}:first-click-returned`);
    await userEvent.click(secondRow, { modifiers: ["Control"] });
    recordSelection(`case-${index}:second-click-returned`);
    expect(
      [...useThreadSelectionStore.getState().selectedThreadKeys],
      JSON.stringify(selectionTrace),
    ).toEqual(selectedKeys);
    let finish!: (result: AtomCommandResult<unknown, unknown>) => void;
    const pending = new Promise<AtomCommandResult<unknown, unknown>>((resolve) => {
      finish = resolve;
    });
    commands.update.mockReturnValueOnce(pending).mockReturnValueOnce(pending);
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await userEvent.click(row, { button: "right" });
    const regenerate = page.getByRole("menuitem", { name: "Regenerate titles (2)", exact: true });
    await expect.element(regenerate).toBeEnabled();
    await regenerate.click();
    await expect
      .poll(() => commands.update.mock.calls.length, { timeout: 5000 })
      .toBe((index + 1) * 2);
    expect(commands.update).toHaveBeenNthCalledWith(index * 2 + 1, {
      environmentId: ENVIRONMENT_ID,
      input: { threadId: thread.id },
    });
    expect(commands.update).toHaveBeenNthCalledWith(index * 2 + 2, {
      environmentId: ENVIRONMENT_ID,
      input: { threadId: second.id },
    });
    expect(toast).toHaveBeenCalledTimes(notices);
    await act(() => updateClientSettings({ appLocale: "zh-CN" }));
    await act(async () => {
      finish(AsyncResult.failure(entry.interrupted ? Cause.interrupt() : Cause.fail(entry.cause)));
    });
    if (!entry.interrupted) {
      expect(toast.mock.calls[notices]?.[0]).toMatchObject({
        type: "error",
        title: "2 个任务中有 2 个标题重新生成失败",
        description: entry.description,
      });
      notices++;
    }
    await act(() => updateClientSettings({ appLocale: "en" }));
    expect(toast).toHaveBeenCalledTimes(notices);
    expect(commands.update).toHaveBeenCalledTimes((index + 1) * 2);
    expect([...useThreadSelectionStore.getState().selectedThreadKeys]).toEqual([]);
  }
  expect(rich).not.toHaveBeenCalled();
  expect(plain).not.toHaveBeenCalled();
  expect(router.history.location.pathname).toBe(`/${ENVIRONMENT_ID}/${thread.id}`);
  expect(dispatchedCommands()).toEqual(commandsBefore);
});

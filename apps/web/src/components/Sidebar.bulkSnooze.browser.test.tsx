import { ThreadSnoozeUnsupportedError } from "../hooks/useThreadActions";
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

const commands = vi.hoisted(() => ({ snooze: vi.fn(), picked: vi.fn() }));
vi.mock("../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../state/use-atom-command")>();
  const { threadEnvironment } = await import("../state/threads");
  return {
    ...actual,
    useAtomCommand: (...args: Parameters<typeof actual.useAtomCommand>) =>
      args[0] === threadEnvironment.snooze ? commands.snooze : actual.useAtomCommand(...args),
  };
});

vi.mock("./Sidebar.snooze", async (original) => {
  const actual = await original<typeof import("./Sidebar.snooze")>();
  return {
    ...actual,
    pickSnoozePreset: (...args: Parameters<typeof actual.pickSnoozePreset>) => {
      const picked = actual.pickSnoozePreset(...args);
      commands.picked(picked);
      return picked;
    },
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

it.each(["unknown", "unsupported", "raw", "empty", "interrupted"] as const)(
  "uses settlement locale for sidebar bulk snooze failures: %s",
  async (kind) => {
    const thread = {
      ...threadWithHistory("sidebar-bulk-snooze-locale", 1),
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
    const entry = {
      unknown: { cause: null, description: "发生错误。", interrupted: false },
      unsupported: {
        cause: new ThreadSnoozeUnsupportedError({
          environmentId: ENVIRONMENT_ID,
          threadId: thread.id,
        }),
        description: "此环境的服务器尚不支持稍后处理。请更新服务器以使用稍后处理功能。",
        interrupted: false,
      },
      raw: {
        cause: new Error("Failed to snooze threads"),
        description: "Failed to snooze threads",
        interrupted: false,
      },
      empty: { cause: new Error(""), description: "", interrupted: false },
      interrupted: { cause: null, description: "", interrupted: true },
    }[kind];
    commands.snooze.mockReset();
    commands.picked.mockClear();
    let notices = 0;
    // A second settled round proves both targets can be snoozed again.
    for (const index of kind === "unknown" ? [0, 1] : [0]) {
      let finish!: (result: AtomCommandResult<unknown, unknown>) => void;
      const pending = new Promise<AtomCommandResult<unknown, unknown>>((resolve) => {
        finish = resolve;
      });
      let finishSecond!: (result: AtomCommandResult<unknown, unknown>) => void;
      const secondPending = new Promise<AtomCommandResult<unknown, unknown>>((resolve) => {
        finishSecond = resolve;
      });
      commands.snooze.mockReturnValueOnce(pending).mockReturnValueOnce(secondPending);
      await using _settle = {
        async [Symbol.asyncDispose]() {
          await act(async () => {
            finish(AsyncResult.failure(Cause.interrupt()));
            finishSecond(AsyncResult.failure(Cause.interrupt()));
            await Promise.resolve();
          });
        },
      };
      await userEvent.click(row, { modifiers: ["Control"] });
      await userEvent.click(secondRow, { modifiers: ["Control"] });
      expect([...useThreadSelectionStore.getState().selectedThreadKeys]).toEqual(selectedKeys);
      await userEvent.click(row, { button: "right" });
      const snooze = page.getByRole("menuitem", { name: "Snooze (2)", exact: true });
      await expect.element(snooze).toBeEnabled();
      await userEvent.hover(snooze);
      await page.getByRole("menuitem", { name: /^In 1 hour(?:,|$)/ }).click();
      await expect
        .poll(() => commands.snooze.mock.calls.length, { timeout: 5000 })
        .toBe((index + 1) * 2);
      const snoozedUntil = commands.picked.mock.calls.at(-1)?.[0]?.snoozedUntil;
      expect(snoozedUntil).toEqual(expect.any(String));
      for (const [offset, target] of [thread, second].entries()) {
        expect(commands.snooze).toHaveBeenNthCalledWith(index * 2 + offset + 1, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: target.id, snoozedUntil },
        });
      }
      expect(useThreadSelectionStore.getState().selectedThreadKeys.size).toBe(0);
      expect(toast).toHaveBeenCalledTimes(notices);
      await act(() => updateClientSettings({ appLocale: "zh-CN" }));
      await act(async () => {
        finishSecond(
          AsyncResult.failure(
            entry.interrupted
              ? Cause.interrupt()
              : Cause.fail(new Error("Second target private failure")),
          ),
        );
      });
      expect(toast).toHaveBeenCalledTimes(notices);
      await act(async () => {
        finish(
          AsyncResult.failure(entry.interrupted ? Cause.interrupt() : Cause.fail(entry.cause)),
        );
      });
      if (!entry.interrupted) {
        expect(toast.mock.calls[notices]?.[0]).toMatchObject({
          type: "error",
          title: "稍后处理多个任务失败",
          description: entry.description,
        });
        notices++;
      }
      await act(() => updateClientSettings({ appLocale: "en" }));
      expect(toast).toHaveBeenCalledTimes(notices);
      expect(commands.snooze).toHaveBeenCalledTimes((index + 1) * 2);
      expect(useThreadSelectionStore.getState().selectedThreadKeys.size).toBe(0);
    }
    expect(rich).not.toHaveBeenCalled();
    expect(plain).not.toHaveBeenCalled();
    expect(router.history.location.pathname).toBe(`/${ENVIRONMENT_ID}/${thread.id}`);
    expect(dispatchedCommands()).toEqual(commandsBefore);
  },
);

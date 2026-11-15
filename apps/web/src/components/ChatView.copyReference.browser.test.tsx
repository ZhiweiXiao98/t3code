import { threadChipCopyTarget } from "@t3tools/client-runtime/thread-reference";
import {
  COMPOSER_CONTEXT_CLIPBOARD_MIME,
  encodeComposerContextFragment,
} from "@t3tools/shared/composerContextClipboard";
import { configuredHostedAppUrl } from "../hostedPairing";
import { toastManager } from "./ui/toast";
import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
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
    { key: "mod+shift+c", command: "thread.copyReference", when: "!terminalFocus" },
  ]);
  return { ...actual, primaryServerKeybindingsAtom: Atom.make(keybindings) };
});

it("uses settlement locale for chat shortcut rich thread reference copy", async () => {
  const thread = {
    ...threadWithHistory("chat-copy-locale", 1),
    title: "Literal $& {chat} title",
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
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  using write = vi.spyOn(navigator.clipboard, "write").mockReturnValue(pending);
  using plain = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "chat-copy-toast");
  await using _app = await render(<AppRoot router={router} />, { router: false });
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish();
        await Promise.resolve();
      });
    },
  };
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  const commandsBefore = dispatchedCommands().slice();
  await userEvent.keyboard("{Control>}{Shift>}C{/Shift}{/Control}");
  await expect.poll(() => write.mock.calls.length).toBe(1);
  const repeated = new KeyboardEvent("keydown", {
    key: "C",
    code: "KeyC",
    ctrlKey: true,
    shiftKey: true,
    repeat: true,
    bubbles: true,
    cancelable: true,
  });
  await act(() => window.dispatchEvent(repeated));
  expect(repeated.defaultPrevented).toBe(true);
  expect(write).toHaveBeenCalledTimes(1);
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

import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import { AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { act, render } from "../../../test/render";
import { UpdateTrackSwitchDialog } from "./UpdateTrackSwitchDialog";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  toast: vi.fn(),
  close: vi.fn(),
  channel: vi.fn(),
  run: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
}));
vi.mock("~/state/npmRelease", async (original) => {
  const actual = await original<typeof import("~/state/npmRelease")>();
  const { Atom, AsyncResult } = await import("effect/reactivity");
  const release = Atom.make(
    AsyncResult.success({ version: "99.0.0", databaseMigration: undefined }),
  );
  return { ...actual, npmReleaseAtom: () => release };
});
vi.mock("~/state/desktopUpdate", async (original) => ({
  ...(await original<typeof import("~/state/desktopUpdate")>()),
  useDesktopUpdateState: () => ({ enabled: false, channelBlockedByPolicy: false }),
}));
vi.mock("~/state/environments", async (original) => ({
  ...(await original<typeof import("~/state/environments")>()),
  useEnvironments: () => ({ environments: [] }),
}));
vi.mock("../sidebar/useUpdateEverything", async (original) => ({
  ...(await original<typeof import("../sidebar/useUpdateEverything")>()),
  useUpdateEverything: () => ({ rows: [], restarts: [], run: state.run }),
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
function surface(locale: "en" | "zh-CN", registry: AtomRegistry.AtomRegistry) {
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
        <UpdateTrackSwitchDialog channel="latest" onClose={state.close} />
      </WebI18nContext>
    </RegistryContext.Provider>
  );
}
function setup() {
  state.channel.mockReset();
  state.toast.mockClear();
  state.close.mockClear();
  state.run.mockClear();
  state.download.mockClear();
  state.install.mockClear();
  vi.stubGlobal("desktopBridge", {
    setUpdateChannel: state.channel,
    getLocalEnvironmentBootstraps: () => [],
    downloadUpdate: state.download,
    installUpdate: state.install,
  });
  const registry = AtomRegistry.make();
  return {
    registry,
    [Symbol.dispose]() {
      registry.dispose();
      vi.unstubAllGlobals();
      state.locale = "en";
    },
  };
}
it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {feed}")],
  ["empty", new Error("")],
] as const)(
  "uses settlement locale for update track preparation failure: %s",
  async (_kind, error) => {
    using fixture = setup();
    let reject!: (error: unknown) => void;
    const promise = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    void promise.catch(() => {});
    state.channel.mockReturnValue(promise);
    await using screen = await render(surface("en", fixture.registry));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          reject(null);
          await promise.catch(() => {});
        });
      },
    };
    await page.getByRole("button", { name: "Switch to Stable", exact: true }).click();
    expect(state.channel).toHaveBeenCalledExactlyOnceWith("latest", undefined);
    const checking = page.getByRole("button", { name: "Checking…", exact: true });
    await expect.element(checking).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await act(async () => {
      checking.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(state.channel).toHaveBeenCalledTimes(1);
    await screen.rerender(surface("zh-CN", fixture.registry));
    expect(state.close).not.toHaveBeenCalled();
    expect(state.toast).not.toHaveBeenCalled();
    await act(async () => {
      reject(error);
      await promise.catch(() => {});
    });
    expect(state.close).toHaveBeenCalledExactlyOnceWith();
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法切换到稳定版",
      data: { actionLayout: "stacked-end" },
      description: error instanceof Error ? error.message : "更新通道未更改。",
    });
    expect(state.close.mock.invocationCallOrder[0]).toBeLessThan(
      state.toast.mock.invocationCallOrder[0]!,
    );
    expect(state.run).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
    expect(state.install).not.toHaveBeenCalled();
    await screen.rerender(surface("en", fixture.registry));
    expect(state.toast).toHaveBeenCalledTimes(1);
  },
);
it("cancels update track preparation without changing the track", async () => {
  using fixture = setup();
  await using _screen = await render(surface("en", fixture.registry));
  await expect
    .element(page.getByRole("button", { name: "Switch to Stable", exact: true }))
    .toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.close).toHaveBeenCalledExactlyOnceWith();
  expect(state.channel).not.toHaveBeenCalled();
  expect(state.run).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
  expect(state.download).not.toHaveBeenCalled();
  expect(state.install).not.toHaveBeenCalled();
});

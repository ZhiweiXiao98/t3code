import "~/index.css";
import * as Cause from "effect/Cause";
import { acceptsTrackSwitchRelease } from "@t3tools/shared/cliRelease";
import { EnvironmentId, ServerConfig, type DesktopUpdateState } from "@t3tools/contracts";
import { PrimaryConnectionTarget } from "@t3tools/client-runtime/connection";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { EnvironmentPresentation } from "~/state/environments";
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
  getUpdateState: vi.fn(),
  installMode: false,
}));
vi.mock("~/branding", async (original) => ({
  ...(await original<typeof import("~/branding")>()),
  APP_VERSION: "1.0.0-nightly.20261001.1",
}));
vi.mock("~/env", async (original) => ({
  ...(await original<typeof import("~/env")>()),
  isElectron: true,
}));
vi.mock("~/state/npmRelease", async (original) => {
  const actual = await original<typeof import("~/state/npmRelease")>();
  const { Atom, AsyncResult } = await import("effect/reactivity");
  const release = Atom.make(AsyncResult.success({ version: "99.0.0", databaseMigration: 10 }));
  return { ...actual, npmReleaseAtom: () => release };
});
vi.mock("~/state/desktopUpdate", async (original) => ({
  ...(await original<typeof import("~/state/desktopUpdate")>()),
  useDesktopUpdateState: () => ({ enabled: state.installMode, channelBlockedByPolicy: false }),
}));
vi.mock("~/state/environments", async (original) => ({
  ...(await original<typeof import("~/state/environments")>()),
  useEnvironments: () => ({ environments: state.installMode ? [hostedEnvironment] : [] }),
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
  state.run.mockReset();
  state.download.mockClear();
  state.install.mockClear();
  state.getUpdateState.mockReset();
  vi.stubGlobal("desktopBridge", {
    setUpdateChannel: state.channel,
    getLocalEnvironmentBootstraps: () => (state.installMode ? [{}] : []),
    getUpdateState: state.getUpdateState,
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
      state.installMode = false;
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

const savedUpdateState: DesktopUpdateState = {
  enabled: false,
  status: "up-to-date",
  channel: "latest",
  currentVersion: "99.0.0",
  hostArch: "x64",
  appArch: "x64",
  runningUnderArm64Translation: false,
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};
it.each([
  ["owned", null, "发生了意外错误。"],
  ["raw", new Error("Literal $& {fleet}"), "Literal $& {fleet}"],
  ["empty", new Error(""), ""],
  [
    "interruption diagnostic",
    Cause.squash(Cause.interrupt()),
    "All fibers interrupted without error",
  ],
] as const)(
  "uses settlement locale for update track fleet failure: %s",
  async (_kind, error, description) => {
    using fixture = setup();
    state.channel.mockResolvedValue(savedUpdateState);
    let reject!: (error: unknown) => void;
    const promise = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    void promise.catch(() => {});
    state.run.mockReturnValue(promise);
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
    await expect.poll(() => state.run.mock.calls.length).toBe(1);
    expect(state.channel).toHaveBeenCalledExactlyOnceWith("latest", undefined);
    expect(state.close).toHaveBeenCalledExactlyOnceWith();
    expect(state.run).toHaveBeenCalledExactlyOnceWith({});
    expect(state.channel.mock.invocationCallOrder[0]).toBeLessThan(
      state.close.mock.invocationCallOrder[0]!,
    );
    expect(state.close.mock.invocationCallOrder[0]).toBeLessThan(
      state.run.mock.invocationCallOrder[0]!,
    );
    const checking = page.getByRole("button", { name: "Checking…", exact: true });
    await expect.element(checking).toBeDisabled();
    await act(async () => {
      checking.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(state.run).toHaveBeenCalledTimes(1);
    await screen.rerender(surface("zh-CN", fixture.registry));
    expect(state.toast).not.toHaveBeenCalled();
    await act(async () => {
      reject(error);
      await promise.catch(() => {});
    });
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法切换到稳定版",
      description,
      data: { actionLayout: "stacked-end" },
    });
    expect(state.close).toHaveBeenCalledTimes(1);
    expect(state.channel).toHaveBeenCalledTimes(1);
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(state.download).not.toHaveBeenCalled();
    expect(state.install).not.toHaveBeenCalled();
    await screen.rerender(surface("en", fixture.registry));
    expect(state.toast).toHaveBeenCalledTimes(1);
  },
);

const hostedId = EnvironmentId.make("track-install-fixture");
const hostedEnvironment: EnvironmentPresentation = {
  environmentId: hostedId,
  label: "Literal $& {machine}",
  displayUrl: null,
  relayManaged: false,
  connection: { phase: "connected", error: null, traceId: null },
  entry: {
    enabled: true,
    profile: Option.none(),
    target: new PrimaryConnectionTarget({
      environmentId: hostedId,
      label: "Literal $& {machine}",
      httpBaseUrl: "http://fixture.invalid",
      wsBaseUrl: "ws://fixture.invalid",
    }),
  },
  serverConfig: Schema.decodeSync(ServerConfig)({
    environment: {
      environmentId: hostedId,
      label: "Literal $& {machine}",
      platform: { os: "linux", arch: "x64" },
      serverVersion: "1.0.0-nightly.20261001.1",
      databaseMigration: 10,
      capabilities: { repositoryIdentity: true },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: [],
      sessionMethods: [],
      sessionCookieName: "fixture",
    },
    cwd: "/fixture",
    keybindingsConfigPath: "/fixture/keys.json",
    keybindings: [],
    issues: [],
    providers: [],
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/fixture/logs",
      localTracingEnabled: false,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
    },
    settings: {},
  }),
};
it.each([
  ["missing", null],
  ["wrong track", "100.0.0-nightly.20261115.1"],
  ["older literal build", "98.0.0+$&.{literal}"],
] as const)(
  "uses settlement locale for update track install mismatch: %s",
  async (_kind, downloadedVersion) => {
    using fixture = setup();
    state.installMode = true;
    if (downloadedVersion !== null) {
      expect(acceptsTrackSwitchRelease(downloadedVersion, "latest", "99.0.0")).toBe(false);
    }
    state.channel.mockResolvedValue({
      ...savedUpdateState,
      enabled: true,
      status: "downloaded",
      downloadedVersion: "99.0.0",
    });
    let resolve!: (value: DesktopUpdateState) => void;
    const promise = new Promise<DesktopUpdateState>((done) => {
      resolve = done;
    });
    state.getUpdateState.mockReturnValue(promise);
    const report = vi.fn();
    const completed = vi.fn();
    state.run.mockImplementation(
      async (options: {
        installLocal: (
          reportError: (title: string, description: string) => void,
        ) => Promise<boolean>;
      }) => {
        const result = await options.installLocal(report);
        completed(result);
      },
    );
    await using screen = await render(surface("en", fixture.registry));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve({ ...savedUpdateState, downloadedVersion });
          await promise;
        });
      },
    };
    const confirm = page.getByRole("button", { name: "Switch to Stable", exact: true });
    await expect.element(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(() => state.getUpdateState.mock.calls.length).toBe(1);
    expect(state.channel).toHaveBeenCalledExactlyOnceWith("latest", "99.0.0");
    expect(state.run).toHaveBeenCalledExactlyOnceWith({ installLocal: expect.any(Function) });
    expect(state.getUpdateState).toHaveBeenCalledExactlyOnceWith();
    expect(state.close).toHaveBeenCalledExactlyOnceWith();
    expect(report).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
    await screen.rerender(surface("zh-CN", fixture.registry));
    await act(async () => {
      resolve({ ...savedUpdateState, downloadedVersion });
      await promise;
    });
    expect(report).toHaveBeenCalledExactlyOnceWith(
      "无法安装更新",
      `此应用下载的版本为 ${downloadedVersion ?? "无"}，而非 99.0.0 或更新版本。`,
    );
    expect(completed).toHaveBeenCalledExactlyOnceWith(false);
    expect(report.mock.invocationCallOrder[0]).toBeLessThan(completed.mock.invocationCallOrder[0]!);
    expect(state.install).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
    expect(state.toast).not.toHaveBeenCalled();
    await screen.rerender(surface("en", fixture.registry));
    expect(report).toHaveBeenCalledTimes(1);
    expect(state.run).toHaveBeenCalledTimes(1);
  },
);

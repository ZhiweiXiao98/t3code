import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import type {
  DesktopUpdateActionResult,
  DesktopUpdateCheckResult,
  DesktopUpdateState,
} from "@t3tools/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render } from "../../../test/render";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({
  checking: false,
  installing: false,
  locale: "en" as "en" | "zh-CN",
  toast: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  check: vi.fn(),
  providers: vi.fn(),
}));
vi.mock("../../connection/catalog", async (original) => {
  const actual = await original<typeof import("../../connection/catalog")>();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentCatalog: {
      ...actual.environmentCatalog,
      catalogValueAtom: Atom.make<EnvironmentCatalogState>({ isReady: true, entries: new Map() }),
    },
  };
});
vi.mock("../../env", async (original) => ({
  ...(await original<typeof import("../../env")>()),
  isElectron: true,
}));
vi.mock("../../state/desktopUpdate", async (original) => ({
  ...(await original<typeof import("../../state/desktopUpdate")>()),
  useDesktopUpdateState: () =>
    fixture.checking ? checkState : fixture.installing ? installState : updateState,
}));
vi.mock("../../state/managedPolicy", async (original) => ({
  ...(await original<typeof import("../../state/managedPolicy")>()),
  usePrimaryManagedPolicy: () => null,
}));
vi.mock("../../state/environments", async (original) => ({
  ...(await original<typeof import("../../state/environments")>()),
  useEnvironments: () => ({
    environments: [],
    isReady: true,
    networkStatus: "online",
    presentationById: new Map(),
  }),
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("../../state/session", async (original) => {
  const actual = await original<typeof import("../../state/session")>();
  const { Atom } = await import("effect/reactivity");
  const empty = Atom.make([]);
  return { ...actual, environmentSessionStatesAtom: () => empty };
});
vi.mock("../ProviderUpdatesAction", async (original) => ({
  ...(await original<typeof import("../ProviderUpdatesAction")>()),
  useCheckProviderUpdates: () => fixture.providers,
}));
vi.mock("../sidebar/updateEverythingRun", async (original) => ({
  ...(await original<typeof import("../sidebar/updateEverythingRun")>()),
  useUpdateEverythingRun: () => null,
}));
vi.mock("../../i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = fixture.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: fixture.toast },
}));
import { ensureLocalApi } from "../../localApi";
import { AboutSettingsPanel } from "./SettingsPanels";
import { resolveDesktopUpdateButtonAction } from "../desktopUpdate.logic";

const updateState: DesktopUpdateState = {
  enabled: true,
  status: "available",
  channel: "latest",
  currentVersion: "1.0.0",
  hostArch: "x64",
  appArch: "x64",
  runningUnderArm64Translation: false,
  availableVersion: "1.1.0",
  downloadedVersion: null,
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};
const checkState: DesktopUpdateState = { ...updateState, status: "idle", availableVersion: null };
const installState: DesktopUpdateState = {
  ...updateState,
  status: "downloaded",
  downloadedVersion: "1.1.0",
};
it.each(["owned", "raw", "empty", "resolved"] as const)(
  "uses settlement locale for About download failure: %s",
  async (kind) => {
    fixture.installing = false;
    fixture.toast.mockReset();
    fixture.download.mockReset();
    fixture.install.mockReset();
    fixture.check.mockReset();
    fixture.providers.mockReset();
    fixture.locale = "en";
    expect(resolveDesktopUpdateButtonAction(updateState)).toBe("download");
    expect(appAtomRegistry.get(primaryEnvironmentIdAtom)).toBeNull();
    const resolved: DesktopUpdateActionResult = {
      accepted: true,
      completed: false,
      state: updateState,
    };
    let resolve!: (value: DesktopUpdateActionResult) => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<DesktopUpdateActionResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void pending.catch(() => undefined);
    fixture.download.mockReturnValue(pending);
    const descriptor = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      value: {
        downloadUpdate: fixture.download,
        installUpdate: fixture.install,
        checkForUpdate: fixture.check,
      },
    });
    using _restore = {
      [Symbol.dispose]() {
        if (descriptor) Object.defineProperty(window, "desktopBridge", descriptor);
        else Reflect.deleteProperty(window, "desktopBridge");
        fixture.locale = "en";
      },
    };
    const root = createRootRoute({ component: AboutSettingsPanel });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/settings/about"] }),
    });
    await router.load();
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <AppAtomRegistryProvider>
          <RouterProvider router={router} />
        </AppAtomRegistryProvider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"), { router: false });
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve(resolved);
          await pending.catch(() => undefined);
        });
      },
    };
    await page.getByRole("button", { name: "Download", exact: true }).click();
    expect(fixture.download).toHaveBeenCalledExactlyOnceWith();
    expect(fixture.toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      if (kind === "resolved") resolve(resolved);
      else
        reject(kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {download}" : ""));
      await pending.catch(() => undefined);
    });
    if (kind === "resolved") expect(fixture.toast).not.toHaveBeenCalled();
    else
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法下载更新",
        description:
          kind === "owned" ? "下载失败。" : kind === "raw" ? "Literal $& {download}" : "",
        data: { actionLayout: "stacked-end" },
      });
    await expect.element(page.getByRole("button", { name: "下载", exact: true })).toBeEnabled();
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "resolved" ? 0 : 1);
    expect(fixture.download).toHaveBeenCalledTimes(1);
    expect(fixture.install).not.toHaveBeenCalled();
    expect(fixture.check).not.toHaveBeenCalled();
    expect(fixture.providers).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/settings/about");
  },
);

it.each(["owned", "raw", "empty", "cancel"] as const)(
  "uses settlement locale for About install confirmation: %s",
  async (kind) => {
    fixture.toast.mockReset();
    fixture.download.mockReset();
    fixture.install.mockReset();
    fixture.check.mockReset();
    fixture.providers.mockReset();
    fixture.locale = "en";
    fixture.installing = true;
    expect(resolveDesktopUpdateButtonAction(installState)).toBe("install");
    expect(appAtomRegistry.get(primaryEnvironmentIdAtom)).toBeNull();
    let resolve!: (value: boolean) => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<boolean>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void pending.catch(() => undefined);
    const confirm = vi.spyOn(ensureLocalApi().dialogs, "confirm").mockReturnValue(pending);
    const descriptor = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      value: {
        downloadUpdate: fixture.download,
        installUpdate: fixture.install,
        checkForUpdate: fixture.check,
      },
    });
    using _restore = {
      [Symbol.dispose]() {
        confirm.mockRestore();
        if (descriptor) Object.defineProperty(window, "desktopBridge", descriptor);
        else Reflect.deleteProperty(window, "desktopBridge");
        fixture.locale = "en";
        fixture.installing = false;
      },
    };
    const root = createRootRoute({ component: AboutSettingsPanel });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/settings/about"] }),
    });
    await router.load();
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <AppAtomRegistryProvider>
          <RouterProvider router={router} />
        </AppAtomRegistryProvider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"), { router: false });
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve(false);
          await pending.catch(() => undefined);
        });
      },
    };
    const install = page.getByRole("button", { name: "Install", exact: true });
    await install.click();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      "Install update 1.1.0 and restart T3 Code?\n\nAny running tasks will be interrupted. Make sure you're ready before continuing.",
    );
    await expect.element(install).toBeDisabled();
    await act(async () => {
      install.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fixture.toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      if (kind === "cancel") resolve(false);
      else
        reject(kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {confirm}" : ""));
      await pending.catch(() => undefined);
    });
    if (kind === "cancel") expect(fixture.toast).not.toHaveBeenCalled();
    else
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法确认更新",
        description:
          kind === "owned" ? "确认更新失败。" : kind === "raw" ? "Literal $& {confirm}" : "",
        data: { actionLayout: "stacked-end" },
      });
    await expect.element(page.getByRole("button", { name: "安装", exact: true })).toBeEnabled();
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "cancel" ? 0 : 1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.install).not.toHaveBeenCalled();
    expect(fixture.check).not.toHaveBeenCalled();
    expect(fixture.providers).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/settings/about");
  },
);

it.each(["owned", "raw", "empty", "resolved"] as const)(
  "uses settlement locale for About install rejection: %s",
  async (kind) => {
    fixture.toast.mockReset();
    fixture.download.mockReset();
    fixture.install.mockReset();
    fixture.check.mockReset();
    fixture.providers.mockReset();
    fixture.locale = "en";
    fixture.installing = true;
    expect(resolveDesktopUpdateButtonAction(installState)).toBe("install");
    expect(appAtomRegistry.get(primaryEnvironmentIdAtom)).toBeNull();
    const resolved: DesktopUpdateActionResult = {
      accepted: true,
      completed: true,
      state: installState,
    };
    let resolve!: (value: DesktopUpdateActionResult) => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<DesktopUpdateActionResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void pending.catch(() => undefined);
    const confirm = vi.spyOn(ensureLocalApi().dialogs, "confirm").mockResolvedValue(true);
    fixture.install.mockReturnValue(pending);
    const descriptor = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      value: {
        downloadUpdate: fixture.download,
        installUpdate: fixture.install,
        checkForUpdate: fixture.check,
      },
    });
    using _restore = {
      [Symbol.dispose]() {
        confirm.mockRestore();
        if (descriptor) Object.defineProperty(window, "desktopBridge", descriptor);
        else Reflect.deleteProperty(window, "desktopBridge");
        fixture.locale = "en";
        fixture.installing = false;
      },
    };
    const root = createRootRoute({ component: AboutSettingsPanel });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/settings/about"] }),
    });
    await router.load();
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <AppAtomRegistryProvider>
          <RouterProvider router={router} />
        </AppAtomRegistryProvider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"), { router: false });
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve(resolved);
          await pending.catch(() => undefined);
        });
      },
    };
    const install = page.getByRole("button", { name: "Install", exact: true });
    await install.click();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      "Install update 1.1.0 and restart T3 Code?\n\nAny running tasks will be interrupted. Make sure you're ready before continuing.",
    );
    await expect.poll(() => fixture.install.mock.calls.length).toBe(1);
    expect(fixture.install).toHaveBeenCalledExactlyOnceWith();
    expect(confirm.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.install.mock.invocationCallOrder[0]!,
    );
    await expect.element(install).toBeDisabled();
    await act(async () => {
      install.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fixture.toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      if (kind === "resolved") resolve(resolved);
      else
        reject(kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {install}" : ""));
      await pending.catch(() => undefined);
    });
    if (kind === "resolved") expect(fixture.toast).not.toHaveBeenCalled();
    else
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法安装更新",
        description: kind === "owned" ? "安装失败。" : kind === "raw" ? "Literal $& {install}" : "",
        data: { actionLayout: "stacked-end" },
      });
    await expect.element(page.getByRole("button", { name: "安装", exact: true })).toBeEnabled();
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "resolved" ? 0 : 1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.install).toHaveBeenCalledExactlyOnceWith();
    expect(fixture.check).not.toHaveBeenCalled();
    expect(fixture.providers).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/settings/about");
  },
);

it.each(["owned", "raw", "empty", "resolved"] as const)(
  "uses settlement locale for About update check rejection: %s",
  async (kind) => {
    fixture.installing = false;
    fixture.checking = true;
    fixture.toast.mockReset();
    fixture.download.mockReset();
    fixture.install.mockReset();
    fixture.check.mockReset();
    fixture.providers.mockReset();
    fixture.locale = "en";
    expect(resolveDesktopUpdateButtonAction(checkState)).toBe("none");
    expect(appAtomRegistry.get(primaryEnvironmentIdAtom)).toBeNull();
    const resolved: DesktopUpdateCheckResult = { checked: true, state: checkState };
    let resolve!: (value: DesktopUpdateCheckResult) => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<DesktopUpdateCheckResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void pending.catch(() => undefined);
    fixture.check.mockReturnValue(pending);
    const descriptor = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      value: {
        downloadUpdate: fixture.download,
        installUpdate: fixture.install,
        checkForUpdate: fixture.check,
      },
    });
    using _restore = {
      [Symbol.dispose]() {
        if (descriptor) Object.defineProperty(window, "desktopBridge", descriptor);
        else Reflect.deleteProperty(window, "desktopBridge");
        fixture.locale = "en";
        fixture.checking = false;
      },
    };
    const root = createRootRoute({ component: AboutSettingsPanel });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/settings/about"] }),
    });
    await router.load();
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <AppAtomRegistryProvider>
          <RouterProvider router={router} />
        </AppAtomRegistryProvider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"), { router: false });
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve(resolved);
          await pending.catch(() => undefined);
        });
      },
    };
    await page.getByRole("button", { name: "Check for Updates", exact: true }).click();
    expect(fixture.check).toHaveBeenCalledExactlyOnceWith();
    expect(fixture.providers).toHaveBeenCalledExactlyOnceWith();
    expect(fixture.providers.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.check.mock.invocationCallOrder[0]!,
    );
    expect(fixture.toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      if (kind === "resolved") resolve(resolved);
      else reject(kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {check}" : ""));
      await pending.catch(() => undefined);
    });
    if (kind === "resolved") expect(fixture.toast).not.toHaveBeenCalled();
    else
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法检查更新",
        description:
          kind === "owned" ? "检查更新失败。" : kind === "raw" ? "Literal $& {check}" : "",
        data: { actionLayout: "stacked-end" },
      });
    await expect.element(page.getByRole("button", { name: "检查更新", exact: true })).toBeEnabled();
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "resolved" ? 0 : 1);
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.install).not.toHaveBeenCalled();
    expect(fixture.check).toHaveBeenCalledExactlyOnceWith();
    expect(fixture.providers).toHaveBeenCalledExactlyOnceWith();
    expect(router.state.location.pathname).toBe("/settings/about");
  },
);

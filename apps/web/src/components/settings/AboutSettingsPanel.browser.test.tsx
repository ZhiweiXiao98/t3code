import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import type { DesktopUpdateActionResult, DesktopUpdateState } from "@t3tools/contracts";
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
  useDesktopUpdateState: () => updateState,
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
it.each(["owned", "raw", "empty", "resolved"] as const)(
  "uses settlement locale for About download failure: %s",
  async (kind) => {
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

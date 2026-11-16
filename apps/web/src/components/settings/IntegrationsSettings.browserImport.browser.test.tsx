import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { DEFAULT_SERVER_SETTINGS, EnvironmentId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts/settings";
import { RegistryContext } from "@effect/atom-react";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import type { BrowserImportSource } from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import { ensureLocalApi } from "../../localApi";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";

import { act, render } from "../../../test/render";

import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({
  sources: vi.fn(),
  importCookies: vi.fn(),
  clear: vi.fn(),
  update: vi.fn(),
  hydrated: true,
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
const environmentId = EnvironmentId.make("profile-fixture");
const profile = {
  id: "profile-fixture",
  name: "Literal $& {profile}",
  kind: "persistent" as const,
};
const settings = { ...DEFAULT_CLIENT_SETTINGS, browserProfiles: [profile] };
vi.mock("../../env", async (original) => ({
  ...(await original<typeof import("../../env")>()),
  isElectron: true,
}));
vi.mock("../preview/previewBridge", async (original) => ({
  ...(await original<typeof import("../preview/previewBridge")>()),
  previewBridge: {
    listBrowserImportSources: fixture.sources,
    importBrowserCookies: fixture.importCookies,
  },
}));
vi.mock("../../hooks/useSettings", async (original) => ({
  ...(await original<typeof import("../../hooks/useSettings")>()),
  useClientSettings: (select: (value: ClientSettings) => unknown) => select(settings),
  useClientSettingsHydrated: () => fixture.hydrated,
  getClientSettings: () => settings,
  useUpdatePrimarySettings: () => fixture.update,
  usePrimarySettingsAvailable: () => true,
}));
vi.mock("../../state/environments", async (original) => ({
  ...(await original<typeof import("../../state/environments")>()),
  useEnvironments: () => ({
    environments: [{ environmentId }],
    isReady: true,
    networkStatus: "online",
    presentationById: new Map(),
  }),
  usePrimaryEnvironment: () => ({ environmentId, label: "Fixture environment" }),
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("../../state/entities", async (original) => ({
  ...(await original<typeof import("../../state/entities")>()),
  useServerConfigs: () =>
    new Map([[environmentId, { environment: { capabilities: { serverBrowser: true } } }]]),
}));
vi.mock("../../state/managedPolicy", async (original) => ({
  ...(await original<typeof import("../../state/managedPolicy")>()),
  usePrimaryManagedPolicy: () => undefined,
}));
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  useEnvironmentScope: () => true,
  useEnvironmentsWithScope: () => new Set(),
}));
vi.mock("../../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  return {
    ...actual,
    useAtomCommand: (
      command: Parameters<typeof actual.useAtomCommand>[0],
      options: Parameters<typeof actual.useAtomCommand>[1],
    ) =>
      command === previewEnvironment.clearProfile
        ? fixture.clear
        : actual.useAtomCommand(command, options),
  };
});
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
vi.mock("./SettingsScopeContext", async (original) => ({
  ...(await original<typeof import("./SettingsScopeContext")>()),
  useOptionalSettingsScope: () => null,
  useSettingsScope: () => ({ scope: { kind: "environment" }, environment: null }),
}));
vi.mock("./useScopedSettings", async (original) => ({
  ...(await original<typeof import("./useScopedSettings")>()),
  useScopedSettings: () => DEFAULT_SERVER_SETTINGS,
  useScopedSettingsMixed: () => false,
  useUpdateScopedSettings: () => fixture.update,
  useClearScopedSettings: () => () => undefined,
  useClearProjectOverrides: () => () => undefined,
}));
import { previewEnvironment } from "../../state/preview";
import { BrowserSettingsPanel } from "./IntegrationsSettings";

const source: BrowserImportSource = {
  id: "safari",
  name: "Literal $& {browser}",
  profiles: [],
  unavailable: "needsFullDiskAccess",
};
vi.mock("~/connection/catalog", async (original) => {
  const actual = await original<typeof import("~/connection/catalog")>();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentCatalog: {
      ...actual.environmentCatalog,
      catalogValueAtom: Atom.make<EnvironmentCatalogState>({ isReady: true, entries: new Map() }),
      networkStatusValueAtom: Atom.make("online" as const),
    },
  };
});
it.each(["owned", "raw", "empty", "resolved"] as const)(
  "uses settlement locale for browser import settings failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.hydrated = true;
    fixture.toast.mockReset();
    fixture.sources.mockReset().mockResolvedValue([source]);
    fixture.importCookies.mockReset().mockImplementation(() => {
      throw new Error("Unexpected import");
    });
    fixture.clear.mockReset().mockImplementation(() => {
      throw new Error("Unexpected clear");
    });
    fixture.update.mockReset().mockImplementation(() => {
      throw new Error("Unexpected settings write");
    });
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (r) => r.dispose());
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    const bridge = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    // The real permission poller uses the mocked source refresh fallback, never native permission reads.
    delete window.desktopBridge;
    stack.defer(() => {
      if (bridge) Object.defineProperty(window, "desktopBridge", bridge);
      else delete window.desktopBridge;
      fixture.locale = "en";
    });
    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const pending = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void pending.catch(() => undefined);
    using open = vi.spyOn(ensureLocalApi().shell, "openSystemSettings").mockReturnValue(pending);
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <RegistryContext.Provider value={registry}>
          <BrowserSettingsPanel />
        </RegistryContext.Provider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve();
          await pending.catch(() => undefined);
        });
      },
    };
    await page.getByRole("button", { name: "Add profile", exact: true }).click();
    await page.getByRole("menuitem", { name: source.name, exact: true }).click();
    const allow = page.getByRole("button", { name: "Allow", exact: true });
    await allow.click();
    await expect.poll(() => open.mock.calls).toEqual([["full-disk-access"]]);
    await expect.element(allow).toBeDisabled();
    expect(fixture.toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      if (kind === "resolved") resolve();
      else
        reject(
          kind === "owned" ? null : new Error(kind === "raw" ? "private literal $& {error}" : ""),
        );
      await pending.catch(() => undefined);
    });
    await expect.element(page.getByRole("button", { name: "允许", exact: true })).toBeEnabled();
    if (kind === "resolved") expect(fixture.toast).not.toHaveBeenCalled();
    else
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法打开系统设置",
        description: "请手动打开“隐私与安全性 → 完全磁盘访问权限”。",
      });
    expect(open).toHaveBeenCalledTimes(1);
    expect(fixture.importCookies).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.clear).not.toHaveBeenCalled();
  },
);

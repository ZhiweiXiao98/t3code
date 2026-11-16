import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  EnvironmentId,
  ServerSettings,
  ServerConfig,
  type DeviceServiceState,
} from "@t3tools/contracts";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { PrimaryConnectionTarget } from "@t3tools/client-runtime/connection";
import type { EnvironmentPresentation } from "../../state/environments";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  allowed: true,
  configure: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  scopedUpdate: vi.fn(),
}));
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
vi.mock("../../state/session", async (original) => {
  const actual = await original<typeof import("../../state/session")>();
  return {
    ...actual,
    readEnvironmentScope: () => fixture.allowed,
    useEnvironmentScope: () => fixture.allowed,
    useEnvironmentsWithScope: ((environments: ReadonlyArray<{ environmentId: EnvironmentId }>) =>
      new Set(environments.map((e) => e.environmentId))) as typeof actual.useEnvironmentsWithScope,
  };
});
vi.mock("../../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  return {
    ...actual,
    useAtomCommand: ((command, options) => {
      if ((command as unknown) === deviceEnvironment.configure) return fixture.configure;
      if ((command as unknown) === deviceEnvironment.list) return fixture.list;
      if ((command as unknown) === serverEnvironment.updateSettings) return fixture.update;
      return actual.useAtomCommand(command, options);
    }) as typeof actual.useAtomCommand,
  };
});
vi.mock("./SettingsScopeContext", async (original) => {
  const actual = await original<typeof import("./SettingsScopeContext")>();
  return {
    ...actual,
    useSettingsScope: (() => scope) as typeof actual.useSettingsScope,
    useOptionalSettingsScope: (() => scope) as typeof actual.useOptionalSettingsScope,
  };
});
vi.mock("./useScopedSettings", async (original) => {
  const actual = await original<typeof import("./useScopedSettings")>();
  return {
    ...actual,
    useScopedSettings: () => settings,
    useScopedSettingsMixed: () => false,
    useUpdateScopedSettings: () => fixture.scopedUpdate,
  };
});
vi.mock("~/i18n/readWebI18n", async (original) => {
  const actual = await original<typeof import("~/i18n/readWebI18n")>();
  return {
    ...actual,
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
  };
});
import { deviceEnvironment } from "../../state/device";
import { serverEnvironment } from "../../state/server";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import { toastManager } from "../ui/toast";
import { DevicesSettingsPanel } from "./IntegrationsSettings";
const deviceData: DeviceServiceState = {
  hosts: [],
  hostStatus: "disabled",
  hostStatuses: {},
  devices: [],
  sessions: [],
  onboardingCompleted: false,
  agentAccessEnabled: false,
  hubBasePath: "/api/device-hub",
  revision: 0,
};
const deviceStateAtom = Atom.make(AsyncResult.success(deviceData));
const environmentId = EnvironmentId.make("configure-fixture");
const settings = Schema.decodeSync(ServerSettings)({
  enableDeviceSupport: false,
  enableAgentDeviceAccess: false,
});
const environment: EnvironmentPresentation = {
  environmentId,
  label: "Literal $& {environment}",
  displayUrl: null,
  relayManaged: false,
  connection: { phase: "connected", error: null, traceId: null },
  entry: {
    enabled: true,
    profile: Option.none(),
    target: new PrimaryConnectionTarget({
      environmentId,
      label: "Literal $& {environment}",
      httpBaseUrl: "https://fixture.invalid",
      wsBaseUrl: "wss://fixture.invalid",
    }),
  },
  serverConfig: Schema.decodeSync(ServerConfig)({
    environment: {
      environmentId,
      label: "Literal $& {environment}",
      platform: { os: "linux", arch: "x64" },
      serverVersion: "1.0.0",
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
    settings: { enableDeviceSupport: false, enableAgentDeviceAccess: false },
  }),
};
const configSettings = environment.serverConfig?.settings;
const scope = {
  scope: {
    kind: "environment" as const,
    environmentId,
    environmentIds: [environmentId],
    label: environment.label,
    members: [],
  },
  search: {},
  groups: [],
  singleEnvironment: false,
  selectScope: () => {},
  environment,
  environments: [environment],
  connectedEnvironments: [environment],
  targets: [],
  target: null,
};

it.each(["owned", "raw", "empty", "interrupted", "denied"] as const)(
  "uses settlement locale for device configure failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.allowed = true;
    fixture.configure.mockReset();
    fixture.list.mockReset();
    fixture.update.mockReset();
    fixture.scopedUpdate.mockReset();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (r) => r.dispose());
    using _state = vi.spyOn(deviceEnvironment, "state").mockReturnValue(deviceStateAtom);
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    stack.defer(() => {
      fixture.locale = "en";
      fixture.allowed = true;
    });
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    let finish!: (value: AsyncResult.AsyncResult<never, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<never, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.configure.mockReturnValue(pending);
    const root = createRootRoute({ component: DevicesSettingsPanel });
    const router = createRouter({
      disableGlobalCatchBoundary: true,
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/settings/devices"] }),
    });
    await router.load();
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
          <RouterProvider router={router} />
        </RegistryContext.Provider>
      </WebI18nContext>
    );
    // This fixture owns the router so locale rerenders retain the same mounted route.
    await using screen = await render(surface("en"), { router: false });
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await pending;
        });
      },
    };
    const toggle = screen.getByRole("switch", { name: "Device hub", exact: true });
    await expect.element(toggle).toBeEnabled();
    await expect.element(toggle).not.toBeChecked();
    if (kind === "denied") fixture.allowed = false;
    await toggle.click();
    if (kind === "denied") {
      expect(fixture.configure).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    } else {
      expect(fixture.configure).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: { enabled: true, onboardingCompleted: true },
      });
      await expect.element(toggle).toBeDisabled();
      await act(() => {
        toggle.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
      });
      expect(fixture.configure).toHaveBeenCalledTimes(1);
      expect(toast).not.toHaveBeenCalled();
      fixture.locale = "zh-CN";
      await screen.rerender(surface("zh-CN"));
      await act(async () => {
        finish(
          AsyncResult.failure(
            kind === "interrupted"
              ? Cause.interrupt()
              : Cause.fail(
                  kind === "owned" ? null : new Error(kind === "raw" ? "Private $& {cause}" : ""),
                ),
          ),
        );
        await pending;
      });
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "未能在所有环境中保存设备设置",
        description: "无法更新 Literal $& {environment}。",
      });
    }
    fixture.locale = "en";
    fixture.allowed = true;
    await screen.rerender(surface("en"));
    await expect.element(toggle).toBeEnabled();
    await expect.element(toggle).not.toBeChecked();
    expect(fixture.configure).toHaveBeenCalledTimes(kind === "denied" ? 0 : 1);
    expect(toast).toHaveBeenCalledTimes(kind === "denied" ? 0 : 1);
    expect(environment.serverConfig?.settings).toBe(configSettings);
    expect(environment.serverConfig?.settings).toEqual(settings);
    expect(settings.enableDeviceSupport).toBe(false);
    expect(fixture.list).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.scopedUpdate).not.toHaveBeenCalled();
  },
);

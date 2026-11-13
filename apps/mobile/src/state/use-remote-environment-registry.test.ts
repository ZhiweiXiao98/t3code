import { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import type { AlertButton } from "react-native";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../i18n/mobileStrings";
import type { ConnectedEnvironmentSummary } from "./remote-runtime-types";

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  environments: [] as ConnectedEnvironmentSummary[],
  registration: "unknown" as "registered" | "unregistered" | "unknown",
  cloud: true,
  alert: vi.fn(),
  remove: vi.fn(),
  navigate: vi.fn(),
  pair: vi.fn(),
  set: vi.fn(),
}));
vi.mock("react-native", () => ({ Alert: { alert: state.alert } }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: state.navigate }),
}));
vi.mock("@t3tools/client-runtime/relay", () => ({
  Discovery: { relayEnvironmentRegistration: () => state.registration },
}));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({ runAtomCommand: state.pair }));
vi.mock("../features/cloud/publicConfig", () => ({ hasCloudPublicConfig: () => state.cloud }));
vi.mock("../features/connection/useConnectionController", () => ({
  useConnectionController: () => ({ removeEnvironment: state.remove }),
}));
vi.mock("./presentation", () => ({
  environmentPresentations: { presentationAtom: "presentation" },
}));
vi.mock("./workspace", () => ({
  useWorkspaceConnectionState: () => ({ connectionState: "connected", connectionError: null }),
  useWorkspaceEnvironments: () => state.environments,
}));
vi.mock("./atom-registry", () => ({ appAtomRegistry: { set: state.set, get: () => null } }));
vi.mock("./session", () => ({ environmentSession: { preparedConnectionValueAtom: "connection" } }));
vi.mock("../connection/catalog", () => ({ environmentCatalog: { catalogValueAtom: "catalog" } }));
vi.mock("./remote-environment-projections", () => ({
  createRemoteEnvironmentProjectionAtoms: () => ({
    runtimeStateAtom: vi.fn(),
    savedConnectionAtom: vi.fn(),
  }),
}));
vi.mock("./server", () => ({ serverEnvironment: { configValueAtom: "config" } }));
vi.mock("./relay", () => ({ relayEnvironmentDiscovery: { stateValueAtom: "relay" } }));
vi.mock("../connection/onboarding", () => ({ connectPairingUrl: "connect" }));
vi.mock("../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/mobileStrings")>();
  return {
    ...actual,
    get MOBILE_LOCALE() {
      return state.locale;
    },
    localizeMobileString: (value: string, locale: MobileLocale = state.locale) =>
      actual.localizeMobileString(value, locale),
    localizeAlertArguments: (title: string, message?: string, buttons?: AlertButton[]) =>
      actual.localizeAlertArguments(title, message, buttons, state.locale),
  };
});

import { pairEnvironment, useRemoteConnections } from "./use-remote-environment-registry";

const id = EnvironmentId.make("environment");
const name = "Settings\nOpen {0} $&";
function setup(locale: MobileLocale, relay = false) {
  state.locale = locale;
  state.cloud = true;
  state.registration = "unknown";
  for (const mock of [state.alert, state.remove, state.navigate, state.pair, state.set])
    mock.mockReset();
  state.environments = [
    {
      environmentId: id,
      environmentLabel: name,
      displayUrl: "https://Settings.example/{0}",
      isRelayManaged: relay,
      isEnabled: true,
      connectionState: "connected",
      connectionError: null,
      connectionErrorTraceId: null,
    },
  ];
}
function buttons(): AlertButton[] {
  return state.alert.mock.lastCall?.[2] ?? [];
}

it.each(["en", "zh-CN"] as const)(
  "formats local removal around the literal name in %s and preserves cancel/remove actions",
  (locale) => {
    setup(locale);
    const connections = useRemoteConnections();
    connections.onRemoveEnvironmentPress(id);
    expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual(
      locale === "en"
        ? [
            "Remove from this device?",
            `Forget ${name} and its cached threads on this device. Switch it off instead to keep it saved.`,
          ]
        : ["从此设备移除？", `忘记 ${name} 及其在此设备上缓存的任务。若要保留，请改为将其关闭。`],
    );
    buttons()
      .find((button) => button.style === "cancel")
      ?.onPress?.();
    expect(state.remove).not.toHaveBeenCalled();
    buttons()
      .find((button) => button.style === "destructive")
      ?.onPress?.();
    expect(state.remove).toHaveBeenCalledExactlyOnceWith(id);
    expect(state.environments[0]?.environmentLabel).toBe(name);
    state.alert.mockClear();
    connections.onRemoveEnvironmentPress(EnvironmentId.make("missing"));
    expect(state.alert).not.toHaveBeenCalled();
  },
);

it.each(["registered", "unregistered", "unknown"] as const)(
  "keeps relay account actions and its %s note distinct from the environment name",
  (registration) => {
    setup("zh-CN", true);
    state.registration = registration;
    useRemoteConnections().onRemoveEnvironmentPress(id);
    const message: string = state.alert.mock.lastCall?.[1];
    expect(message.startsWith(`忘记 ${name} 及其在此设备上缓存的任务。\n\n`)).toBe(true);
    expect(message).not.toContain("Forget");
    expect(message).not.toContain("It stays");
    const open = buttons().find(
      (button) => button.style !== "cancel" && button.style !== "destructive",
    );
    if (registration === "unregistered") expect(open).toBeUndefined();
    else {
      expect(open).toBeDefined();
      open?.onPress?.();
      expect(state.navigate).toHaveBeenCalledExactlyOnceWith("SettingsAuth");
    }
    expect(state.remove).not.toHaveBeenCalled();
    state.cloud = false;
    useRemoteConnections().onRemoveEnvironmentPress(id);
    expect(buttons()).toHaveLength(2);
    buttons()
      .find((button) => button.style === "destructive")
      ?.onPress?.();
    expect(state.remove).toHaveBeenCalledExactlyOnceWith(id);
  },
);

it.each(["en", "zh-CN"] as const)(
  "preserves pairing diagnostics and payloads in %s, translating only the non-Error fallback",
  async (locale) => {
    setup(locale);
    const url = "https://Settings.example/pair?token={0}";
    for (const error of [
      new Error("Settings"),
      new Error("Failed to pair with the environment."),
      null,
    ]) {
      state.pair.mockResolvedValue(AsyncResult.failure(Cause.fail(error)));
      expect(await pairEnvironment(url, id)).toEqual({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : locale === "en"
              ? "Failed to pair with the environment."
              : "无法与该环境配对。",
      });
      expect(state.pair.mock.lastCall?.[2]).toEqual({ pairingUrl: url, expectedEnvironmentId: id });
    }
    state.pair.mockResolvedValue(
      AsyncResult.failure(
        Cause.fail(Object.assign(new Error("Settings"), { reason: "unsupported" })),
      ),
    );
    expect(await pairEnvironment(url)).toEqual({ ok: false, error: null });
    expect(state.alert.mock.lastCall?.[1]).toBe("Settings");
    state.pair.mockResolvedValue(AsyncResult.success(undefined));
    expect(await pairEnvironment(url)).toEqual({ ok: true, error: null });
    expect(state.set.mock.lastCall?.[1]).toBe("");
  },
);

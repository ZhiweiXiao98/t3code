import {
  EnvironmentId,
  ProviderInstanceId,
  ProviderDriverKind,
  ProviderSetupError,
  providerAuthMessage,
  type ProviderAuthState,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
import {
  providerAuthFailureValue,
  translateProviderAuthMessage,
} from "../../i18n/providerAuthMessages";

const fixture = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  auth: null as ProviderAuthState | null,
  provider: null as ServerProvider | null,
  start: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
  logout: vi.fn(),
  respond: vi.fn(),
  remove: Object.assign(vi.fn(), { permissionAtom: () => "permission" }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => <div aria-label={accessibilityLabel}>{children}</div>,
  Text: ({
    children,
    accessibilityRole,
    accessibilityLabel,
    accessibilityLiveRegion,
  }: {
    children?: ReactNode;
    accessibilityRole?: "alert";
    accessibilityLabel?: string;
    accessibilityLiveRegion?: "polite";
  }) => (
    <span
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      aria-live={accessibilityLiveRegion}
    >
      {children}
    </span>
  ),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityLabel?: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TextInput: () => null,
  Linking: { openURL: vi.fn() },
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: string) =>
    atom === "permission" ? true : new Map([["test-environment", [fixture.provider]]]),
}));
// Mobile has one fixed locale per build. Set this input before mounting each fresh root;
// changing an imported constant on a mounted compiled component is not a supported setting.
vi.mock("../../i18n/mobileStrings", async (original) => {
  const actual = await original<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    get MOBILE_LOCALE() {
      return fixture.locale;
    },
    localizeMobileString: (value: string, locale: MobileLocale = fixture.locale) =>
      actual.localizeMobileString(value, locale),
  };
});
vi.mock("../../state/presentation", () => ({
  environmentPresentations: { providersByEnvironmentAtom: "providers" },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({ data: fixture.auth, error: null, failure: null, isPending: false }),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentsWithScope: () => new Set(["test-environment"]),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: (command: unknown) => command }));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    providerAuthState: () => "auth",
    startProviderAuth: fixture.start,
    cancelProviderAuth: fixture.cancel,
    completeProviderAuth: fixture.complete,
    logoutProviderAuth: fixture.logout,
    respondProviderAuth: fixture.respond,
    removeProviderAuthMethod: fixture.remove,
  },
}));
vi.mock("./settings-environment-filter", () => ({
  useSettingsEnvironmentFilter: () => ({
    selectedTargets: [{ environmentId: "test-environment", label: "Settings", serverConfig: {} }],
  }),
}));
vi.mock("./components/SettingsEnvironmentFilterHeader", () => ({
  useSettingsEnvironmentMenu: () => null,
}));
vi.mock("./components/SettingsScreen", () => ({
  SettingsScreen: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("./components/SettingsSection", () => ({
  SettingsSection: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("../../components/ui/ScreenScrollView", () => ({
  ScreenScrollView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("../../components/ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("../../components/ui/ControlPill", () => ({
  ControlPill: ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress?: () => void;
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("../../components/ui/Menu", () => ({
  Menu: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("../../components/ui/ListActionRow", () => ({ ListActionRow: () => null }));
vi.mock("../../components/ui/Dialog", () => ({ alertWithLiteralMessage: vi.fn() }));
vi.mock("./ClaudeAccounts", () => ({ AddClaudeAccount: () => null, ClaudeAccount: () => null }));

import { SettingsProviderAccountsRouteScreen } from "./SettingsProviderAccountsRouteScreen";

const instanceId = ProviderInstanceId.make("cursor-test");
const environmentId = EnvironmentId.make("test-environment");
function setup(locale: MobileLocale = "en") {
  vi.clearAllMocks();
  fixture.locale = locale;
  fixture.auth = {
    instanceId,
    phase: "starting",
    flowId: "fake-flow",
    authorizationUrl: null,
    expiresAt: null,
    methods: [],
    ...providerAuthMessage("cursor.starting"),
  };
  fixture.provider = {
    instanceId,
    driver: ProviderDriverKind.make("cursor"),
    displayName: "Settings",
    enabled: true,
    installed: true,
    version: "test",
    status: "ready",
    auth: { status: "unauthenticated" },
    checkedAt: "2026-11-13T00:00:00Z",
    models: [],
    skills: [],
    slashCommands: [],
    setup: { canAuthenticate: true, canInstall: false },
  };
  fixture.cancel.mockResolvedValue({ _tag: "Success", value: fixture.auth });
}

it.each(["en", "zh-CN"] as const)(
  "renders auth status and raw text in a %s build with unchanged actions and account privacy",
  async (locale) => {
    setup(locale);
    expect(MOBILE_LOCALE).toBe(locale);
    const starting = locale === "zh-CN" ? "正在开始 Cursor 登录。" : "Starting Cursor sign-in.";
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const rerender = () => act(() => root.render(<SettingsProviderAccountsRouteScreen />));
    try {
      rerender();
      expect(container.textContent).toContain(starting);
      expect(container.querySelector(`[aria-label="Settings, ${starting}"]`)).not.toBeNull();
      expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(starting);
      rerender();
      expect(container.textContent).toContain(starting);
      expect(fixture.start).not.toHaveBeenCalled();
      expect(fixture.complete).not.toHaveBeenCalled();
      expect(fixture.cancel).not.toHaveBeenCalled();
      for (const message of ["Open", "Starting Cursor sign-in."]) {
        fixture.auth = { ...fixture.auth!, phase: "failed", message, messageDescriptor: undefined };
        rerender();
        expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(message);
      }
      fixture.auth = {
        ...fixture.auth!,
        phase: "waiting",
        ...providerAuthMessage("cursor.waiting"),
      };
      rerender();
      await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
      expect(fixture.cancel).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: { instanceId, flowId: "fake-flow" },
      });
      fixture.auth = {
        ...fixture.auth!,
        phase: "idle",
        message: null,
        messageDescriptor: undefined,
      };
      fixture.provider = {
        ...fixture.provider!,
        auth: { status: "authenticated", email: "private@example.test" },
      };
      rerender();
      expect(container.textContent).not.toContain("private@example.test");
      expect(container.textContent).toContain("••••••@••••••");
      expect(container.textContent).toContain("Settings");
      expect(fixture.logout).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);

it.each(["en", "zh-CN"] as const)(
  "renders a retained command failure in a %s build without resending sign-in",
  async (locale) => {
    setup(locale);
    expect(MOBILE_LOCALE).toBe(locale);
    const expired =
      locale === "zh-CN" ? "登录已过期。请重新开始。" : "Sign-in expired. Start again.";
    fixture.auth = { ...fixture.auth!, phase: "idle", flowId: null };
    fixture.start.mockResolvedValue({
      _tag: "Failure",
      cause: Cause.fail(
        new ProviderSetupError({
          instanceId,
          operation: "start",
          detail: "Sign-in expired. Start again.",
          messageDescriptor: { code: "auth.expired" },
        }),
      ),
    });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() => root.render(<SettingsProviderAccountsRouteScreen />));
      await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(expired);
      act(() => root.render(<SettingsProviderAccountsRouteScreen />));
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(expired);
      act(() => root.render(<SettingsProviderAccountsRouteScreen />));
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(expired);
      expect(fixture.start).toHaveBeenCalledTimes(1);
      expect(fixture.cancel).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);

it("formats the same retained auth descriptors for explicit en, zh-CN and en inputs", () => {
  setup();
  const state = providerAuthMessage("cursor.starting");
  const failure = providerAuthFailureValue(
    new ProviderSetupError({
      instanceId,
      operation: "start",
      detail: "Sign-in expired. Start again.",
      messageDescriptor: { code: "auth.expired" },
    }),
    "Could not update provider sign-in.",
  );
  const locales = ["en", "zh-CN", "en"] as const;
  expect(locales.map((locale) => translateProviderAuthMessage(state, locale))).toEqual([
    "Starting Cursor sign-in.",
    "正在开始 Cursor 登录。",
    "Starting Cursor sign-in.",
  ]);
  expect(locales.map((locale) => translateProviderAuthMessage(failure, locale))).toEqual([
    "Sign-in expired. Start again.",
    "登录已过期。请重新开始。",
    "Sign-in expired. Start again.",
  ]);
  expect(state).toEqual(providerAuthMessage("cursor.starting"));
  expect(failure).toEqual(providerAuthMessage("auth.expired"));
  expect(fixture.start).not.toHaveBeenCalled();
  expect(fixture.cancel).not.toHaveBeenCalled();
});

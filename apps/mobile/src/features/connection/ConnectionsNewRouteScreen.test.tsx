import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";

const { Children, harness } = vi.hoisted(() => ({
  Children: ({ children }: { children?: ReactNode }) => <>{children}</>,
  harness: {
    // The app-wide error slot other features (composer sends, branch refreshes) write to.
    pendingConnectionError: null as string | null,
    connectPress: vi.fn(),
    alert: vi.fn(),
    locale: "en" as MobileLocale,
    scanValue: "",
    scanFailure: undefined as unknown,
  },
}));

vi.mock("react-native", () => ({
  View: Children,
  Platform: { OS: "ios" },
  Text: ({
    children,
    accessibilityLiveRegion,
  }: {
    children?: ReactNode;
    accessibilityLiveRegion?: "polite" | "assertive";
  }) => <span aria-live={accessibilityLiveRegion}>{children}</span>,
  TextInput: ({ value }: { value?: string }) => <input readOnly value={value} />,
  Pressable: Children,
  Alert: { alert: harness.alert, prompt: vi.fn() },
  Linking: { openSettings: vi.fn() },
  StyleSheet: { absoluteFill: {} },
}));
vi.mock("react-native-svg", () => ({
  default: Children,
  Defs: Children,
  RadialGradient: Children,
  Rect: () => null,
  Stop: () => null,
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@react-navigation/native", () => ({
  StackActions: { replace: vi.fn() },
  useIsFocused: () => true,
  useNavigation: () => ({ canGoBack: () => true, goBack: vi.fn(), dispatch: vi.fn() }),
  useRoute: () => ({ name: "ConnectionsNew" }),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ isLoaded: false, isSignedIn: false }) }));
vi.mock("expo-camera", () => ({
  CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (result: { data: string }) => void }) => (
    <button onClick={() => onBarcodeScanned({ data: harness.scanValue })}>Scan fixture</button>
  ),
  useCameraPermissions: () => [{ granted: true }, vi.fn()],
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(async () => {}),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
vi.mock("../../components/ui/ListRow", () => ({ ListRow: () => null }));
vi.mock("../../components/ui/ScreenScrollView", () => ({ ScreenScrollView: Children }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, harness.locale),
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], harness.locale),
  };
});
vi.mock("./pairing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pairing")>();
  return {
    ...actual,
    extractPairingUrlFromQrPayload: (payload: string) => {
      if (harness.scanFailure !== undefined) throw harness.scanFailure;
      return actual.extractPairingUrlFromQrPayload(payload);
    },
  };
});
vi.mock("../../components/ui/FrostedCutout", () => ({ FrostedCutout: () => null }));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../lib/useUniwindTheme", () => ({ useUniwindTheme: () => ({}) }));
vi.mock("../settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "dark" }),
}));
vi.mock("../settings/components/SettingsScreen", () => ({
  SettingsScreen: ({
    actions,
    children,
  }: {
    actions: Array<{ onPress: () => void; disabled?: boolean }>;
    children?: ReactNode;
  }) => (
    <>
      <button data-submit disabled={actions[0]?.disabled} onClick={actions[0]?.onPress}>
        Connect fixture
      </button>
      {children}
    </>
  ),
}));
vi.mock("../settings/settings-navigation", () => ({
  leaveSettingsPage: vi.fn(),
  openSettings: vi.fn(),
}));
vi.mock("../layout/workspace/workspace-selection-store", () => ({
  workspaceHasColumns: () => false,
}));
vi.mock("../cloud/publicConfig", () => ({ hasCloudPublicConfig: () => false }));
vi.mock("./CloudEnvironmentRows", () => ({ CloudEnvironmentRows: () => null }));
vi.mock("./environmentSections", () => ({
  splitEnvironmentSections: () => ({ connectedCloudEnvironments: [] }),
}));
vi.mock("./devAutoConnect", () => ({
  autoConnectReport: () => ({ connecting: false, error: null }),
  devAutoConnectAttemptAtom: {},
}));
vi.mock("../../state/use-remote-environment-registry", () => ({
  setPendingConnectionError: (message: string | null) => {
    harness.pendingConnectionError = message;
  },
  useRemoteConnections: () => ({
    connectionPairingUrl: "https://example.com/#token=Settings",
    connectedEnvironments: [],
    pairingConnectionError: harness.pendingConnectionError,
    onChangeConnectionPairingUrl: vi.fn(),
    onConnectPress: harness.connectPress,
    onSetEnvironmentEnabled: vi.fn(),
    onRemoveEnvironmentPress: vi.fn(),
  }),
}));

import { ConnectionsNewRouteScreen } from "./ConnectionsNewRouteScreen";

it("does not show another feature's error as a pairing failure", () => {
  harness.locale = "en";
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("__DEV__", false);
  harness.pendingConnectionError = "Could not send the message.";
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<ConnectionsNewRouteScreen route={{ params: undefined }} />));

  expect(container.textContent).not.toContain("Could not send the message.");
  expect(container.textContent).toContain("For machines on your local network or tailnet.");

  act(() => root.unmount());
  // Leaving the form must not wipe an error that belongs to another screen.
  expect(harness.pendingConnectionError).toBe("Could not send the message.");
});

it.each(["en", "zh-CN"] as const)(
  "localizes QR fallbacks and instructions in %s while retaining raw pairing errors and URL inputs",
  async (locale) => {
    harness.locale = locale;
    harness.alert.mockReset();
    harness.connectPress.mockReset();
    harness.scanValue = "";
    harness.scanFailure = undefined;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("__DEV__", false);
    vi.useFakeTimers();
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() => root.render(<ConnectionsNewRouteScreen route={{ params: undefined }} />));
      expect(container.textContent).toContain(
        locale === "en"
          ? "For machines on your local network or tailnet. The machine keeps its own provider credentials."
          : "用于本地网络或 tailnet 中的机器。各机器自行保存提供方凭据。",
      );
      expect(Array.from(container.querySelectorAll("input")).map((input) => input.value)).toEqual([
        "https://example.com",
        "Settings",
      ]);
      const scan = container.querySelectorAll("button")[1]!;
      for (const [failure, expected] of [
        [
          undefined,
          locale === "en"
            ? "Scanned QR code did not contain a pairing URL."
            : "扫描的二维码中没有配对网址。",
        ],
        [new Error("Settings"), "Settings"],
        [42, locale === "en" ? "Scanned QR code was not recognized." : "无法识别扫描的二维码。"],
      ] as const) {
        harness.scanFailure = failure;
        act(() => scan.click());
        expect(harness.alert.mock.lastCall?.[1]).toBe(expected);
        act(() => vi.advanceTimersByTime(600));
      }
      harness.connectPress.mockResolvedValueOnce({ ok: false, error: "Settings" });
      await act(async () => container.querySelector<HTMLButtonElement>("[data-submit]")!.click());
      expect(harness.connectPress).toHaveBeenCalledExactlyOnceWith(
        "https://example.com/#token=Settings",
        undefined,
      );
      expect(container.querySelector("span[aria-live]")?.textContent).toBe("Settings");
    } finally {
      act(() => root.unmount());
      vi.useRealTimers();
      vi.unstubAllGlobals();
      harness.scanFailure = undefined;
    }
  },
);

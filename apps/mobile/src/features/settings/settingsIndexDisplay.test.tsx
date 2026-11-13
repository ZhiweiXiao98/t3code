import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  query: "",
  email: "Settings" as string | undefined,
  accountLoaded: true,
  signedIn: true,
  navigate: vi.fn(),
  updateSettings: vi.fn(),
  voiceQuery: undefined as ((query: string) => void) | undefined,
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress: () => void }) => (
    <button onClick={onPress}>{children}</button>
  ),
  useWindowDimensions: () => ({ fontScale: 1 }),
  Switch: ({
    accessibilityLabel,
    accessibilityHint,
    disabled,
    value,
    onValueChange,
  }: {
    accessibilityLabel?: string;
    accessibilityHint?: string;
    disabled?: boolean;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <button
      role="switch"
      aria-label={accessibilityLabel}
      data-hint={accessibilityHint}
      disabled={disabled}
      aria-checked={value}
      onClick={() => onValueChange(!value)}
    />
  ),
  FlatList: ({
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
  }) => (
    <>
      {ListHeaderComponent}
      {ListEmptyComponent}
    </>
  ),
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: state.navigate }),
  useNavigationState: () => null,
  useRoute: () => ({ name: "Settings" }),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: state.accountLoaded, isSignedIn: state.signedIn }),
  useUser: () => ({ user: { primaryEmailAddress: { emailAddress: state.email } } }),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => AsyncResult.success({ models: [] }),
  useAtomSet: () => vi.fn(),
}));
vi.mock("uniwind", () => ({ useResolveClassNames: () => ({}) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("../../native/native-layout-metrics", () => ({ useNativeColumnLayoutMetrics: () => null }));
vi.mock("../../components/ui/Pane", () => ({ usePaneRole: () => null }));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/RadioIndicator", () => ({ RadioIndicator: () => null }));
vi.mock("../../components/ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("../../components/ui/Button", () => ({ Button: () => null }));
vi.mock("../../components/ui/ScreenScrollView", () => ({
  ScreenScrollView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("../../components/ui/RowPressable", () => ({
  RowPressable: ({
    children,
    accessibilityLabel,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    get MOBILE_LOCALE() {
      return state.locale;
    },
    localizeMobileString: (value: string, locale: MobileLocale = state.locale) =>
      actual.localizeMobileString(value, locale),
  };
});
vi.mock("../cloud/publicConfig", () => ({ hasCloudPublicConfig: () => true }));
vi.mock("../../state/use-remote-environment-registry", () => ({
  useSavedRemoteConnections: () => ({ savedConnectionsById: {} }),
}));
vi.mock("../layout/workspace/navigation-tabs", () => ({
  NAVIGATION_TAB_ICONS: {},
  WORKSPACE_TAB_LABELS: {},
  useNavigationTabOrder: () => [],
  useHiddenNavigationTabs: () => [],
}));
vi.mock("../layout/workspace/workspace-selection-store", () => ({
  currentWorkspaceSelections: () => ({}),
}));
vi.mock("../layout/workspace/workspace-tab-navigation", () => ({
  rememberedSettingsPage: () => null,
}));
vi.mock("../layout/workspace/useSelectWorkspaceTab", () => ({
  useSelectWorkspaceTab: () => vi.fn(),
}));
vi.mock("../layout/workspace/WorkspaceTabsContext", () => ({
  useWorkspaceTabs: () => ({
    state: { tabs: { settings: { query: state.query } } },
    dispatch: vi.fn(),
  }),
}));
vi.mock("../layout/adaptive-workspace-context", () => ({
  useAdaptiveWorkspaceLayout: () => ({ layout: { usesSplitView: false } }),
}));
vi.mock("./components/SettingsScreen", () => ({
  SettingsScreen: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("./components/SettingsEnvironmentFilterHeader", () => ({
  useSettingsEnvironmentMenu: () => ({}),
}));
vi.mock("./components/AutoSettleDaysField", () => ({ AutoSettleDaysField: () => null }));
vi.mock("./settings-navigation", () => ({ openSettings: vi.fn() }));
vi.mock("./settings-environment-filter", () => ({
  useSettingsEnvironmentFilter: () => ({
    selectedTargets: [],
    projectGroups: [{ key: "project", label: "Open", members: [] }],
    selectedProjectKey: "project",
  }),
}));
vi.mock("../../state/preferences", () => ({
  mobilePreferencesAtom: {},
  updateMobilePreferencesAtom: {},
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { updateSettings: {} } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.updateSettings }));
vi.mock("../../state/session", () => ({
  useEnvironmentsWithScope: () => new Set(["normal", "managed"]),
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId: "normal",
        label: "Settings",
        connection: { phase: "connected" },
        serverConfig: {
          environment: { capabilities: { peerLinks: true, fastWorktreeCheckout: true } },
          settings: { linkedEnvironmentsEnabled: false, fastWorktreeCheckout: false },
        },
      },
      {
        environmentId: "managed",
        label: "Open {0} $&",
        connection: { phase: "connected" },
        serverConfig: {
          environment: { capabilities: { peerLinks: true, fastWorktreeCheckout: true } },
          settings: { linkedEnvironmentsEnabled: false, fastWorktreeCheckout: false },
          managedPolicy: {
            organization: "Settings {0} $&",
            lockedSettings: ["linkedEnvironmentsEnabled", "fastWorktreeCheckout"],
          },
        },
      },
    ],
  }),
}));
vi.mock("../voice-input/voiceDestination", () => ({ voiceSpeechBenchmarksAtom: () => ({}) }));
vi.mock("./VoiceModelSection", () => ({
  useVoiceModels: () => ({ models: [], canManage: false, loading: false }),
  VoiceModelRow: () => null,
}));
vi.mock("../pull-requests/PullRequestSearchSheet", () => ({
  PullRequestSearchSheet: ({
    children,
    onQueryChange,
  }: {
    children: (insets: { paddingBottom: number }) => ReactNode;
    onQueryChange: (query: string) => void;
  }) => {
    state.voiceQuery = onQueryChange;
    return <>{children({ paddingBottom: 0 })}</>;
  },
}));

import { SettingsListScreen } from "./SettingsRouteScreen";
import { SettingsVoiceModelsRouteScreen } from "./SettingsVoiceModelsRouteScreen";
import { SettingsLabsRouteScreen } from "./ThreadSettingsSections";

function mount(locale: MobileLocale) {
  state.locale = locale;
  state.query = "";
  state.email = "Settings";
  state.accountLoaded = true;
  state.signedIn = true;
  state.navigate.mockReset();
  state.updateSettings.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  return {
    container,
    render(node: ReactNode) {
      act(() => root.render(node));
    },
    [Symbol.dispose]() {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}

it.each(["en", "zh-CN"] as const)(
  "keeps account, project and search values literal in %s without changing account navigation",
  (locale) => {
    using screen = mount(locale);
    screen.render(<SettingsListScreen sidebar={false} selected={null} />);
    const account = screen.container.querySelector("button")!;
    expect(account.textContent).toBe(locale === "en" ? "T3 AccountSettings" : "T3 账户Settings");
    expect(
      Array.from(screen.container.querySelectorAll("button")).some(
        (button) => button.textContent === (locale === "en" ? "ProjectsOpen" : "项目Open"),
      ),
    ).toBe(true);
    act(() => account.click());
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith("SettingsAuth");
    state.query = "  nonexistent-Settings {0} $&  ";
    screen.render(<SettingsListScreen key="search" sidebar={false} selected={null} />);
    expect(screen.container.textContent).toContain(
      locale === "en"
        ? "No settings match “nonexistent-Settings {0} $&”."
        : "没有与“nonexistent-Settings {0} $&”匹配的设置。",
    );
    state.query = "";
    state.email = undefined;
    screen.render(<SettingsListScreen key="fallback" sidebar={false} selected={null} />);
    expect(screen.container.querySelector("button")?.textContent).toBe(
      locale === "en" ? "T3 AccountSigned in" : "T3 账户已登录",
    );
  },
);

it.each(["en", "zh-CN"] as const)(
  "retains the environment name in %s and switches the model empty state with search",
  (locale) => {
    using screen = mount(locale);
    screen.render(
      <SettingsVoiceModelsRouteScreen
        route={{ params: { environmentId: EnvironmentId.make("normal") } }}
      />,
    );
    expect(screen.container.textContent).toContain(
      locale === "en" ? "Settings has no models to list." : "Settings 没有可列出的模型。",
    );
    act(() => state.voiceQuery!("Open {0} $&"));
    expect(screen.container.textContent).toContain(
      locale === "en" ? "Try another name or language." : "请尝试其他名称或语言。",
    );
    expect(screen.container.textContent).not.toContain(
      locale === "en" ? "has no models" : "没有可列出的模型",
    );
  },
);

it.each(["en", "zh-CN"] as const)(
  "localizes both Beta titles in %s while preserving machine names, managed policy and setting updates",
  (locale) => {
    using screen = mount(locale);
    screen.render(<SettingsLabsRouteScreen />);
    expect(screen.container.textContent).toContain(
      locale === "en" ? "Beta: Linked environments" : "测试版：关联环境",
    );
    expect(screen.container.textContent).toContain(
      locale === "en" ? "Beta: Fast worktree checkout" : "测试版：快速检出工作树",
    );
    const switches = screen.container.querySelectorAll<HTMLButtonElement>('[role="switch"]');
    expect(Array.from(switches).map((control) => control.getAttribute("aria-label"))).toEqual([
      "Settings",
      "Open {0} $&",
      "Settings",
      "Open {0} $&",
    ]);
    expect(switches[1]!.getAttribute("data-hint")).toBe(
      locale === "en" ? "Managed by Settings {0} $&." : "由 Settings {0} $& 管理。",
    );
    expect(switches[1]!.disabled).toBe(true);
    expect(switches[3]!.disabled).toBe(true);
    act(() => {
      switches[0]!.click();
      switches[1]!.click();
      switches[2]!.click();
    });
    expect(state.updateSettings.mock.calls).toEqual([
      [{ environmentId: "normal", input: { patch: { linkedEnvironmentsEnabled: true } } }],
      [{ environmentId: "normal", input: { patch: { fastWorktreeCheckout: true } } }],
    ]);
  },
);

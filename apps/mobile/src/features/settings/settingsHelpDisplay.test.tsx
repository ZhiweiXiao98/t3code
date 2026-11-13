import type { ServerProvider } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";
import type { SettingsTarget } from "./settings-environment-filter";

type WebEvents = {
  onError: (event: { nativeEvent: { description: string } }) => void;
  onHttpError: (event: { nativeEvent: { url: string; statusCode: number } }) => void;
};

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  alert: vi.fn(),
  openUrl: vi.fn(),
  copy: vi.fn(),
  updatePreferences: vi.fn(),
  webEvents: undefined as WebEvents | undefined,
  dismissed: [] as string[],
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
  Alert: { alert: state.alert, prompt: vi.fn() },
  Linking: { openURL: state.openUrl },
}));
vi.mock("react-native-webview", () => ({
  WebView: (props: WebEvents) => {
    state.webEvents = props;
    return <div data-webview />;
  },
}));
vi.mock("@react-navigation/native", () => ({ useNavigation: () => ({ goBack: vi.fn() }) }));
vi.mock("uniwind", () => ({ useResolveClassNames: () => ({}) }));
vi.mock("../../components/ProviderIcon", () => ({ ProviderIcon: () => null }));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("../../components/ui/LoadingStrip", () => ({ LoadingStrip: () => null }));
vi.mock("../../components/ui/SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("../../components/ui/Button", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button data-action={label} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("../../components/ui/RowPressable", () => ({
  RowPressable: ({
    children,
    accessibilityLabel,
    accessibilityHint,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    onPress: () => void;
  }) => (
    <button aria-label={accessibilityLabel} data-hint={accessibilityHint} onClick={onPress}>
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
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], state.locale),
  };
});
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: string) =>
    atom === "compaction"
      ? [
          {
            environmentId: "environment",
            status: { compactCommand: "Open", reclaimableBytes: 1024 ** 3 },
          },
        ]
      : AsyncResult.success({ dismissedDatabaseStorageNotices: state.dismissed }),
  useAtomSet: () => state.updatePreferences,
}));
vi.mock("../../state/preferences", () => ({
  mobilePreferencesAtom: "preferences",
  updateMobilePreferencesAtom: "update-preferences",
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { databaseCompactionRecommendations: () => "compaction" },
}));
vi.mock("../../lib/copyTextWithHaptic", () => ({ copyTextWithHaptic: state.copy }));

import { CHATGPT_USAGE_URL } from "@t3tools/shared/usageLimits";
import { ChatGptSharingStatus } from "../threads/ChatGptSharingStatus";
import { DatabaseStorageNotice } from "./components/DatabaseStorageNotice";
import { SettingsLegalDocumentRouteScreen } from "./components/SettingsLegalDocumentRouteScreen";
import { LEGAL_URL } from "./lib/legal-document-url";

function mount(locale: MobileLocale) {
  state.locale = locale;
  state.alert.mockReset();
  state.openUrl.mockReset().mockResolvedValue(undefined);
  state.copy.mockReset();
  state.updatePreferences.mockReset();
  state.dismissed = [];
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
  "localizes legal page fallbacks in %s while preserving native errors, navigation filtering and retries",
  (locale) => {
    using screen = mount(locale);
    const url = `${LEGAL_URL}?name=Open#Settings`;
    screen.render(<SettingsLegalDocumentRouteScreen documentName="Legal" documentUrl={url} />);
    act(() =>
      state.webEvents!.onHttpError({
        nativeEvent: { url: "https://outside.example", statusCode: 403 },
      }),
    );
    expect(screen.container.querySelector("[data-webview]")).not.toBeNull();
    act(() => state.webEvents!.onHttpError({ nativeEvent: { url, statusCode: 503 } }));
    expect(screen.container.textContent).toContain(
      locale === "en" ? "The server returned status 503." : "服务器返回了状态码 503。",
    );
    const retry = () =>
      act(() =>
        screen.container.querySelector<HTMLButtonElement>('[data-action="Try Again"]')!.click(),
      );
    retry();
    expect(screen.container.querySelector("[data-webview]")).not.toBeNull();
    for (const error of ["Settings", "Open {0} $&", ""]) {
      act(() => state.webEvents!.onError({ nativeEvent: { description: error } }));
      expect(screen.container.querySelectorAll("span")[1]?.textContent).toBe(
        error || (locale === "en" ? "The page could not be loaded." : "无法加载页面。"),
      );
      retry();
    }
    act(() => state.webEvents!.onError({ nativeEvent: { description: "Open" } }));
    act(() => screen.container.querySelectorAll("button")[1]!.click());
    expect(state.openUrl).toHaveBeenCalledExactlyOnceWith(url);
  },
);

it.each(["en", "zh-CN"] as const)(
  "keeps ChatGPT account data literal in %s while localizing paragraphs and preserving the usage action",
  (locale) => {
    using screen = mount(locale);
    for (const email of ["Settings", "Open {0} $&", "reader+Settings@example.com", undefined]) {
      const provider = {
        auth: { status: "authenticated", subscriptionSharing: true, email },
      } as unknown as ServerProvider;
      screen.render(<ChatGptSharingStatus provider={provider} />);
      act(() => screen.container.querySelector("button")!.click());
      expect(state.alert.mock.lastCall?.[0]).toBe(
        locale === "en" ? "ChatGPT sharing is on" : "已开启 ChatGPT 分享",
      );
      expect(state.alert.mock.lastCall?.[1]).toBe(
        [
          email,
          locale === "en"
            ? "Eligible usage uses your ChatGPT plan. Credit settings and limits are managed in ChatGPT."
            : "符合条件的用量使用你的 ChatGPT 套餐。额度设置和限制在 ChatGPT 中管理。",
          locale === "en"
            ? "Fast and Ultrafast are unavailable with this ChatGPT connection. Use an existing Codex CLI login for speed options your account supports."
            : "此 ChatGPT 连接不支持 Fast 和 Ultrafast。请使用现有的 Codex CLI 登录，以使用账户支持的速度选项。",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
    act(() => screen.container.querySelectorAll("button")[1]!.click());
    expect(state.openUrl).toHaveBeenCalledExactlyOnceWith(CHATGPT_USAGE_URL);
    screen.render(<ChatGptSharingStatus provider={null} />);
    expect(screen.container.textContent).toBe("");
  },
);

it.each(["en", "zh-CN"] as const)(
  "keeps database environment labels and copy commands literal in %s and retains dismissal state",
  (locale) => {
    using screen = mount(locale);
    const targets = [
      { environmentId: "environment", label: "Settings" },
    ] as unknown as SettingsTarget[];
    screen.render(<DatabaseStorageNotice targets={targets} />);
    const rows = screen.container.querySelectorAll("button");
    expect(rows[0]!.textContent).toBe("SettingsOpen1.0 GiB");
    expect(rows[0]!.getAttribute("aria-label")).toBe("Settings");
    expect(rows[0]!.getAttribute("data-hint")).toBe("Open");
    act(() => rows[0]!.click());
    expect(state.copy).toHaveBeenCalledExactlyOnceWith("Open", { target: "command" });
    act(() => rows[1]!.click());
    const transform = state.updatePreferences.mock.lastCall?.[0].transform;
    expect(transform({ dismissedDatabaseStorageNotices: ["earlier"] })).toEqual({
      dismissedDatabaseStorageNotices: ["earlier", "environment"],
    });
    state.dismissed = ["environment"];
    screen.render(<DatabaseStorageNotice targets={targets} />);
    expect(screen.container.textContent).toBe("");
  },
);

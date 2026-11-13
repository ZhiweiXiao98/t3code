import { DEFAULT_SERVER_SETTINGS, type SourceControlSignInPrompt } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { AlertButton } from "react-native";
import { expect, it, vi } from "vite-plus/test";

import type { MobileLocale } from "../../../i18n/mobileStrings";
import type { SettingsTarget } from "../settings-environment-filter";

const mocks = vi.hoisted(() => ({
  locale: "zh-CN" as MobileLocale,
  alert: vi.fn(),
  copy: vi.fn(),
  openUrl: vi.fn(),
  start: vi.fn(),
  wait: vi.fn(),
  cancel: vi.fn(),
  update: vi.fn(),
  appSignIn: {
    appName: "Open",
    hosts: ["github.com"],
    installUrl: "https://github.com/apps/Settings/installations/new?name=Open",
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
  useWindowDimensions: () => ({ fontScale: 1 }),
  Alert: { alert: mocks.alert, prompt: vi.fn() },
  Linking: { openURL: mocks.openUrl },
}));
vi.mock("expo-clipboard", () => ({ setStringAsync: mocks.copy }));
vi.mock("uniwind", () => ({ useResolveClassNames: () => ({ backgroundColor: "#fff" }) }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({}),
  useRoute: () => ({ name: "Settings" }),
}));
vi.mock("../settings-navigation", () => ({ openSettings: vi.fn() }));
vi.mock("../../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../../components/ui/RadioIndicator", () => ({ RadioIndicator: () => null }));
vi.mock("../../../components/ui/RowPressable", () => ({
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
vi.mock("../../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../i18n/mobileStrings")>();
  return {
    ...actual,
    get MOBILE_LOCALE() {
      return mocks.locale;
    },
    localizeMobileString: (value: string, locale: MobileLocale = mocks.locale) =>
      actual.localizeMobileString(value, locale),
    localizeAlertArguments: (title: string, message?: string, buttons?: AlertButton[]) =>
      actual.localizeAlertArguments(title, message, buttons, mocks.locale),
  };
});
vi.mock("@t3tools/client-runtime/source-control-clients", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@t3tools/client-runtime/source-control-clients")>();
  const definition = actual.sourceControlClients.definitions.find(
    (definition) => definition.kind === "github",
  )!;
  return {
    ...actual,
    sourceControlClients: {
      definitions: [
        {
          ...definition,
          label: "Settings",
          credentials: { ...definition.credentials, appSignIn: mocks.appSignIn },
        },
      ],
    },
  };
});
vi.mock("../../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: { sourceControlProviders: [{ kind: "github", appSignIn: true }] },
  }),
}));
vi.mock("../../../state/sourceControl", () => ({
  sourceControlEnvironment: {
    discovery: () => ({}),
    startSignIn: "start",
    waitForSignIn: "wait",
    cancelSignIn: "cancel",
  },
}));
vi.mock("../../../state/server", () => ({ serverEnvironment: { updateSettings: "update" } }));
vi.mock("../../../state/use-atom-command", () => ({
  useAtomCommand: (command: "start" | "wait" | "cancel" | "update") => mocks[command],
}));

import { SourceControlSignInSection } from "./SourceControlSignInSection";

function environment(label: string, signIns: Record<string, string> = {}): SettingsTarget {
  return {
    environmentId: label,
    label,
    serverConfig: {
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        sourceControlHosts: { github: { signIns } },
      },
    },
  } as unknown as SettingsTarget;
}

function mount(locale: MobileLocale, environments: readonly SettingsTarget[], writable = true) {
  mocks.locale = locale;
  for (const mock of [
    mocks.alert,
    mocks.copy,
    mocks.openUrl,
    mocks.start,
    mocks.wait,
    mocks.cancel,
    mocks.update,
  ]) {
    mock.mockReset();
  }
  mocks.copy.mockResolvedValue(undefined);
  mocks.openUrl.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue({ _tag: "Success" });
  mocks.update.mockResolvedValue({ _tag: "Success" });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <SourceControlSignInSection environments={environments} canWrite={() => writable} />,
    ),
  );
  return {
    container,
    [Symbol.dispose]() {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}

function dialog() {
  const [title, message, buttons] = mocks.alert.mock.lastCall as [string, string, AlertButton[]];
  return { title, message, buttons };
}

const prompt = (userCode: string): SourceControlSignInPrompt => ({
  userCode,
  verificationUri: "https://github.com/login/device?code=Settings&name=Open",
  expiresAt: 1_000,
});

it.each(["en", "zh-CN"] as const)(
  "preserves sign-in codes and names while localizing instructions and ignoring cancelled outcomes in %s",
  async (locale) => {
    mocks.appSignIn.appName = "Settings {0} $&";
    using screen = mount(locale, [environment("Open"), environment("Settings {0} $&")]);
    const row = screen.container.querySelector("button")!;
    expect(screen.container.textContent).toContain("Settings · Open");
    expect(screen.container.textContent).toContain("Settings · Settings {0} $&");
    expect(row.getAttribute("aria-label")).toBe(
      `Settings {0} $&, ${locale === "en" ? "Sign in" : "登录"}`,
    );
    const firstStart = Promise.withResolvers<{
      _tag: "Success";
      value: SourceControlSignInPrompt;
    }>();
    const firstWait = Promise.withResolvers<{ _tag: "Failure"; cause: Cause.Cause<unknown> }>();
    mocks.start.mockReturnValueOnce(firstStart.promise);
    mocks.wait.mockReturnValueOnce(firstWait.promise);
    act(() => row.click());
    expect(row.textContent).toContain(locale === "en" ? "Starting…" : "正在启动…");
    act(() => row.click());
    expect(mocks.start).toHaveBeenCalledOnce();
    const first = prompt("Settings");
    await act(async () => {
      firstStart.resolve({ _tag: "Success", value: first });
      await firstStart.promise;
    });
    expect(row.getAttribute("aria-label")).toBe(
      `Settings {0} $&, ${locale === "en" ? "Enter Settings" : "输入 Settings"}`,
    );
    expect(dialog().title).toBe("Settings");
    expect(dialog().message).toBe(
      locale === "en"
        ? "Enter this code on GitHub, then approve Settings {0} $&. It is copied. The server finishes signing in even if you leave the app."
        : "在 GitHub 上输入此代码，然后批准 Settings {0} $&。代码已复制。即使离开应用，服务器也会完成登录。",
    );
    expect(dialog().buttons.map((button) => button.text)).toEqual(
      locale === "en" ? ["Cancel", "Open GitHub"] : ["取消", "打开 GitHub"],
    );
    act(() => dialog().buttons[1]!.onPress?.());
    expect(mocks.openUrl).toHaveBeenCalledExactlyOnceWith(first.verificationUri);
    act(() => row.click());
    expect(mocks.copy.mock.calls).toEqual([["Settings"], ["Settings"]]);
    expect(mocks.start).toHaveBeenCalledOnce();
    act(() => dialog().buttons[0]!.onPress?.());
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({
      environmentId: "Open",
      input: { provider: "github", host: "github.com" },
    });
    expect(row.textContent).toContain(locale === "en" ? "Sign in" : "登录");

    const current = prompt("Open {0} $&");
    const currentWait = Promise.withResolvers<{ _tag: "Failure"; cause: Cause.Cause<unknown> }>();
    mocks.start.mockResolvedValueOnce({ _tag: "Success", value: current });
    mocks.wait.mockReturnValueOnce(currentWait.promise);
    await act(async () => row.click());
    const currentDialog = dialog();
    await act(async () => {
      firstWait.resolve({ _tag: "Failure", cause: Cause.fail(new Error("Settings")) });
      await firstWait.promise;
    });
    expect(dialog()).toEqual(currentDialog);
    expect(row.textContent).toContain(locale === "en" ? "Enter Open {0} $&" : "输入 Open {0} $&");
    expect(mocks.wait.mock.calls).toEqual([
      [{ environmentId: "Open", input: { provider: "github", host: "github.com" } }],
      [{ environmentId: "Open", input: { provider: "github", host: "github.com" } }],
    ]);
    await act(async () => {
      currentWait.resolve({ _tag: "Failure", cause: Cause.fail("Open") });
      await currentWait.promise;
    });
    expect(dialog().title).toBe(locale === "en" ? "Sign-in did not finish" : "登录未完成");
    expect(dialog().message).toBe("Open");
    expect(row.textContent).toContain(locale === "en" ? "Sign in" : "登录");
  },
);

it.each(["en", "zh-CN"] as const)(
  "keeps start failures literal and leaves the row retryable in %s",
  async (locale) => {
    mocks.appSignIn.appName = "Open";
    using screen = mount(locale, [environment("Settings")]);
    const row = screen.container.querySelector("button")!;
    for (const error of [new Error("Settings"), "Open"]) {
      mocks.start.mockResolvedValueOnce({ _tag: "Failure", cause: Cause.fail(error) });
      await act(async () => row.click());
      expect(dialog().title).toBe(locale === "en" ? "Could not start the sign-in" : "无法开始登录");
      expect(dialog().message).toBe(error instanceof Error ? error.message : error);
      expect(row.textContent).toBe(`Open${locale === "en" ? "Sign in" : "登录"}`);
    }
    expect(mocks.wait).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
    mocks.start.mockResolvedValueOnce({ _tag: "Success", value: prompt("Open") });
    mocks.wait.mockResolvedValueOnce({ _tag: "Success", value: { account: "Settings" } });
    await act(async () => row.click());
    expect(dialog().title).toBe("Open");
    expect(mocks.copy).toHaveBeenCalledExactlyOnceWith("Open");
    expect(row.textContent).toBe(`Open${locale === "en" ? "Sign in" : "登录"}`);
  },
);

it.each(["en", "zh-CN"] as const)(
  "keeps signed-in app names and installation URLs literal while preserving the host credential map in %s",
  (locale) => {
    mocks.appSignIn.appName = "Open";
    const signIns = { "github.com": "redacted-primary", "Settings.example": "redacted-other" };
    using screen = mount(locale, [environment("Settings", signIns)]);
    const row = screen.container.querySelector("button")!;
    expect(screen.container.querySelector("span")?.textContent).toBe("Settings");
    expect(row.textContent).toBe(`Open${locale === "en" ? "Signed in" : "已登录"}`);
    act(() => row.click());
    expect(dialog().title).toBe("Open");
    expect(dialog().message).toBe(
      locale === "en"
        ? "Signed in. GitHub requests use the app's higher rate limit, in repositories where the app is installed."
        : "已登录。在已安装此应用的仓库中，GitHub 请求将使用该应用较高的速率限制。",
    );
    expect(dialog().buttons.map((button) => button.text)).toEqual(
      locale === "en"
        ? ["Install on an organization", "Sign out", "Cancel"]
        : ["在组织中安装", "退出登录", "取消"],
    );
    act(() => dialog().buttons[0]!.onPress?.());
    expect(mocks.openUrl).toHaveBeenCalledExactlyOnceWith(mocks.appSignIn.installUrl);
    act(() => dialog().buttons[1]!.onPress?.());
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      environmentId: "Settings",
      input: {
        patch: {
          sourceControlHosts: {
            github: {
              // HostCredentialSettings normalizes hostnames while preserving other credentials.
              signIns: { "github.com": "", "settings.example": "redacted-other" },
            },
          },
        },
      },
    });
    expect(mocks.start).not.toHaveBeenCalled();
  },
);

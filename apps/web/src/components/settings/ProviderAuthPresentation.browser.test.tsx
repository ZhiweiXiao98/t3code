import {
  EnvironmentId,
  ProviderInstanceId,
  ProviderDriverKind,
  providerAuthMessage,
  type ProviderAuthState,
  type ChatGptHandoffState,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { ProviderAuthenticationSection } from "./ProviderAuthenticationSection";
import type { ReactNode } from "react";
import type { GhosttyTerminalSurfaceOptions } from "../../terminal/ghostty/surface";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({
  auth: null as ProviderAuthState | null,
  handoff: null as ChatGptHandoffState | null,
  remote: false,
  start: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
  logout: vi.fn(),
  reconnect: vi.fn(),
  importProfile: vi.fn(),
  openExternal: vi.fn(),
  createSurface:
    vi.fn<(_element: HTMLElement, _options: GhosttyTerminalSurfaceOptions) => Promise<unknown>>(),
  write: vi.fn(),
  resetAndWrite: vi.fn(),
  dispose: vi.fn(),
  remove: Object.assign(vi.fn(), { permissionAtom: () => true }),
}));
vi.mock("@effect/atom-react", async (original) => ({
  ...(await original<typeof import("@effect/atom-react")>()),
  useAtomValue: (value: unknown) => value,
}));
vi.mock("../../state/server", () => ({
  EMPTY_SERVER_PROVIDERS: [],
  serverEnvironment: {
    providerAuthState: () => "auth",
    providerInstallState: () => "install",
    chatGptHandoffState: () => "handoff",
    providersValueAtom: () => [],
    startProviderAuth: fixture.start,
    cancelProviderAuth: fixture.cancel,
    completeProviderAuth: fixture.complete,
    logoutProviderAuth: fixture.logout,
    respondProviderAuth: fixture.complete,
    removeProviderAuthMethod: fixture.remove,
    refreshProviders: fixture.start,
    startProviderInstall: fixture.start,
    cancelProviderInstall: fixture.cancel,
    chatGptReconnectProfile: fixture.reconnect,
    chatGptImportProfile: fixture.importProfile,
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (atom: string | null) => ({
    data:
      atom === "auth"
        ? fixture.auth
        : atom === "handoff"
          ? fixture.handoff
          : atom === "install"
            ? { phase: "idle", installedVersion: "test", version: "test", source: "managed" }
            : null,
    error: null,
    failure: null,
    isPending: false,
    refresh: () => undefined,
  }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: (command: unknown) => command }));
vi.mock("../../state/managedPolicy", () => ({
  useManagedPolicy: () => undefined,
  managedInstanceLocks: () => undefined,
}));
vi.mock("../../state/session", () => ({
  useEnvironmentScope: () => true,
  useEnvironmentsWithScope: () => new Set(),
  readPreparedConnection: (id: string) => ({
    httpBaseUrl:
      fixture.remote && id !== "primary" ? "https://remote.example.test" : "http://localhost:3010",
  }),
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments: [] }),
  useEnvironmentHttpBaseUrl: () =>
    fixture.remote ? "https://remote.example.test" : "http://localhost:3010",
  usePrimaryEnvironmentId: () => null,
  usePrimaryEnvironment: () => null,
}));
vi.mock("../../state/entities", () => ({ useServerConfigs: () => new Map() }));
vi.mock("../../state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: "primary-atom" }));
vi.mock("../../state/presentation", () => ({
  environmentPresentations: { presentationAtom: () => "presentation" },
}));
vi.mock("../../rpc/atomRegistry", () => ({
  appAtomRegistry: {
    get: (atom: string) =>
      atom === "primary-atom"
        ? fixture.remote
          ? "primary"
          : null
        : { connection: { phase: "connected" } },
  },
}));
vi.mock("../../state/waitForQuerySettled", () => ({ waitForQuerySettled: async () => null }));
vi.mock("../../hooks/useSettings", () => ({
  usePrimarySettingsAvailable: () => true,
  PRIMARY_SETTINGS_UNAVAILABLE_MESSAGE: "Unavailable",
}));
vi.mock("./useScopedSettings", () => ({
  useClearScopedSettings: () => () => undefined,
  useClearProjectOverrides: () => () => undefined,
}));
// These auth rows have no project settings scope or favicon resource. Keep SettingsRow real,
// while its optional scope UI stays outside the mocked provider connection runtime.
vi.mock("./SettingsScopeContext", () => ({ useOptionalSettingsScope: () => null }));
vi.mock("../../state/assets", () => ({ projectFaviconUrlAtom: () => null }));
vi.mock("../../localApi", () => ({
  ensureLocalApi: () => ({ shell: { openExternal: fixture.openExternal } }),
}));
vi.mock("../../terminal/ghostty/surface", () => ({
  GhosttyTerminalSurface: { create: fixture.createSurface },
}));
vi.mock("../ThreadTerminalDrawer", () => ({ terminalThemeFromApp: () => ({}) }));

vi.mock("./ChatGptAccountPicker", () => ({ ChatGptAccountPicker: () => null }));
vi.mock("./AddCodexAccountDialog", () => ({ AddCodexAccountDialog: () => null }));

import ProviderAuthTerminal from "./ProviderAuthTerminal";
import { CodexSetupSection } from "./CodexSetupSection";
import { ProviderWizardAuthenticationStep } from "./ProviderWizardAuthenticationStep";

const environmentId = EnvironmentId.make("remote");
const instanceId = ProviderInstanceId.make("codex-test");
const provider: ServerProvider = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: true,
  status: "ready",
  auth: { status: "unauthenticated" },
  checkedAt: "2026-11-13T00:00:00Z",
  version: "test",
  models: [],
  skills: [],
  slashCommands: [],
  setup: { canAuthenticate: true, canInstall: true },
};
function setup() {
  vi.clearAllMocks();
  fixture.createSurface.mockReset();
  fixture.remote = false;
  fixture.handoff = null;
  fixture.auth = {
    instanceId,
    phase: "failed",
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    methods: [],
    ...providerAuthMessage("auth.expired"),
  };
  fixture.reconnect.mockResolvedValue({ _tag: "Success", value: null });
  fixture.cancel.mockResolvedValue({ _tag: "Success", value: fixture.auth });
}
function localized(locale: "en" | "zh-CN", children: ReactNode) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      {children}
    </WebI18nContext>
  );
}
function codex(presentation: "settings" | "onboarding" = "settings") {
  return (
    <CodexSetupSection
      environmentId={environmentId}
      instanceId={instanceId}
      provider={provider}
      mode="managed"
      enabled
      presentation={presentation}
      onModeChange={() => undefined}
    />
  );
}

it.each(["settings", "onboarding"] as const)(
  "renders Codex %s messages and sign-out warnings without changing auth on locale changes",
  async (presentation) => {
    setup();
    await using screen = await render(localized("en", codex(presentation)));
    await expect
      .element(screen.getByText("Sign-in expired. Start again.", { exact: true }))
      .toBeVisible();
    await screen.rerender(localized("zh-CN", codex(presentation)));
    await expect
      .element(screen.getByText("登录已过期。请重新开始。", { exact: true }))
      .toBeVisible();
    await screen.rerender(localized("en", codex(presentation)));
    await expect
      .element(screen.getByText("Sign-in expired. Start again.", { exact: true }))
      .toBeVisible();
    fixture.auth = { ...fixture.auth!, message: "Settings", messageDescriptor: undefined };
    await screen.rerender(localized("zh-CN", codex(presentation)));
    await expect.element(screen.getByText("Settings", { exact: true })).toBeVisible();
    fixture.auth = {
      ...fixture.auth!,
      phase: "idle",
      ...providerAuthMessage("chatgpt.localSignOutWarning"),
    };
    await screen.rerender(localized("zh-CN", codex(presentation)));
    await expect
      .element(
        screen.getByText(
          "已在本地退出登录，但无法确认远程访问权限已撤销。请在 ChatGPT 设置中断开此应用的连接。",
          { exact: true },
        ),
      )
      .toBeVisible();
    fixture.auth = { ...fixture.auth!, messageDescriptor: undefined };
    await screen.rerender(localized("zh-CN", codex(presentation)));
    await expect.element(screen.getByText(fixture.auth.message!, { exact: true })).toBeVisible();
    expect(fixture.start).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
    expect(fixture.cancel).not.toHaveBeenCalled();
    expect(fixture.logout).not.toHaveBeenCalled();
    expect(fixture.openExternal).not.toHaveBeenCalled();
  },
);

it("preserves a failed handoff descriptor after the handoff is closed and the locale changes", async () => {
  setup();
  fixture.remote = true;
  fixture.auth = { ...fixture.auth!, phase: "idle", message: null, messageDescriptor: undefined };
  fixture.handoff = {
    phase: "auth",
    state: { ...fixture.auth, phase: "failed", ...providerAuthMessage("auth.expired") },
  };
  await using screen = await render(localized("en", codex()));
  await userEvent.click(screen.getByRole("button", { name: "Continue with ChatGPT", exact: true }));
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Sign-in expired. Start again.");
  await screen.rerender(localized("zh-CN", codex()));
  await expect.element(screen.getByRole("alert")).toHaveTextContent("登录已过期。请重新开始。");
  await screen.rerender(localized("en", codex()));
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Sign-in expired. Start again.");
  expect(fixture.reconnect).toHaveBeenCalledTimes(1);
  expect(fixture.importProfile).not.toHaveBeenCalled();
  expect(fixture.start).not.toHaveBeenCalled();
  expect(fixture.openExternal).not.toHaveBeenCalled();
});

it("keeps wizard fallback messages literal through SettingsRow while translating tagged messages", async () => {
  setup();
  const finish = vi.fn();
  const wizard = () => (
    <ProviderWizardAuthenticationStep
      environmentId={environmentId}
      environmentLabel="Settings"
      instanceId={instanceId}
      onFinish={finish}
    />
  );
  await using screen = await render(localized("zh-CN", wizard()));
  await expect.element(screen.getByText("登录已过期。请重新开始。", { exact: true })).toBeVisible();
  for (const message of ["Settings", "Open", "Sign-in expired. Start again."]) {
    fixture.auth = { ...fixture.auth!, message, messageDescriptor: undefined };
    await screen.rerender(localized("zh-CN", wizard()));
    await expect.element(screen.getByText(message, { exact: true })).toBeVisible();
  }
  expect(fixture.start).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
});

it.each([
  ["link", "Could not open the provider link.", "无法打开提供商链接。"],
  [
    "terminal",
    "Could not load the sign-in terminal. Cancel and retry sign-in.",
    "无法加载登录终端。请取消后重试登录。",
  ],
] as const)(
  "renders cached %s terminal errors in the current locale without retrying",
  async (failure, english, chinese) => {
    setup();
    const output =
      "Settings/$&/{0} 中文\r\nCould not open the provider link.\u001b[31mraw\u001b[0m";
    const onResponse = vi.fn();
    fixture.createSurface.mockImplementation(() => new Promise(() => {}));
    if (failure === "terminal") {
      fixture.createSurface.mockRejectedValueOnce(new Error("opaque upstream failure"));
    } else {
      fixture.createSurface.mockResolvedValueOnce({
        write: fixture.write,
        resetAndWrite: fixture.resetAndWrite,
        dispose: fixture.dispose,
      });
      fixture.openExternal.mockRejectedValueOnce(new Error("opaque link failure"));
    }
    const surface = (locale: "en" | "zh-CN") =>
      localized(locale, <ProviderAuthTerminal output={output} onResponse={onResponse} />);
    await using screen = await render(surface("en"));
    if (failure === "link") {
      await vi.waitFor(() => expect(fixture.write).toHaveBeenCalledWith(output));
      const options = fixture.createSurface.mock.calls[0]?.[1];
      if (!options) throw new Error("Expected terminal creation options");
      await act(() =>
        options.onLinkActivate("https://example.test/opaque?x=$&", new MouseEvent("click")),
      );
    }
    await expect.element(screen.getByRole("alert")).toHaveTextContent(english);
    await screen.rerender(surface("zh-CN"));
    await expect.element(screen.getByRole("alert")).toHaveTextContent(chinese);
    await screen.rerender(surface("en"));
    await expect.element(screen.getByRole("alert")).toHaveTextContent(english);
    expect(fixture.createSurface).toHaveBeenCalledOnce();
    expect(fixture.dispose).not.toHaveBeenCalled();
    expect(fixture.resetAndWrite).not.toHaveBeenCalled();
    expect(onResponse).not.toHaveBeenCalled();
    if (failure === "link") {
      expect(fixture.write).toHaveBeenCalledExactlyOnceWith(output);
      expect(fixture.openExternal).toHaveBeenCalledExactlyOnceWith(
        "https://example.test/opaque?x=$&",
      );
    } else {
      expect(fixture.write).not.toHaveBeenCalled();
      expect(fixture.openExternal).not.toHaveBeenCalled();
    }
    await screen.unmount();
    expect(fixture.dispose).toHaveBeenCalledTimes(failure === "link" ? 1 : 0);
  },
);

it.each(["provider", "settings", "onboarding"] as const)(
  "keeps owned %s command fallback current and raw collisions literal",
  async (presentation) => {
    for (const raw of [false, true]) {
      setup();
      fixture.auth = {
        ...fixture.auth!,
        phase: "idle",
        message: null,
        messageDescriptor: undefined,
      };
      const english =
        presentation === "provider"
          ? "Provider sign-in failed. Try again."
          : "Codex setup failed. Try again.";
      fixture.start.mockReset().mockResolvedValueOnce({
        _tag: "Failure",
        cause: Cause.fail(raw ? new Error(english) : "opaque private failure"),
      });
      const surface = () =>
        presentation === "provider" ? (
          <ProviderAuthenticationSection
            environmentId={environmentId}
            environmentLabel="Opaque $& {0}"
            instanceId={instanceId}
            provider={provider}
            readOnly={false}
          />
        ) : (
          codex(presentation)
        );
      await using screen = await render(localized("en", surface()));
      await screen
        .getByRole("button", {
          name: presentation === "provider" ? "Sign in" : "Continue with ChatGPT",
          exact: true,
        })
        .click();
      const alert = screen.getByRole("alert");
      await expect.element(alert).toHaveTextContent(english);
      await screen.rerender(localized("zh-CN", surface()));
      await expect
        .element(alert)
        .toHaveTextContent(
          raw
            ? english
            : presentation === "provider"
              ? "提供商登录失败。请重试。"
              : "Codex 设置失败。请重试。",
        );
      await screen.rerender(localized("en", surface()));
      await expect.element(alert).toHaveTextContent(english);
      expect(fixture.start).toHaveBeenCalledOnce();
      expect(fixture.openExternal).not.toHaveBeenCalled();
      expect(screen.container.textContent).not.toContain("opaque private failure");
    }
  },
);

it.each(["failure", "rejection"] as const)(
  "localizes owned terminal input %s without retrying or changing output",
  async (kind) => {
    setup();
    const output = "opaque output $& {0} 中文";
    fixture.auth = {
      ...fixture.auth!,
      phase: "waiting",
      flowId: "flow",
      message: null,
      messageDescriptor: undefined,
      interaction: { id: "terminal", type: "terminal", output, outputOffset: output.length },
    };
    fixture.createSurface.mockResolvedValueOnce({
      write: fixture.write,
      resetAndWrite: fixture.resetAndWrite,
      dispose: fixture.dispose,
    });
    fixture.complete.mockReset();
    if (kind === "failure")
      fixture.complete.mockResolvedValueOnce({
        _tag: "Failure",
        cause: Cause.fail("private detail"),
      });
    else fixture.complete.mockRejectedValueOnce(new Error("private detail"));
    const surface = () => (
      <ProviderAuthenticationSection
        environmentId={environmentId}
        environmentLabel="Remote"
        instanceId={instanceId}
        provider={provider}
        readOnly={false}
      />
    );
    await using screen = await render(localized("en", surface()));
    await expect.poll(() => fixture.write.mock.calls.length).toBe(1);
    await act(async () => fixture.createSurface.mock.calls[0]![1].onData?.("opaque input"));
    const english =
      kind === "failure"
        ? "The provider sign-in terminal is no longer available."
        : "Could not send input to the provider sign-in terminal.";
    const chinese =
      kind === "failure" ? "提供商登录终端已不可用。" : "无法向提供商登录终端发送输入。";
    const alert = screen.getByRole("alert");
    await expect.element(alert).toHaveTextContent(english);
    await screen.rerender(localized("zh-CN", surface()));
    await expect.element(alert).toHaveTextContent(chinese);
    await screen.rerender(localized("en", surface()));
    await expect.element(alert).toHaveTextContent(english);
    expect(fixture.complete).toHaveBeenCalledOnce();
    expect(fixture.write).toHaveBeenCalledExactlyOnceWith(output);
    expect(fixture.createSurface).toHaveBeenCalledOnce();
    expect(fixture.resetAndWrite).not.toHaveBeenCalled();
    expect(screen.container.textContent).not.toContain("private detail");
  },
);

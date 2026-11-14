import "~/index.css";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render, stubGlobal } from "../../../test/render";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";

const mocks = vi.hoisted(() => ({
  connectSshEnvironment: vi.fn<() => Promise<AtomCommandResult<void, Error>>>(async () =>
    AsyncResult.success(undefined),
  ),
  connectPairing: vi.fn<() => Promise<AtomCommandResult<void, Error>>>(),
  refresh: () => {},
  register: vi.fn(),
  setEnabled: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  environments: [] as EnvironmentPresentation[],
  relay: new Map<EnvironmentId, Discovery.RelayDiscoveredEnvironment>(),
  toast: vi.fn(),
}));

vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: unknown) => command) as never,
}));
vi.mock(import("~/connection/onboarding"), async (original) => ({
  ...(await original()),
  connectSshEnvironment: mocks.connectSshEnvironment as never,
  connectPairing: mocks.connectPairing as never,
}));
vi.mock(import("~/state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({
    data: [],
    isPending: false,
    error: null,
    refresh: mocks.refresh,
  })) as never,
}));
vi.mock(import("~/state/environments"), async (original) => ({
  ...(await original()),
  useRelayEnvironmentDiscovery: () => ({
    environments: mocks.relay,
    listed: true,
    refreshing: false,
    offline: false,
    error: Option.none(),
  }),
  useEnvironments: () => ({
    environments: mocks.environments,
    isReady: true,
    networkStatus: "online" as const,
    presentationById: new Map(),
  }),
  usePrimaryEnvironment: () => null,
  useEnvironment: () => null,
}));
vi.mock(import("~/state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const updates = Atom.make([{ status: "idle" } as const]);
  const update = Atom.make({ status: "idle" } as const);
  return {
    ...actual,
    primaryServerKeybindingsAtom: Atom.make([]),
    environmentUpdateStatesAtom: () => updates,
    serverEnvironment: { ...actual.serverEnvironment, updateStateAtom: () => update },
  };
});

import { AddEnvironmentDialog } from "./AddEnvironmentDialog";

function Owner({
  locale = "en",
  routeTarget = null,
}: {
  locale?: "en" | "zh-CN";
  routeTarget?: EnvironmentPresentation | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<SavedBackendError | null>(null);
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <AppAtomRegistryProvider>
        <AddEnvironmentDialog
          open={open}
          routeTarget={routeTarget}
          error={error}
          savedEnvironments={[]}
          onOpenChange={setOpen}
          onErrorChange={setError}
        />
      </AppAtomRegistryProvider>
    </WebI18nContext>
  );
}

function setup() {
  mocks.connectSshEnvironment.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  mocks.connectPairing.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  mocks.environments = [];
  mocks.relay.clear();
  mocks.toast.mockReset();
  mocks.register.mockReset();
  mocks.setEnabled.mockReset();
  mocks.remove.mockReset();
  mocks.confirm.mockReset().mockResolvedValue(true);
  return stubGlobal("desktopBridge", {});
}

const remoteCard = () => page.getByRole("button", { name: /Remote link/ });
const sshCard = () => page.getByRole("button", { name: /^SSH/ });

async function openDialogOnSsh() {
  await userEvent.click(page.getByRole("button", { name: "Add environment" }));
  await userEvent.click(sshCard());
  await expect.element(sshCard()).toHaveAttribute("aria-pressed", "true");
}

async function expectDefaultModeAfterReopen() {
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(page.getByRole("button", { name: "Add environment" }));
  await expect.element(remoteCard()).toHaveAttribute("aria-pressed", "true");
  await expect.element(sshCard()).toHaveAttribute("aria-pressed", "false");
  await expect.element(page.getByPlaceholder("backend.example.com")).toBeInTheDocument();
}

describe("AddEnvironmentDialog", () => {
  it("reopens on Remote link after adding an SSH environment", async () => {
    using _bridge = setup();
    await using _screen = await render(<Owner />);

    await openDialogOnSsh();
    await userEvent.type(page.getByPlaceholder("Search hosts or type devbox"), "devbox");
    await userEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Add environment" }),
    );
    expect(mocks.connectSshEnvironment).toHaveBeenCalledOnce();

    await expectDefaultModeAfterReopen();
  });

  it("clears the form after dismissing it on SSH", async () => {
    using _bridge = setup();
    await using _screen = await render(<Owner />);

    await openDialogOnSsh();
    await userEvent.click(remoteCard());
    await userEvent.type(page.getByPlaceholder("backend.example.com"), "devbox.example.com");
    await userEvent.type(page.getByPlaceholder("PAIRCODE"), "PAIRCODE");
    await userEvent.click(sshCard());
    await userEvent.type(page.getByPlaceholder("Search hosts or type devbox"), "devbox");
    await userEvent.type(page.getByPlaceholder("root"), "maria");
    await userEvent.type(page.getByPlaceholder("22"), "2222");
    await userEvent.keyboard("{Escape}");

    await expectDefaultModeAfterReopen();
    await expect.element(page.getByPlaceholder("backend.example.com")).toHaveValue("");
    await expect.element(page.getByPlaceholder("PAIRCODE")).toHaveValue("");
    await userEvent.click(sshCard());
    await expect.element(page.getByPlaceholder("Search hosts or type devbox")).toHaveValue("");
    await expect.element(page.getByPlaceholder("root")).toHaveValue("");
    await expect.element(page.getByPlaceholder("22")).toHaveValue("");

    let finishConnection!: (result: AtomCommandResult<void, Error>) => void;
    const pending = new Promise<AtomCommandResult<void, Error>>((resolve) => {
      finishConnection = resolve;
    });
    mocks.connectSshEnvironment.mockImplementationOnce(() => pending);
    await userEvent.type(page.getByPlaceholder("Search hosts or type devbox"), "devbox");
    await userEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Add environment" }),
    );
    await userEvent.keyboard("{Escape}");
    await expectDefaultModeAfterReopen();
    finishConnection(AsyncResult.failure(Cause.fail(new Error("dismissed SSH attempt"))));
    await expect
      .element(page.getByRole("dialog").getByRole("button", { name: "Add environment" }))
      .toBeEnabled();
    await expect.element(page.getByText(/dismissed SSH attempt/)).not.toBeInTheDocument();
  });
});

import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import type { SavedBackendError } from "./ConnectionsSettings.logic";

it.each(["ssh-validation", "ssh-fallback", "ssh-raw", "pairing-validation"] as const)(
  "keeps cached %s current without resubmission",
  async (kind) => {
    using _bridge = setup();
    if (kind === "ssh-fallback")
      mocks.connectSshEnvironment.mockResolvedValueOnce(AsyncResult.failure(Cause.die(null)));
    if (kind === "ssh-raw")
      mocks.connectSshEnvironment.mockResolvedValueOnce(
        AsyncResult.failure(Cause.fail(new Error("Failed to connect SSH host."))),
      );
    await using screen = await render(<Owner locale="en" />);
    if (kind === "pairing-validation")
      await page.getByRole("button", { name: "Add environment", exact: true }).click();
    else await openDialogOnSsh();
    if (kind === "ssh-fallback" || kind === "ssh-raw")
      await userEvent.type(page.getByPlaceholder("Search hosts or type devbox"), "opaque-host");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add environment", exact: true })
      .click();
    const english =
      kind === "ssh-validation"
        ? "SSH host or alias is required."
        : kind === "pairing-validation"
          ? "Enter a backend host."
          : "Failed to connect SSH host.";
    const chinese =
      kind === "ssh-validation"
        ? "请输入 SSH 主机或别名。"
        : kind === "pairing-validation"
          ? "请输入后端主机。"
          : kind === "ssh-raw"
            ? english
            : "连接 SSH 主机失败。";
    await expect.element(page.getByText(english, { exact: true })).toBeVisible();
    const notice = page.getByText(english, { exact: true }).element();
    await screen.rerender(<Owner locale="zh-CN" />);
    await expect.poll(() => notice.textContent).toBe(chinese);
    await screen.rerender(<Owner locale="en" />);
    await expect.poll(() => notice.textContent).toBe(english);
    expect(mocks.connectSshEnvironment).toHaveBeenCalledTimes(
      kind === "ssh-fallback" || kind === "ssh-raw" ? 1 : 0,
    );
    if (kind === "ssh-fallback" || kind === "ssh-raw")
      await expect
        .element(page.getByPlaceholder("Search hosts or type devbox"))
        .toHaveValue("opaque-host");
  },
);

import type { Discovery } from "@t3tools/client-runtime/relay";
import { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentPresentation } from "~/state/environments";
import { BearerConnectionTarget } from "@t3tools/client-runtime/connection";
import * as Option from "effect/Option";
import { ConnectionsSettings } from "./ConnectionsSettings";

vi.mock("~/connection/catalog", async (original) => {
  const actual = await original<typeof import("~/connection/catalog")>();
  return {
    ...actual,
    environmentCatalog: {
      ...actual.environmentCatalog,
      register: mocks.register,
      setEnabled: mocks.setEnabled,
      remove: mocks.remove,
    },
  };
});
vi.mock("~/state/session", async (original) => ({
  ...(await original<typeof import("~/state/session")>()),
  useEnvironmentSessionState: () => ({ data: null }),
  useEnvironmentScope: () => false,
}));
vi.mock("~/state/peerLinks", async (original) => ({
  ...(await original<typeof import("~/state/peerLinks")>()),
  usePeerLinkHosts: () => [],
}));
vi.mock("~/confirmDialog", async (original) => ({
  ...(await original<typeof import("~/confirmDialog")>()),
  requestConfirmDialog: mocks.confirm,
}));
vi.mock("./LoadBalancingSettings", () => ({ LoadBalancingSettings: () => null }));
vi.mock("./PullRequestRoutingSettings", () => ({ PullRequestRoutingSettings: () => null }));
vi.mock("./SavedEnvironmentRows", () => ({
  CloudLinkRow: () => null,
  CloudRemoteEnvironmentRows: () => null,
  SavedBackendListRow: ({
    environment,
    onSetEnabled,
    onRemove,
  }: {
    environment: EnvironmentPresentation;
    onSetEnabled: (id: EnvironmentId, enabled: boolean) => void;
    onRemove: (environment: EnvironmentPresentation) => void;
  }) => (
    <>
      <button onClick={() => onSetEnabled(environment.environmentId, true)}>Enable fixture</button>
      <button onClick={() => onSetEnabled(environment.environmentId, false)}>
        Disable fixture
      </button>
      <button onClick={() => onRemove(environment)}>Remove fixture</button>
    </>
  ),
}));

function savedEnvironment(): EnvironmentPresentation {
  const environmentId = EnvironmentId.make("saved-locale-test");
  return {
    environmentId,
    label: "Literal $& {name}",
    displayUrl: null,
    relayManaged: false,
    entry: {
      target: new BearerConnectionTarget({
        environmentId,
        label: "Literal $& {name}",
        connectionId: "literal",
      }),
      profile: Option.none(),
      alternateRoutes: [],
      enabled: true,
    },
    connection: { phase: "available", error: null, traceId: null },
    serverConfig: null,
  };
}

it.each([false, true])(
  "renders cached relay-route fallback raw=%s without registering twice",
  async (raw) => {
    using _bridge = setup();
    const target = savedEnvironment();
    mocks.relay.set(target.environmentId, {
      environment: {
        environmentId: target.environmentId,
        label: target.label,
        linkedAt: "2026-11-14T00:00:00Z",
        endpoint: {
          httpBaseUrl: "https://example.test",
          wsBaseUrl: "wss://example.test",
          providerKind: "manual",
        },
      },
      availability: "online",
      status: Option.none(),
      error: Option.none(),
    });
    mocks.register.mockResolvedValueOnce(
      AsyncResult.failure(Cause.die(raw ? new Error("Could not add the route.") : null)),
    );
    await using screen = await render(<Owner locale="en" routeTarget={target} />);
    await page.getByRole("button", { name: "Add environment", exact: true }).click();
    await page.getByRole("button", { name: "Add T3 Connect", exact: true }).click();
    const english = "Could not add the route.";
    await expect.element(page.getByText(english, { exact: true })).toBeVisible();
    const notice = page.getByText(english, { exact: true }).element();
    await screen.rerender(<Owner locale="zh-CN" routeTarget={target} />);
    await expect.poll(() => notice.textContent).toBe(raw ? english : "无法添加路由。");
    await screen.rerender(<Owner locale="en" routeTarget={target} />);
    await expect.poll(() => notice.textContent).toBe(english);
    expect(mocks.register).toHaveBeenCalledOnce();
    expect(mocks.connectSshEnvironment).not.toHaveBeenCalled();
  },
);

it.each(["enable", "disable", "remove"] as const)(
  "keeps the main %s failure current in its shared dialog state",
  async (operation) => {
    using _setup = setup();
    using _bridge = stubGlobal("desktopBridge", undefined);
    const target = savedEnvironment();
    mocks.environments = [target];
    let failEnabled!: (result: AtomCommandResult<void, Error>) => void;
    const pending = new Promise<AtomCommandResult<void, Error>>((resolve) => {
      failEnabled = resolve;
    });
    mocks.setEnabled.mockResolvedValue(AsyncResult.failure(Cause.die(null)));
    if (operation === "enable") mocks.setEnabled.mockReturnValue(pending);
    mocks.remove.mockResolvedValue(AsyncResult.failure(Cause.die(null)));
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
          <ConnectionsSettings view="environments" />
        </AppAtomRegistryProvider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await screen
      .getByRole("button", { name: `${operation[0]!.toUpperCase()}${operation.slice(1)} fixture` })
      .click();
    const command = operation === "remove" ? mocks.remove : mocks.setEnabled;
    await expect.poll(() => command.mock.calls.length).toBe(1);
    if (operation === "enable") {
      await screen.rerender(surface("zh-CN"));
      failEnabled(AsyncResult.failure(Cause.die(null)));
      await expect
        .poll(() => mocks.toast.mock.calls.at(-1)?.[0])
        .toMatchObject({ title: "无法开启后端", description: "开启后端失败。" });
      await screen.rerender(surface("en"));
    }
    await page.getByRole("button", { name: "Add environment", exact: true }).click();
    const english =
      operation === "remove"
        ? "Failed to remove backend."
        : `Failed to switch the backend ${operation === "enable" ? "on" : "off"}.`;
    const chinese =
      operation === "remove"
        ? "移除后端失败。"
        : operation === "enable"
          ? "开启后端失败。"
          : "关闭后端失败。";
    await expect.element(page.getByText(english, { exact: true })).toBeVisible();
    const notice = page.getByText(english, { exact: true }).element();
    await screen.rerender(surface("zh-CN"));
    await expect.poll(() => notice.textContent).toBe(chinese);
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.textContent).toBe(english);
    expect(command).toHaveBeenCalledOnce();
    if (operation === "remove") {
      expect(mocks.confirm).toHaveBeenCalledOnce();
      expect(mocks.remove).toHaveBeenCalledWith(target.environmentId);
      expect(mocks.setEnabled).not.toHaveBeenCalled();
    } else {
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.setEnabled).toHaveBeenCalledWith({
        environmentId: target.environmentId,
        enabled: operation === "enable",
      });
    }
  },
);

vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: mocks.toast },
}));

it.each([false, true])(
  "keeps a cached pairing failure raw=%s without reconnecting or exposing its code",
  async (raw) => {
    using _bridge = setup();
    mocks.connectPairing.mockResolvedValueOnce(
      AsyncResult.failure(Cause.die(raw ? new Error("Failed to add backend.") : null)),
    );
    await using screen = await render(<Owner locale="en" />);
    await page.getByRole("button", { name: "Add environment", exact: true }).click();
    await userEvent.type(page.getByPlaceholder("backend.example.com"), "opaque.example.test");
    await userEvent.type(page.getByPlaceholder("PAIRCODE"), "literal-private-code");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add environment", exact: true })
      .click();
    const english = "Failed to add backend.";
    await expect.element(page.getByText(english, { exact: true })).toBeVisible();
    const notice = page.getByText(english, { exact: true }).element();
    await screen.rerender(<Owner locale="zh-CN" />);
    await expect.poll(() => notice.textContent).toBe(raw ? english : "添加后端失败。");
    await screen.rerender(<Owner locale="en" />);
    await expect.poll(() => notice.textContent).toBe(english);
    expect(mocks.connectPairing).toHaveBeenCalledExactlyOnceWith({
      host: "opaque.example.test",
      pairingCode: "literal-private-code",
    });
    expect(mocks.connectSshEnvironment).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("literal-private-code");
    await expect
      .element(page.getByPlaceholder("backend.example.com"))
      .toHaveValue("opaque.example.test");
  },
);

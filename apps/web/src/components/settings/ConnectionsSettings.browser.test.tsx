import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import {
  EnvironmentId,
  AuthEnvironmentMaintainScope,
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthSessionId,
  type AuthAccessStreamSnapshotEvent,
  type DesktopServerExposureState,
  type DesktopWslState,
} from "@t3tools/contracts";
import { PrimaryConnectionTarget } from "@t3tools/client-runtime/connection";
import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";
import * as Option from "effect/Option";
import { render, stubGlobal } from "../../../test/render";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import type { EnvironmentPresentation } from "../../state/environments";
import type { DesktopNetworkAccessSnapshot } from "../../state/desktopNetworkAccess";

const fixture = vi.hoisted(() => ({
  wsl: null as DesktopWslState | null,
  wslError: null as string | null,
  maintainAtCall: true,
  wslOnly: vi.fn(),
  wslEnabled: vi.fn(),
  wslDistro: vi.fn(),
  refreshWsl: vi.fn(),
  primary: null as EnvironmentPresentation | null,
  network: null as DesktopNetworkAccessSnapshot | null,
  queryError: null as string | null,
  permitted: true,
  access: false,
  writeAtCall: true,
  accessError: null as string | null,
  snapshot: null as AuthAccessStreamSnapshotEvent | null,
  revokePairing: vi.fn(),
  revokeClient: vi.fn(),
  revokeOthers: vi.fn(),
  exposure: vi.fn(),
  tailscale: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../../state/environments", async (original) => ({
  ...(await original<typeof import("../../state/environments")>()),
  useEnvironments: () => ({
    environments: fixture.primary ? [fixture.primary] : [],
    isReady: true,
    networkStatus: "online",
    presentationById: new Map(),
  }),
  usePrimaryEnvironment: () => fixture.primary,
  usePrimaryEnvironmentId: () => fixture.primary?.environmentId ?? null,
  useEnvironment: () => fixture.primary,
}));
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  useEnvironmentSessionState: () => ({ data: null }),
  useEnvironmentScope: (_id: unknown, scope: string) =>
    fixture.access
      ? scope === AuthAccessReadScope || scope === AuthAccessWriteScope
      : scope === AuthEnvironmentMaintainScope && fixture.permitted,
  readEnvironmentScope: (_id: unknown, scope: string) =>
    fixture.access
      ? scope === AuthAccessReadScope || (scope === AuthAccessWriteScope && fixture.writeAtCall)
      : scope === AuthEnvironmentMaintainScope && fixture.permitted && fixture.maintainAtCall,
}));
vi.mock("../../state/peerLinks", async (original) => ({
  ...(await original<typeof import("../../state/peerLinks")>()),
  usePeerLinkHosts: () => [],
}));
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: (command: unknown) => command,
}));
vi.mock("../../state/desktopNetworkAccess", async (original) => {
  const { Atom } = await import("effect/reactivity");
  return {
    ...(await original<typeof import("../../state/desktopNetworkAccess")>()),
    desktopNetworkAccessStateAtom: Atom.make(null),
    refreshDesktopNetworkAccessState: fixture.refresh,
  };
});
vi.mock("../../state/desktopWslState", async (original) => {
  const { Atom } = await import("effect/reactivity");
  return {
    ...(await original<typeof import("../../state/desktopWslState")>()),
    desktopWslStateAtom: Atom.make(null),
    refreshDesktopWslState: fixture.refreshWsl,
  };
});
import { desktopWslStateAtom } from "../../state/desktopWslState";
vi.mock("../../state/query", async (original) => ({
  ...(await original<typeof import("../../state/query")>()),
  useEnvironmentQuery: (query: unknown) => ({
    data:
      query === desktopWslStateAtom
        ? fixture.wsl
        : query === desktopNetworkAccessStateAtom
          ? fixture.network
          : query ===
              authEnvironment.accessChanges({
                environmentId: fixture.primary!.environmentId,
                input: null,
              })
            ? fixture.snapshot
            : null,
    error:
      query === desktopWslStateAtom
        ? fixture.wslError
        : query === desktopNetworkAccessStateAtom
          ? fixture.queryError
          : query ===
              authEnvironment.accessChanges({
                environmentId: fixture.primary!.environmentId,
                input: null,
              })
            ? fixture.accessError
            : null,
    isPending: false,
    refresh: fixture.refresh,
  }),
}));
vi.mock("../../state/server", async (original) => {
  const actual = await original<typeof import("../../state/server")>();
  const { Atom } = await import("effect/reactivity");
  const idle = Atom.make({ status: "idle" });
  const updates = Atom.make([]);
  return {
    ...actual,
    serverEnvironment: { ...actual.serverEnvironment, updateStateAtom: () => idle },
    environmentUpdateStatesAtom: () => updates,
  };
});
vi.mock("./SessionPermissions", () => ({ SessionPermissions: () => null }));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: fixture.toast },
}));
import { desktopNetworkAccessStateAtom } from "../../state/desktopNetworkAccess";
import { ConnectionsSettings } from "./ConnectionsSettings";

function setup(operation: "exposure" | "tailscaleEnable" | "tailscaleDisable") {
  const environmentId = EnvironmentId.make("network-locale-fixture");
  fixture.primary = {
    environmentId,
    label: "Literal $& {machine}",
    displayUrl: null,
    relayManaged: false,
    entry: {
      target: new PrimaryConnectionTarget({
        environmentId,
        label: "Literal $& {machine}",
        httpBaseUrl: "http://127.0.0.1:3773",
        wsBaseUrl: "ws://127.0.0.1:3773",
      }),
      profile: Option.none(),
      alternateRoutes: [],
      enabled: true,
    },
    connection: { phase: "available", error: null, traceId: null },
    serverConfig: null,
  };
  fixture.network = {
    serverExposureState: {
      mode: "local-only",
      endpointUrl: null,
      advertisedHost: null,
      tailscaleServeEnabled: operation === "tailscaleDisable",
      tailscaleServePort: 443,
    },
    advertisedEndpoints:
      operation === "exposure"
        ? []
        : [
            createAdvertisedEndpoint({
              id: "tailscale-magicdns:fixture",
              label: "Fixture HTTPS",
              provider: {
                id: "tailscale",
                label: "Tailscale",
                kind: "private-network",
                isAddon: false,
              },
              source: "desktop-core",
              httpBaseUrl: "https://fixture.example.test",
              reachability: "private-network",
              status: operation === "tailscaleDisable" ? "available" : "unavailable",
            }),
          ],
  };
  fixture.wsl = null;
  fixture.wslError = null;
  fixture.maintainAtCall = true;
  fixture.refreshWsl.mockReset();
  fixture.queryError = null;
  fixture.access = false;
  fixture.writeAtCall = true;
  fixture.accessError = null;
  fixture.snapshot = null;
  fixture.revokePairing.mockReset();
  fixture.revokeClient.mockReset();
  fixture.revokeOthers.mockReset();
  fixture.permitted = true;
  fixture.exposure.mockReset();
  fixture.tailscale.mockReset();
  fixture.refresh.mockReset();
  fixture.toast.mockReset();
  return stubGlobal("desktopBridge", {
    getLocalEnvironmentEnabled: () => true,
    setServerExposureMode: fixture.exposure,
    setTailscaleServeEnabled: fixture.tailscale,
  });
}
function surface(locale: "en" | "zh-CN") {
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
        <ConnectionsSettings view="access" />
      </AppAtomRegistryProvider>
    </WebI18nContext>
  );
}

it.each(["exposure", "tailscaleEnable", "tailscaleDisable"] as const)(
  "keeps cached owned %s failure current after one confirmed operation",
  async (operation) => {
    using _bridge = setup(operation);
    let reject!: (error: unknown) => void;
    const pending = new Promise<DesktopServerExposureState>((_resolve, fail) => {
      reject = fail;
    });
    const command = operation === "exposure" ? fixture.exposure : fixture.tailscale;
    command.mockReturnValue(pending);
    await using screen = await render(surface("en"));
    await page
      .getByRole("switch", {
        name: operation === "exposure" ? "Enable network access" : "Enable Tailscale HTTPS",
        exact: true,
      })
      .click();
    expect(command).not.toHaveBeenCalled();
    await page
      .getByRole("button", {
        name:
          operation === "exposure"
            ? "Restart and enable"
            : operation === "tailscaleEnable"
              ? "Enable"
              : "Restart and disable",
        exact: true,
      })
      .click();
    expect(command).toHaveBeenCalledOnce();
    await screen.rerender(surface("zh-CN"));
    reject(null);
    const english =
      operation === "exposure"
        ? "Failed to update network exposure."
        : operation === "tailscaleEnable"
          ? "Failed to configure Tailscale HTTPS."
          : "Failed to disable Tailscale HTTPS.";
    const chinese =
      operation === "exposure"
        ? "更新网络访问设置失败。"
        : operation === "tailscaleEnable"
          ? "配置 Tailscale HTTPS 失败。"
          : "停用 Tailscale HTTPS 失败。";
    const title =
      operation === "exposure"
        ? "无法更新网络访问权限"
        : operation === "tailscaleEnable"
          ? "无法设置 Tailscale HTTPS"
          : "无法禁用 Tailscale HTTPS";
    await expect
      .poll(() => fixture.toast.mock.calls.at(-1)?.[0])
      .toMatchObject({ title, description: chinese });
    if (operation !== "exposure")
      await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect.element(page.getByText(chinese, { exact: true })).toBeVisible();
    const notice = page.getByText(chinese, { exact: true }).element();
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.textContent).toBe(english);
    await screen.rerender(surface("zh-CN"));
    await expect.poll(() => notice.textContent).toBe(chinese);
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.textContent).toBe(english);
    expect(command).toHaveBeenCalledExactlyOnceWith(
      operation === "exposure"
        ? "network-accessible"
        : { enabled: operation === "tailscaleEnable", port: 443 },
    );
    expect(fixture.refresh).not.toHaveBeenCalled();
  },
);

it.each(["mutation", "query"] as const)(
  "keeps raw %s network text collision literal",
  async (source) => {
    using _bridge = setup("exposure");
    const english = "Failed to update network exposure.";
    if (source === "query") fixture.queryError = english;
    else fixture.exposure.mockRejectedValue(new Error(english));
    await using screen = await render(surface("en"));
    if (source === "mutation") {
      await page.getByRole("switch", { name: "Enable network access", exact: true }).click();
      await page.getByRole("button", { name: "Restart and enable", exact: true }).click();
    }
    await expect.element(page.getByText(english, { exact: true })).toBeVisible();
    const notice = page.getByText(english, { exact: true }).element();
    await screen.rerender(surface("zh-CN"));
    await expect.poll(() => notice.textContent).toBe(english);
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.textContent).toBe(english);
    expect(fixture.exposure).toHaveBeenCalledTimes(source === "mutation" ? 1 : 0);
    expect(fixture.tailscale).not.toHaveBeenCalled();
    expect(fixture.refresh).not.toHaveBeenCalled();
  },
);

it.each(["exposure", "tailscaleEnable", "tailscaleDisable"] as const)(
  "cancels %s confirmation without changing network settings",
  async (operation) => {
    using _bridge = setup(operation);
    await using _screen = await render(surface("en"));
    await page
      .getByRole("switch", {
        name: operation === "exposure" ? "Enable network access" : "Enable Tailscale HTTPS",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(fixture.exposure).not.toHaveBeenCalled();
    expect(fixture.tailscale).not.toHaveBeenCalled();
    expect(fixture.refresh).not.toHaveBeenCalled();
  },
);

import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { authEnvironment } from "../../state/auth";
vi.mock("../../state/auth", async (original) => {
  const actual = await original<typeof import("../../state/auth")>();
  const { Atom } = await import("effect/reactivity");
  const access = Atom.make(null);
  return {
    ...actual,
    authEnvironment: {
      ...actual.authEnvironment,
      accessChanges: () => access,
      revokePairingLink: fixture.revokePairing,
      revokeClient: fixture.revokeClient,
      revokeOtherClients: fixture.revokeOthers,
    },
  };
});
vi.mock("../../state/managedPolicy", async (original) => ({
  ...(await original<typeof import("../../state/managedPolicy")>()),
  useManagedPolicy: () => null,
  usePrimaryManagedPolicy: () => null,
}));

function setupAccess(target: "pairing" | "client" | "others") {
  const stack = new DisposableStack();
  stack.use(setup("exposure"));
  stack.use(stubGlobal("desktopBridge", undefined));
  fixture.access = true;
  const created = DateTime.makeUnsafe("2026-01-01T00:00:00Z");
  const expires = DateTime.makeUnsafe("2100-01-01T00:00:00Z");
  fixture.snapshot = {
    version: 1,
    revision: 1,
    type: "snapshot",
    payload: {
      pairingLinks:
        target === "pairing"
          ? [
              {
                id: "literal-pairing",
                subject: "literal/$&/{subject}",
                label: "Fixture link",
                scopes: [],
                createdAt: created,
                expiresAt: expires,
              },
            ]
          : [],
      clientSessions:
        target === "pairing"
          ? []
          : [
              {
                sessionId: AuthSessionId.make("literal-session"),
                subject: "literal/$&/{subject}",
                scopes: [],
                method: "bearer-access-token",
                client: { deviceType: "unknown", label: "Fixture client" },
                issuedAt: created,
                expiresAt: expires,
                lastConnectedAt: null,
                connected: false,
                current: false,
              },
            ],
    },
  };
  return stack;
}

it.each(["pairing", "client", "others"] as const)(
  "keeps cached owned %s revocation failure current without another command",
  async (target) => {
    using _fixture = setupAccess(target);
    let finish!: (result: AtomCommandResult<void, Error>) => void;
    const pending = new Promise<AtomCommandResult<void, Error>>((resolve) => {
      finish = resolve;
    });
    const command =
      target === "pairing"
        ? fixture.revokePairing
        : target === "client"
          ? fixture.revokeClient
          : fixture.revokeOthers;
    command.mockReturnValue(pending);
    await using screen = await render(surface("en"));
    await page.getByRole("button", { name: /Authorized clients/ }).click();
    await page
      .getByRole("button", { name: target === "others" ? "Revoke others" : "Revoke", exact: true })
      .click();
    expect(command).toHaveBeenCalledOnce();
    await screen.rerender(surface("zh-CN"));
    finish(AsyncResult.failure(Cause.die(null)));
    const english =
      target === "pairing"
        ? "Failed to revoke pairing link."
        : target === "client"
          ? "Failed to revoke client access."
          : "Failed to revoke other clients.";
    const chinese =
      target === "pairing"
        ? "撤销配对链接失败。"
        : target === "client"
          ? "撤销客户端访问权限失败。"
          : "撤销其他客户端失败。";
    await expect
      .poll(() => fixture.toast.mock.calls.at(-1)?.[0])
      .toMatchObject({
        description: chinese,
        title:
          target === "pairing"
            ? "无法撤销配对链接"
            : target === "client"
              ? "无法撤销客户端访问权限"
              : "无法撤销其他客户端的访问权限",
      });
    await expect.element(page.getByText(chinese, { exact: true })).toBeVisible();
    const notice = page.getByText(chinese, { exact: true }).element();
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.textContent).toBe(english);
    await screen.rerender(surface("zh-CN"));
    await expect.poll(() => notice.textContent).toBe(chinese);
    await screen.rerender(surface("en"));
    await expect.poll(() => notice.textContent).toBe(english);
    expect(command).toHaveBeenCalledExactlyOnceWith({
      environmentId: fixture.primary!.environmentId,
      input:
        target === "pairing"
          ? { id: "literal-pairing" }
          : target === "client"
            ? { sessionId: "literal-session" }
            : null,
    });
    for (const other of [fixture.revokePairing, fixture.revokeClient, fixture.revokeOthers])
      if (other !== command) expect(other).not.toHaveBeenCalled();
  },
);

it.each(["raw", "query", "interrupted", "denied"] as const)(
  "preserves %s access failure boundary",
  async (kind) => {
    using _fixture = setupAccess("pairing");
    const english = "Failed to revoke pairing link.";
    if (kind === "query") fixture.accessError = english;
    fixture.revokePairing.mockResolvedValue(
      kind === "interrupted"
        ? AsyncResult.failure(Cause.interrupt())
        : AsyncResult.failure(Cause.die(new Error(english))),
    );
    await using screen = await render(surface("en"));
    await page.getByRole("button", { name: /Authorized clients/ }).click();
    if (kind !== "query") {
      if (kind === "denied") fixture.writeAtCall = false;
      await page.getByRole("button", { name: "Revoke", exact: true }).click();
    }
    if (kind === "raw" || kind === "query") {
      await expect.element(page.getByText(english, { exact: true })).toBeVisible();
      const notice = page.getByText(english, { exact: true }).element();
      await screen.rerender(surface("zh-CN"));
      await expect.poll(() => notice.textContent).toBe(english);
      await screen.rerender(surface("en"));
      await expect.poll(() => notice.textContent).toBe(english);
    } else {
      await expect.element(page.getByRole("button", { name: "Revoke", exact: true })).toBeEnabled();
      expect(fixture.toast).not.toHaveBeenCalled();
      expect(page.getByText(english, { exact: true }).query()).toBeNull();
    }
    expect(fixture.revokePairing).toHaveBeenCalledTimes(
      kind === "denied" || kind === "query" ? 0 : 1,
    );
    expect(fixture.revokeClient).not.toHaveBeenCalled();
    expect(fixture.revokeOthers).not.toHaveBeenCalled();
  },
);

function setupWsl() {
  const resources = new DisposableStack();
  resources.use(setup("exposure"));
  fixture.wsl = {
    enabled: true,
    available: true,
    wslOnly: false,
    distro: null,
    distros: [],
    preflightError: null,
  };
  fixture.wslOnly.mockReset().mockResolvedValue(fixture.wsl);
  fixture.wslEnabled.mockReset().mockResolvedValue(fixture.wsl);
  fixture.wslDistro.mockReset().mockResolvedValue(fixture.wsl);
  resources.use(
    stubGlobal("desktopBridge", {
      getLocalEnvironmentEnabled: () => true,
      setWslOnly: fixture.wslOnly,
      setWslBackendEnabled: fixture.wslEnabled,
      setWslDistro: fixture.wslDistro,
    }),
  );
  return resources;
}
async function openWslConfirmation() {
  await page.getByRole("switch", { name: "Run WSL only", exact: true }).click();
}
it("keeps cached owned WSL failure current in all three persistent rows", async () => {
  using _bridge = setupWsl();
  let reject!: (error: unknown) => void;
  fixture.wslOnly.mockReturnValue(
    new Promise<DesktopWslState>((_resolve, fail) => {
      reject = fail;
    }),
  );
  await using screen = await render(surface("en"));
  await openWslConfirmation();
  expect(fixture.wslOnly).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Restart and enable", exact: true }).click();
  await screen.rerender(surface("zh-CN"));
  reject(null);
  await expect
    .poll(() => fixture.toast.mock.calls.at(-1)?.[0])
    .toMatchObject({ title: "无法更改 WSL 后端", description: "更新 WSL 后端失败。" });
  const state = fixture.wsl!;
  for (const snapshot of [state, { ...state, available: false }, null]) {
    fixture.wsl = snapshot;
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale));
      await expect
        .element(
          page.getByText(
            locale === "en" ? "Failed to update WSL backend." : "更新 WSL 后端失败。",
            { exact: true },
          ),
        )
        .toBeVisible();
    }
  }
  expect(fixture.wslOnly).toHaveBeenCalledExactlyOnceWith(true);
  expect(fixture.wslEnabled).not.toHaveBeenCalled();
  expect(fixture.wslDistro).not.toHaveBeenCalled();
  expect(fixture.refreshWsl).toHaveBeenCalledOnce();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  expect(fixture.refreshWsl).toHaveBeenCalledTimes(2);
  await expect
    .element(page.getByText("Failed to update WSL backend.", { exact: true }))
    .not.toBeInTheDocument();
});
it.each(["mutation", "query"] as const)("keeps raw WSL %s collisions opaque", async (origin) => {
  using _bridge = setupWsl();
  const raw = "Failed to update WSL backend.";
  if (origin === "query") fixture.wslError = raw;
  else fixture.wslOnly.mockRejectedValue(new Error(raw));
  await using screen = await render(surface("en"));
  if (origin === "mutation") {
    await openWslConfirmation();
    await page.getByRole("button", { name: "Restart and enable", exact: true }).click();
    await expect.poll(() => fixture.refreshWsl.mock.calls.length).toBe(1);
  }
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale));
    await expect.element(page.getByText(raw, { exact: true })).toBeVisible();
  }
  expect(fixture.wslOnly).toHaveBeenCalledTimes(origin === "mutation" ? 1 : 0);
  expect(fixture.refreshWsl).toHaveBeenCalledTimes(origin === "mutation" ? 1 : 0);
});
it.each(["cancel", "denied"] as const)("does not mutate WSL after %s", async (mode) => {
  using _bridge = setupWsl();
  await using _screen = await render(surface("en"));
  await openWslConfirmation();
  if (mode === "denied") fixture.maintainAtCall = false;
  await page
    .getByRole("button", { name: mode === "cancel" ? "Cancel" : "Restart and enable", exact: true })
    .click();
  expect(fixture.wslOnly).not.toHaveBeenCalled();
  expect(fixture.wslEnabled).not.toHaveBeenCalled();
  expect(fixture.wslDistro).not.toHaveBeenCalled();
  expect(fixture.refreshWsl).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
});

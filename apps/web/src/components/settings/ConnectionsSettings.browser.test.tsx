import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import {
  EnvironmentId,
  AuthEnvironmentMaintainScope,
  type DesktopServerExposureState,
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
  primary: null as EnvironmentPresentation | null,
  network: null as DesktopNetworkAccessSnapshot | null,
  queryError: null as string | null,
  permitted: true,
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
    scope === AuthEnvironmentMaintainScope && fixture.permitted,
  readEnvironmentScope: (_id: unknown, scope: string) =>
    scope === AuthEnvironmentMaintainScope && fixture.permitted,
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
vi.mock("../../state/query", async (original) => ({
  ...(await original<typeof import("../../state/query")>()),
  useEnvironmentQuery: (query: unknown) => ({
    data: query === desktopNetworkAccessStateAtom ? fixture.network : null,
    error: query === desktopNetworkAccessStateAtom ? fixture.queryError : null,
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
  fixture.queryError = null;
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

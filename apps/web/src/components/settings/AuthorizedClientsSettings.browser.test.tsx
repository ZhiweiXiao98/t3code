import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { AuthAccessWriteScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import { page, userEvent } from "vite-plus/test/browser";
import * as Schema from "effect/Schema";
import { AdvertisedEndpoint } from "@t3tools/contracts";
import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { endpointDefaultPreferenceKey } from "./ConnectionsSettings.logic";
import {
  EnvironmentId,
  managedCapabilityDenial,
  type ManagedPolicySummary,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";
import { act, render } from "../../../test/render";
import {
  AuthorizedClientsHeaderAction,
  AdvertisedEndpointListRow,
  PairingClientsList,
} from "./AuthorizedClientsSettings";

const encodeEndpoint = Schema.encodeSync(AdvertisedEndpoint);
const decodeEndpoint = Schema.decodeSync(AdvertisedEndpoint);

const localId = EnvironmentId.make("local");
const serviceId = EnvironmentId.make("service");

const state = vi.hoisted(() => ({
  primaryEnvironmentId: null as string | null,
  policies: new Map<string, unknown>(),
  locale: "en" as "en" | "zh-CN",
  grant: true,
  create: vi.fn(),
  toast: vi.fn(),
  created: vi.fn(),
  revoke: vi.fn(),
  scope: vi.fn(),
}));

vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  usePrimaryEnvironmentId: (() => state.primaryEnvironmentId) as never,
}));
vi.mock(import("../../state/entities"), async (original) => ({
  ...(await original()),
  useServerConfigs: (() =>
    new Map(
      [...state.policies].map(([environmentId, managedPolicy]) => [
        environmentId,
        { managedPolicy },
      ]),
    )) as never,
}));
vi.mock("../../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  const { authEnvironment } = await import("~/state/auth");
  return {
    ...actual,
    useAtomCommand: (...args: Parameters<typeof actual.useAtomCommand>) =>
      args[0] === authEnvironment.createPairingCredential
        ? state.create
        : actual.useAtomCommand(...args),
  };
});
vi.mock("~/state/session", async (original) => ({
  ...(await original<typeof import("~/state/session")>()),
  readEnvironmentScope: (...args: unknown[]) => {
    state.scope(...args);
    return state.grant;
  },
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: state.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({ readWebI18n: () => ({ locale: state.locale }) }));

const remoteClientsOff: ManagedPolicySummary = {
  organization: "Example Corp",
  lockedSettings: [],
  limits: { clients: ["desktop"] },
};

function setup(policies: ReadonlyArray<readonly [EnvironmentId, ManagedPolicySummary]>) {
  state.primaryEnvironmentId = localId;
  state.policies = new Map(policies);
}

const renderHeader = (environmentId: EnvironmentId) =>
  render(
    <AuthorizedClientsHeaderAction
      environmentId={environmentId}
      onPairingLinkCreated={() => {}}
      clientSessions={null}
      isRevokingOtherClients={false}
      onRevokeOtherClients={() => {}}
      delegatableScopes={[]}
    />,
  );

describe("AuthorizedClientsHeaderAction", () => {
  const denial = managedCapabilityDenial(remoteClientsOff, "remoteClients")!;

  it("follows the selected service's policy, not the primary's", async () => {
    setup([[serviceId, remoteClientsOff]]);
    await using screen = await renderHeader(serviceId);

    await expect.element(screen.getByRole("group", { name: denial })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Create link" })).toBeDisabled();
  });

  it("leaves pairing open on an unmanaged service when the primary is managed", async () => {
    setup([[localId, remoteClientsOff]]);
    await using screen = await renderHeader(serviceId);

    await expect.element(screen.getByRole("button", { name: "Create link" })).toBeEnabled();
    expect(screen.getByRole("group", { name: denial }).query()).toBeNull();
  });
});

it("localizes producer-marked endpoint rows and QR choices without changing selected IDs or saved keys", async () => {
  setup([]);
  const core = createAdvertisedEndpoint({
    id: "desktop-lan:http://192.0.2.4:4173",
    label: "Local network",
    labelSource: "desktop.local-network",
    provider: { id: "desktop-core", label: "Desktop", kind: "core", isAddon: false },
    source: "desktop-core",
    httpBaseUrl: "http://192.0.2.4:4173",
    reachability: "lan",
    status: "available",
  });
  const custom = createAdvertisedEndpoint({
    id: "manual:https://custom.test",
    label: "Custom HTTPS",
    labelSource: "desktop.custom-https",
    provider: { id: "manual", label: "Manual", kind: "manual", isAddon: false },
    source: "user",
    httpBaseUrl: "https://custom.test",
    reachability: "public",
    status: "available",
  });
  const endpoints = [core, custom].map((endpoint) => decodeEndpoint(encodeEndpoint(endpoint)));
  const defaultKey = endpointDefaultPreferenceKey(core);
  const setDefault = vi.fn();
  const revoke = vi.fn();
  const pairingLink = {
    id: "pairing",
    subject: "subject",
    label: "opaque/{pairing}/$&",
    scopes: [],
    createdAt: "2026-01-01T00:00:00Z",
    expiresAt: "2100-01-01T00:00:00Z",
  };
  const surface = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <section aria-label="endpoint-row">
        <AdvertisedEndpointListRow
          endpoint={custom}
          isDefault={false}
          onSetDefault={setDefault}
          onSetupTailscaleServe={() => {}}
          onDisableTailscaleServe={() => {}}
          isUpdatingTailscaleServe={false}
        />
      </section>
      <PairingClientsList
        servedByEnvironment
        endpointUrl={core.httpBaseUrl}
        endpoints={endpoints}
        defaultEndpointKey={defaultKey}
        isLoading={false}
        pairingLinks={[pairingLink]}
        createdPairingCredentials={new Map([["pairing", "opaque-credential"]])}
        sharedPairingLinkId="pairing"
        clientSessions={[]}
        revokingPairingLinkId={null}
        revokingClientSessionId={null}
        onRevokePairingLink={revoke}
        onRevokeClientSession={() => {}}
        canRevoke={false}
      />
    </WebI18nContext>
  );
  await using screen = await render(surface("en"));
  await expect
    .element(screen.getByRole("heading", { name: "Custom HTTPS", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("radio", { name: /^Local network / }))
    .toHaveAttribute("aria-checked", "true");
  await screen.getByRole("radio", { name: /^Custom HTTPS / }).click();
  await screen.rerender(surface("zh-CN"));
  await expect
    .element(screen.getByRole("heading", { name: "自定义 HTTPS", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("radio", { name: /^自定义 HTTPS / }))
    .toHaveAttribute("aria-checked", "true");
  await expect
    .element(screen.getByRole("radio", { name: /^本地网络 / }))
    .toHaveAttribute("aria-checked", "false");
  await expect
    .element(screen.getByRole("radio", { name: /^本地网络 / }))
    .toHaveTextContent("本地网络同一局域网内的设备");
  await expect
    .element(screen.getByRole("radio", { name: /^自定义 HTTPS / }))
    .toHaveTextContent("自定义 HTTPS可从任意位置访问");
  await screen.getByRole("button", { name: "设为默认", exact: true }).click();
  expect(setDefault).toHaveBeenCalledWith(custom);
  expect(endpointDefaultPreferenceKey(setDefault.mock.calls[0]![0])).toBe(
    endpointDefaultPreferenceKey(custom),
  );
  await screen.rerender(surface("en"));
  await expect
    .element(screen.getByRole("radio", { name: /^Custom HTTPS / }))
    .toHaveAttribute("aria-checked", "true");
  expect(endpointDefaultPreferenceKey(core)).toBe(defaultKey);
  expect(custom.label).toBe("Custom HTTPS");
  expect(revoke).not.toHaveBeenCalled();
});

function pairingSurface(locale: "en" | "zh-CN") {
  state.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <AuthorizedClientsHeaderAction
        environmentId={serviceId}
        onPairingLinkCreated={state.created}
        clientSessions={null}
        isRevokingOtherClients={false}
        onRevokeOtherClients={state.revoke}
        delegatableScopes={[AuthOrchestrationReadScope]}
      />
    </WebI18nContext>
  );
}
function setupPairing() {
  const policies = state.policies;
  const primary = state.primaryEnvironmentId;
  setup([]);
  state.grant = true;
  state.create.mockReset();
  state.scope.mockClear();
  state.toast.mockClear();
  state.created.mockClear();
  state.revoke.mockClear();
  return {
    [Symbol.dispose]() {
      state.policies = policies;
      state.primaryEnvironmentId = primary;
      state.locale = "en";
      state.grant = true;
      state.create.mockReset();
    },
  };
}
it.each([
  ["owned", Cause.fail(null)],
  ["raw", Cause.fail(new Error("Literal $& {pairing}"))],
  ["empty", Cause.fail(new Error(""))],
  ["interrupted", Cause.interrupt()],
] as const)("uses settlement locale for pairing link failure: %s", async (kind, cause) => {
  using _setup = setupPairing();
  let resolve!: (result: {
    readonly _tag: "Failure";
    readonly cause: Cause.Cause<unknown>;
  }) => void;
  const promise = new Promise<{ readonly _tag: "Failure"; readonly cause: Cause.Cause<unknown> }>(
    (done) => {
      resolve = done;
    },
  );
  state.create.mockReturnValue(promise);
  await using screen = await render(pairingSurface("en"));
  await using _drain = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        resolve(AsyncResult.failure(Cause.interrupt()));
        await promise;
      });
    },
  };
  await screen.getByRole("button", { name: "Create link", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create pairing link", exact: true });
  await expect.element(dialog).toBeVisible();
  const label = dialog.getByRole("textbox", { name: "Client label (optional)", exact: true });
  const draft = "  Literal $& {client}  ";
  await userEvent.fill(label, draft);
  const scope = dialog.getByRole("checkbox", { name: /^View environment/ });
  await expect.element(scope).toBeChecked();
  await dialog.getByRole("button", { name: "Create link", exact: true }).click();
  expect(state.create).toHaveBeenCalledExactlyOnceWith({
    environmentId: serviceId,
    input: { label: draft.trim(), scopes: [AuthOrchestrationReadScope] },
  });
  expect(state.scope.mock.calls).toEqual([
    [serviceId, AuthAccessWriteScope],
    [serviceId, AuthOrchestrationReadScope],
  ]);
  const pending = dialog.getByRole("button", { name: "Creating…", exact: true });
  await expect.element(pending).toBeDisabled();
  await expect.element(label).toBeDisabled();
  await expect.element(scope).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await act(async () => {
    pending.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(state.create).toHaveBeenCalledTimes(1);
  await screen.rerender(pairingSurface("zh-CN"));
  expect(state.toast).not.toHaveBeenCalled();
  await act(async () => {
    resolve(AsyncResult.failure(cause));
    await promise;
  });
  if (kind === "interrupted") expect(state.toast).not.toHaveBeenCalled();
  else
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法创建配对 URL",
      description:
        kind === "owned" ? "创建配对 URL 失败。" : kind === "empty" ? "" : "Literal $& {pairing}",
      data: { actionLayout: "stacked-end" },
    });
  const current = page.getByRole("dialog", { name: "创建配对链接", exact: true });
  await expect.element(current).toBeVisible();
  await expect
    .element(current.getByRole("textbox", { name: "客户端名称（可选）", exact: true }))
    .toHaveValue(draft);
  await expect
    .element(current.getByRole("button", { name: "创建链接", exact: true }))
    .toBeEnabled();
  expect(state.created).not.toHaveBeenCalled();
  expect(state.revoke).not.toHaveBeenCalled();
});
it("keeps pairing scope denial and cancellation free of credential commands", async () => {
  using _setup = setupPairing();
  await using screen = await render(pairingSurface("en"));
  await screen.getByRole("button", { name: "Create link", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create pairing link", exact: true });
  const scope = dialog.getByRole("checkbox", { name: /^View environment/ });
  await scope.click();
  await expect
    .element(dialog.getByRole("button", { name: "Create link", exact: true }))
    .toBeDisabled();
  await scope.click();
  await expect
    .element(dialog.getByRole("button", { name: "Create link", exact: true }))
    .toBeEnabled();
  state.grant = false;
  await dialog.getByRole("button", { name: "Create link", exact: true }).click();
  expect(state.scope).toHaveBeenCalledExactlyOnceWith(serviceId, AuthAccessWriteScope);
  expect(state.create).not.toHaveBeenCalled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  expect(state.create).not.toHaveBeenCalled();
  expect(state.created).not.toHaveBeenCalled();
  expect(state.revoke).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
});

const dummyCredential = "fixture-only/$&/{pairing-code}";
function copyCodeSurface(locale: "en" | "zh-CN") {
  state.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <PairingClientsList
        servedByEnvironment={false}
        endpointUrl={null}
        endpoints={[]}
        defaultEndpointKey={null}
        isLoading={false}
        pairingLinks={[
          {
            id: "copy-fixture",
            subject: "fixture-only",
            label: "Literal $& {client}",
            scopes: [],
            createdAt: "2026-01-01T00:00:00Z",
            expiresAt: "2100-01-01T00:00:00Z",
          },
        ]}
        createdPairingCredentials={new Map([["copy-fixture", dummyCredential]])}
        sharedPairingLinkId={null}
        clientSessions={[]}
        revokingPairingLinkId={null}
        revokingClientSessionId={null}
        onRevokePairingLink={state.revoke}
        onRevokeClientSession={state.revoke}
        canRevoke={false}
      />
    </WebI18nContext>
  );
}
it.each(["zh-CN", "en"] as const)(
  "uses settlement locale for pairing code copy success: %s",
  async (locale) => {
    using _setup = setupPairing();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const writeText = vi.fn(() => promise);
    const write = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, write },
    });
    vi.stubGlobal("isSecureContext", true);
    using _clipboard = {
      [Symbol.dispose]() {
        if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
        else Reflect.deleteProperty(navigator, "clipboard");
        vi.unstubAllGlobals();
      },
    };
    await using screen = await render(copyCodeSurface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve();
          await promise;
        });
      },
    };
    await expect
      .element(screen.getByRole("heading", { name: "Literal $& {client}", exact: true }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Copy code", exact: true }).click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(dummyCredential);
    expect(state.toast).not.toHaveBeenCalled();
    await screen.rerender(copyCodeSurface(locale));
    expect(state.toast).not.toHaveBeenCalled();
    await act(async () => {
      resolve();
      await promise;
    });
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: locale === "zh-CN" ? "已复制配对码" : "Pairing code copied",
      description:
        locale === "zh-CN"
          ? "请将其粘贴到另一个客户端以完成配对。"
          : "Paste it into another client to finish pairing.",
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(dummyCredential);
    expect(write).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
    expect(state.created).not.toHaveBeenCalled();
    expect(state.revoke).not.toHaveBeenCalled();
    await screen.rerender(copyCodeSurface("en"));
    expect(state.toast).toHaveBeenCalledTimes(1);
  },
);

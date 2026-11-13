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
import { render } from "../../../test/render";
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
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => vi.fn()) as never,
}));

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

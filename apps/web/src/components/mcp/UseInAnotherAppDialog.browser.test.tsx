import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import type { McpGate } from "./mcpGate";

const state = vi.hoisted(() => ({
  gate: { kind: "open", mcpUrl: "https://environment.example.test/mcp" } as McpGate,
  mint: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  command: vi.fn(async () => ({ _tag: "Failure" })),
  now: 0,
  hostedApproval: false,
}));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true }) }));
vi.mock("../../cloud/publicConfig", () => ({
  hasCloudPublicConfig: () => true,
  resolveCloudPublicConfig: () => ({
    clerkPublishableKey: "pk_test_Zml4dHVyZS5leGFtcGxlLnRlc3Qk",
    clerkJwtTemplate: "fixture",
    relayUrl: "https://relay.example.test",
    relayTracing: { tracesUrl: null, tracesDataset: null, tracesToken: null },
  }),
  resolveRelayTracingConfig: () => null,
}));
vi.mock("../../cloud/cloudLinkState", () => ({ readCachedCloudLinkState: () => null }));
vi.mock("../../cloud/linkEnvironmentAtoms", () => ({ checkReachability: {}, readLinkState: {} }));
vi.mock("../../cloud/useCloudLinkController", () => ({
  useCloudLinkController: () => ({
    linkState: { data: null, error: null, refresh: () => undefined },
    operationError: null,
    tunnelLimit: null,
  }),
}));
vi.mock("../../cloud/useT3ConnectTurnOn", () => ({
  useT3ConnectTurnOn: () => ({ kind: "elsewhere" }),
}));
vi.mock("../clerk/useT3ConnectAuthPrompt", () => ({
  useT3ConnectAuthPrompt: () => ({ openAuthPrompt: () => undefined }),
}));
vi.mock("../../state/relay", async () => {
  const { Atom } = await import("effect/reactivity");
  const Option = await import("effect/Option");
  return {
    relayEnvironmentDiscovery: {
      stateValueAtom: Atom.make({
        environments: new Map(),
        refreshing: false,
        listed: true,
        error: Option.none(),
      }),
      refresh: {},
    },
  };
});
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.command }));
vi.mock("../settings/useAccessEnvironment", () => ({
  useAccessEnvironment: () => ({
    label: "My host {name}",
    environment: {
      environmentId: "fixture",
      label: "My host {name}",
      connection: { phase: "connected" },
      entry: { target: { kind: "remote" } },
      serverConfig: { environment: { capabilities: { mcpHostedApproval: state.hostedApproval } } },
    },
  }),
}));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => "fixture",
  useEnvironmentIdentities: () => [],
}));
vi.mock("../../state/managedPolicy", () => ({ useManagedPolicy: () => undefined }));
vi.mock("../../state/session", async () => {
  const { AuthMcpClientAccess, mcpClientScopes } = await import("@t3tools/contracts");
  return {
    useEnvironmentScope: () => true,
    useEnvironmentSessionState: () => ({
      data: {
        authenticated: true,
        permissions: AuthMcpClientAccess.literals.flatMap((level) => mcpClientScopes(level)),
      },
    }),
  };
});
vi.mock("../../state/peerPairingCode", () => ({ mintMcpApprovalCodeOn: state.mint }));
vi.mock("../../state/peerLinks", () => ({ peerLinkEnvironment: { list: () => null } }));
vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => ({ data: null }) }));
vi.mock("../../hooks/useNowSecond", () => ({ useNowSecond: () => state.now }));
vi.mock("./mcpGate", () => ({
  resolveMcpGate: () => state.gate,
  afterFailedCheck: () => ({ result: null, since: null }),
}));

import { openUseInAnotherApp, UseInAnotherAppDialogHost } from "./UseInAnotherAppDialog";

function setup() {
  state.gate = { kind: "open", mcpUrl: "https://environment.example.test/mcp" };
  state.now = 0;
  state.hostedApproval = false;
  state.command.mockClear();
  state.mint.mockReset().mockResolvedValue({
    _tag: "Success",
    success: { credential: "auto-q8rz3nwd5ktc", expiresAt: { epochMilliseconds: 300_000 } },
  });
}

function wizard(locale: ResolvedAppLocale) {
  return (
    <AppAtomRegistryProvider>
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <UseInAnotherAppDialogHost />
      </WebI18nContext>
    </AppAtomRegistryProvider>
  );
}

it.each([
  ["en", "Next", "Back", "Done", "Get code", "New code", "Something else…"],
  ["zh-CN", "下一步", "返回", "完成", "获取验证码", "获取新验证码", "其他应用…"],
] as const)(
  "keeps access and code state through back, errors, expiry and reopening in %s",
  async (locale, next, back, done, getCode, newCode, other) => {
    setup();
    await using screen = await render(wizard(locale));
    await act(() => openUseInAnotherApp(null));
    const dialog = page.getByRole("dialog");
    await expect.element(dialog.getByRole("button", { name: next, exact: true })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Poke", exact: true }));
    await userEvent.click(dialog.getByRole("button", { name: next, exact: true }));
    await expect
      .element(dialog.getByRole("radiogroup"))
      .toHaveAccessibleName(locale === "en" ? "What can Poke do?" : "允许 Poke 做什么？");
    await userEvent.click(dialog.getByRole("button", { name: back, exact: true }));
    await expect
      .element(dialog.getByRole("button", { name: "Poke", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await userEvent.click(dialog.getByRole("button", { name: other, exact: true }));
    await userEvent.click(dialog.getByRole("button", { name: next, exact: true }));
    await userEvent.click(dialog.getByRole("button", { name: next, exact: true }));
    expect(state.mint).not.toHaveBeenCalled();
    await expect
      .element(dialog.getByText("https://environment.example.test/mcp", { exact: true }))
      .toBeVisible();
    state.mint.mockResolvedValueOnce({ _tag: "Failure" });
    await userEvent.click(dialog.getByRole("button", { name: getCode, exact: true }));
    await expect
      .element(
        dialog.getByText(
          locale === "en"
            ? "Could not get a code from My host {name}. Try again."
            : "无法从 My host {name} 获取验证码。请重试。",
        ),
      )
      .toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: getCode, exact: true }));
    await expect.element(dialog.getByText("auto-q8rz3nwd5ktc", { exact: true })).toBeVisible();
    await expect
      .element(
        dialog.getByText(locale === "en" ? "Expires 5:00 · one use" : "5:00 后过期 · 仅限使用一次"),
      )
      .toBeVisible();
    state.now = 300_000;
    await screen.rerender(wizard(locale));
    await expect
      .element(dialog.getByText(locale === "en" ? "The code expired." : "验证码已过期。"))
      .toBeVisible();
    await expect
      .element(dialog.getByText("auto-q8rz3nwd5ktc", { exact: true }))
      .not.toBeInTheDocument();
    await expect.element(dialog.getByRole("button", { name: newCode, exact: true })).toBeEnabled();
    await userEvent.click(dialog.getByRole("button", { name: done, exact: true }));
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await act(() => openUseInAnotherApp(null));
    await expect
      .element(page.getByRole("dialog").getByRole("button", { name: next, exact: true }))
      .toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(state.mint).toHaveBeenCalledTimes(2);
    expect(state.mint).toHaveBeenLastCalledWith("fixture", "auto");
  },
);

it("localizes a failed connection gate and retries without changing its diagnostic detail", async () => {
  setup();
  state.gate = { kind: "error", message: "E_TUNNEL {detail}" };
  await using screen = await render(wizard("zh-CN"));
  await act(() => openUseInAnotherApp(null));
  const dialog = page.getByRole("dialog");
  await expect.element(dialog.getByText("无法检查 My host {name} 上的 T3 Connect")).toBeVisible();
  await expect.element(dialog.getByText("E_TUNNEL {detail}")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "重新检查" }));
  await vi.waitFor(() => expect(state.command).toHaveBeenCalled());
  await screen.rerender(wizard("en"));
  await expect.element(dialog.getByText("Can't check T3 Connect on My host {name}")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});

it.each(["en", "zh-CN"] as const)("keeps the hosted flow code-free in %s", async (locale) => {
  setup();
  state.hostedApproval = true;
  await using _screen = await render(wizard(locale));
  await act(() => openUseInAnotherApp(null));
  const dialog = page.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Poke", exact: true }));
  await userEvent.click(
    dialog.getByRole("button", { name: locale === "en" ? "Next" : "下一步", exact: true }),
  );
  await expect
    .element(
      dialog.getByText(
        locale === "en"
          ? "When Poke opens the sign-in page, choose what it may do and approve with your T3 Connect account."
          : "当 Poke 打开登录页面时，请选择允许执行的操作，并使用你的 T3 Connect 账号批准。",
      ),
    )
    .toBeVisible();
  await expect.element(dialog.getByRole("radiogroup")).not.toBeInTheDocument();
  await expect
    .element(
      dialog.getByRole("button", {
        name: locale === "en" ? "Get code" : "获取验证码",
        exact: true,
      }),
    )
    .not.toBeInTheDocument();
  expect(state.mint).not.toHaveBeenCalled();
  await userEvent.click(
    dialog.getByRole("button", { name: locale === "en" ? "Done" : "完成", exact: true }),
  );
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});

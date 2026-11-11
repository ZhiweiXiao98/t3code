import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const state = vi.hoisted(() => ({ run: vi.fn<(...args: unknown[]) => Promise<unknown>>() }));
vi.mock("../../lib/runtime", () => ({ runPrimaryHttp: state.run }));

import type { ReactNode } from "react";
import { ConnectAgentSurface, McpConsent, type McpApprovalTransport } from "./ConnectAgentSurface";

function setup() {
  state.run.mockReset().mockResolvedValue({
    kind: "ok",
    value: {
      clientName: "External {app}",
      environmentHost: "env.example.test:7443",
      redirectHost: "localhost:3333",
      csrfToken: "test-csrf",
      oneClickAccess: ["read-only"],
    },
  });
}

function surface(locale: ResolvedAppLocale, children: ReactNode = <ConnectAgentSurface />) {
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

it.each([
  ["en", "Sign-in code", "Paste a code", "Approve", "Approving…", "Deny", "Read only", "Auto"],
  ["zh-CN", "登录验证码", "粘贴验证码", "批准", "正在批准…", "拒绝", "只读", "自动"],
] as const)(
  "keeps approval data and retry/deny behavior intact in %s",
  async (locale, codeLabel, placeholder, approve, approving, deny, readOnly, auto) => {
    setup();
    await using screen = await render(surface(locale));
    await expect.element(screen.getByLabelText(codeLabel)).toBeVisible();
    await expect
      .element(screen.getByLabelText(codeLabel))
      .toHaveAttribute("placeholder", placeholder);
    expect(screen.container.textContent).toContain("External {app}");
    expect(screen.container.textContent).toContain("env.example.test:7443");
    expect(screen.container.textContent).toContain("localhost:3333");
    expect(screen.container.textContent).toContain("t3 auth pairing create");
    expect(screen.container.textContent).toContain(
      locale === "en" ? "Only approve a sign-in you just started." : "请仅批准你刚刚发起的登录。",
    );
    await expect.element(screen.getByRole("radio", { name: new RegExp(readOnly) })).toBeChecked();

    await userEvent.fill(screen.getByLabelText(codeLabel), "auto-q8rz3nwd5ktc");
    await expect
      .element(screen.getByRole("button", { name: `${approve} ${auto}`, exact: true }))
      .toBeEnabled();
    let finishDecision!: (answer: unknown) => void;
    const decision = new Promise<unknown>((resolve) => {
      finishDecision = resolve;
    });
    state.run.mockReturnValueOnce(decision);
    await userEvent.click(screen.getByRole("button", { name: `${approve} ${auto}`, exact: true }));
    await expect.element(screen.getByRole("button", { name: approving })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: deny, exact: true })).toBeDisabled();
    await act(() => finishDecision({ kind: "error", message: "provider-error: {original}" }));
    await expect.element(screen.getByText("provider-error: {original}")).toBeVisible();
    await expect.element(screen.getByLabelText(codeLabel)).toHaveValue("auto-q8rz3nwd5ktc");

    await userEvent.clear(screen.getByLabelText(codeLabel));
    await expect.element(screen.getByRole("radio", { name: new RegExp(readOnly) })).toBeChecked();
    state.run.mockResolvedValueOnce({ kind: "error", message: "denied-result: original" });
    await userEvent.click(screen.getByRole("button", { name: deny, exact: true }));
    await expect.element(screen.getByText("denied-result: original")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: `${approve} ${readOnly}`, exact: true }))
      .toBeEnabled();
    expect(state.run).toHaveBeenCalledTimes(3);
  },
);

it("restores English after switching locale without rewriting a typed sign-in code", async () => {
  setup();
  await using screen = await render(surface("zh-CN"));
  await expect.element(screen.getByLabelText("登录验证码")).toBeVisible();
  await userEvent.fill(screen.getByLabelText("登录验证码"), "read-only-q8rz3nwd5ktc");
  await screen.rerender(surface("en"));
  await expect.element(screen.getByLabelText("Sign-in code")).toHaveValue("read-only-q8rz3nwd5ktc");
  await expect.element(screen.getByText("Only approve a sign-in you just started.")).toBeVisible();
});

it("shows a localized unreachable request without exposing approval controls", async () => {
  setup();
  state.run.mockRejectedValueOnce(new Error("offline"));
  await using screen = await render(surface("zh-CN"));
  await expect.element(screen.getByText("无法连接此环境，请重试。")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "批准", exact: true }))
    .not.toBeInTheDocument();
});

it.each(["en", "zh-CN"] as const)(
  "requires an explicit hosted access choice and keeps unsafe redirects on-page in %s",
  async (locale) => {
    setup();
    const transport: McpApprovalTransport = {
      load: vi.fn<McpApprovalTransport["load"]>(async () => ({
        kind: "ok",
        value: {
          clientName: "External {app}",
          environmentHost: "env.example.test:7443",
          redirectHost: "client.example.test",
          csrfToken: "test-csrf",
          oneClickAccess: ["read-only"],
        },
      })),
      decide: vi.fn<McpApprovalTransport["decide"]>(async () => ({
        kind: "redirect",
        url: "javascript:alert(1)",
      })),
    };
    await using screen = await render(
      surface(
        locale,
        <McpConsent
          authorization={{}}
          transport={transport}
          requireLevelChoice
          environmentLabel="Host {name}"
        />,
      ),
    );
    const choose = locale === "en" ? "Choose what it may do" : "请选择允许执行的操作";
    const readOnly = locale === "en" ? "Read only" : "只读";
    const approve = locale === "en" ? "Approve Read only" : "批准 只读";
    await expect.element(screen.getByRole("button", { name: choose, exact: true })).toBeDisabled();
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("radio", { name: new RegExp(readOnly) }))
      .not.toBeChecked();
    expect(screen.container.textContent).toContain("Host {name}");
    expect(screen.container.textContent).toContain("env.example.test:7443");
    await userEvent.click(screen.getByRole("radio", { name: new RegExp(readOnly) }));
    await expect.element(screen.getByRole("button", { name: approve, exact: true })).toBeEnabled();
    await act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await expect.element(screen.getByRole("button", { name: approve, exact: true })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: approve, exact: true })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: approve, exact: true }));
    await expect
      .element(
        screen.getByText(
          locale === "en"
            ? "The environment returned an address this page will not open."
            : "环境返回的地址不安全，此页面不会打开该地址。",
        ),
      )
      .toBeVisible();
    expect(transport.decide).toHaveBeenCalledWith(
      {},
      {
        _tag: "browser-session",
        access: "read-only",
        csrfToken: "test-csrf",
      },
    );
    await expect.element(screen.getByRole("button", { name: approve, exact: true })).toBeEnabled();
  },
);

it("rejects an unsafe initial redirect before exposing approval controls", async () => {
  setup();
  const transport: McpApprovalTransport = {
    load: vi.fn<McpApprovalTransport["load"]>(async () => ({
      kind: "redirect",
      url: "http://untrusted.example/callback",
    })),
    decide: vi.fn(),
  };
  await using screen = await render(
    surface("zh-CN", <McpConsent authorization={{}} transport={transport} requireLevelChoice />),
  );
  await expect
    .element(screen.getByText("环境返回的地址不安全，此页面不会打开该地址。"))
    .toBeVisible();
  await expect.element(screen.getByRole("radio")).not.toBeInTheDocument();
  expect(transport.decide).not.toHaveBeenCalled();
});

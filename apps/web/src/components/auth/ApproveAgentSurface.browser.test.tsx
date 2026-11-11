import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const state = vi.hoisted(() => ({
  openSignIn: vi.fn(),
  signOut: vi.fn(),
  approve: vi.fn(),
  consent: vi.fn(() => null),
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useClerk: () => ({ openSignIn: state.openSignIn, signOut: state.signOut }),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("@t3tools/client-runtime/relay", () => ({ managedRelaySessionAtom: {} }));
vi.mock("../../state/connectMcpApproval", () => ({ runConnectMcpApproval: state.approve }));
vi.mock("./ConnectAgentSurface", () => ({
  readAuthorizationRequest: () => ({}),
  McpConsent: state.consent,
}));

import { ApproveAgentSurface } from "./ApproveAgentSurface";

function setup() {
  state.openSignIn.mockReset();
  state.signOut.mockReset();
  state.approve.mockReset();
  state.consent.mockClear();
}

function surface(locale: ResolvedAppLocale) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ApproveAgentSurface />
    </WebI18nContext>
  );
}

it.each(["en", "zh-CN"] as const)(
  "blocks hosted approval and sign-in in an iframe in %s",
  async (locale) => {
    setup();
    // Vitest browser tests run inside an iframe. Exercise the actual window guard, not a mock.
    expect(window.top).not.toBe(window.self);
    const originalUrl = window.location.href;
    using _location = {
      [Symbol.dispose]: () => window.history.replaceState(null, "", originalUrl),
    };
    const url = new URL(originalUrl);
    url.searchParams.set("environment", "fixture");
    window.history.replaceState(null, "", url);
    await using screen = await render(surface(locale));
    await expect
      .element(
        screen.getByText(
          locale === "en"
            ? "For your safety, agent sign-ins cannot be approved inside another site."
            : "为保障你的安全，无法在其他网站内批准 Agent 登录。",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
    expect(state.openSignIn).not.toHaveBeenCalled();
    expect(state.consent).not.toHaveBeenCalled();
    expect(state.approve).not.toHaveBeenCalled();
  },
);

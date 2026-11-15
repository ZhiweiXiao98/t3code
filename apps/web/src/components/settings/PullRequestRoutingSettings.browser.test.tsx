import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import {
  PrimaryConnectionTarget,
  type StoredPullRequestRoutingPermission,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { environmentCatalog } from "~/connection/catalog";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import type { EnvironmentPresentation } from "~/state/environments";
import { act, render } from "../../../test/render";
import { PullRequestRoutingSettings } from "./PullRequestRoutingSettings";

const state = vi.hoisted(() => ({
  update: vi.fn(),
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("~/connection/catalog", async (original) => {
  const actual = await original<typeof import("~/connection/catalog")>();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentCatalog: {
      ...actual.environmentCatalog,
      catalogValueAtom: Atom.make<EnvironmentCatalogState>({ isReady: true, entries: new Map() }),
      pullRequestRoutingPermissionsValueAtom: Atom.make<
        ReadonlyArray<StoredPullRequestRoutingPermission>
      >([]),
    },
  };
});
vi.mock("~/state/use-atom-command", async (original) => {
  const actual = await original<typeof import("~/state/use-atom-command")>();
  const { environmentCatalog } = await import("~/connection/catalog");
  return {
    ...actual,
    useAtomCommand: (...args: Parameters<typeof actual.useAtomCommand>) =>
      args[0] === environmentCatalog.setPullRequestRoutingPermission
        ? state.update
        : actual.useAtomCommand(...args),
  };
});
vi.mock("~/state/session", async (original) => ({
  ...(await original<typeof import("~/state/session")>()),
  usePreparedConnection: () => Option.none(),
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: state.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({ readWebI18n: () => ({ locale: state.locale }) }));
function environment(name: string): EnvironmentPresentation {
  const environmentId = EnvironmentId.make(name);
  return {
    environmentId,
    label: name,
    displayUrl: null,
    relayManaged: false,
    serverConfig: null,
    connection: { phase: "connected", error: null, traceId: null },
    entry: {
      enabled: true,
      profile: Option.none(),
      target: new PrimaryConnectionTarget({
        environmentId,
        label: name,
        httpBaseUrl: "https://fixture.invalid/" + name,
        wsBaseUrl: "wss://fixture.invalid/" + name,
      }),
    },
  };
}
const environments = [environment("Literal $& {machine}"), environment("Second machine")];
function surface(locale: "en" | "zh-CN", registry: AtomRegistry.AtomRegistry) {
  state.locale = locale;
  return (
    <RegistryContext.Provider value={registry}>
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <PullRequestRoutingSettings environments={environments} />
      </WebI18nContext>
    </RegistryContext.Provider>
  );
}
it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {host}")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)("uses settlement locale for routing settings failure: %s", async (kind, cause) => {
  type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  let finish!: (value: Result) => void;
  const promise = new Promise<Result>((resolve) => {
    finish = resolve;
  });
  state.update.mockReset().mockReturnValue(promise);
  state.toast.mockClear();
  using _restore = {
    [Symbol.dispose]() {
      state.locale = "en";
      state.update.mockReset();
    },
  };
  await using stack = new AsyncDisposableStack();
  const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
  expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
  const permissionsBefore = registry.get(environmentCatalog.pullRequestRoutingPermissionsValueAtom);
  await using screen = await render(surface("en", registry));
  await using _drain = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await promise;
      });
    },
  };
  await screen.getByRole("button", { name: /^Pull request sharing/ }).click();
  const first = screen.getByRole("combobox", {
    name: "Literal $& {machine} pull request routing",
    exact: true,
  });
  const second = screen.getByRole("combobox", {
    name: "Second machine pull request routing",
    exact: true,
  });
  await first.click();
  await page.getByRole("option", { name: "Read PRs", exact: true }).click();
  expect(state.update).toHaveBeenCalledExactlyOnceWith({
    environmentId: environments[0]!.environmentId,
    permission: "read",
  });
  await expect.element(first).toBeDisabled();
  await expect.element(second).toBeDisabled();
  await act(async () => {
    first.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(state.update).toHaveBeenCalledTimes(1);
  await screen.rerender(surface("zh-CN", registry));
  expect(state.toast).not.toHaveBeenCalled();
  await act(async () => {
    finish(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause)));
    await promise;
  });
  expect(state.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法保存拉取请求路由权限",
  });
  await expect
    .element(
      screen.getByRole("combobox", { name: "Literal $& {machine} 拉取请求路由", exact: true }),
    )
    .toBeEnabled();
  await expect
    .element(screen.getByRole("combobox", { name: "Second machine 拉取请求路由", exact: true }))
    .toBeEnabled();
  expect(registry.get(environmentCatalog.pullRequestRoutingPermissionsValueAtom)).toBe(
    permissionsBefore,
  );
  await screen.rerender(surface("en", registry));
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(state.update).toHaveBeenCalledTimes(1);
});

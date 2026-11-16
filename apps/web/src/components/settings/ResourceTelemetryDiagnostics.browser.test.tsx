import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  type ResourceTelemetrySnapshot,
  type ResourceTelemetryHistory,
} from "@t3tools/contracts";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import * as Cause from "effect/Cause";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  allowed: true,
  retry: vi.fn(),
  signal: vi.fn(),
}));
vi.mock("~/connection/catalog", async (original) => {
  const actual = await original<typeof import("~/connection/catalog")>();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentCatalog: {
      ...actual.environmentCatalog,
      catalogValueAtom: Atom.make<EnvironmentCatalogState>({ isReady: true, entries: new Map() }),
    },
  };
});
vi.mock("../../state/server", async (original) => {
  const actual = await original<typeof import("../../state/server")>();
  const { Atom, AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  const telemetry = Atom.make(
    AsyncResult.failure<ResourceTelemetrySnapshot, unknown>(
      Cause.fail(new Error("Fixture collector unavailable")),
    ),
  );
  const history = Atom.make(AsyncResult.initial<ResourceTelemetryHistory, unknown>(false));
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      resourceTelemetry: () => telemetry,
      resourceTelemetryHistory: () => history,
    },
  };
});
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  useEnvironmentScope: () => fixture.allowed,
  readEnvironmentScope: () => fixture.allowed,
}));
vi.mock("../../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  return {
    ...actual,
    useAtomCommand: ((command, options) =>
      (command as unknown) === serverEnvironment.retryResourceTelemetry
        ? fixture.retry
        : (command as unknown) === serverEnvironment.signalProcess
          ? fixture.signal
          : actual.useAtomCommand(command, options)) as typeof actual.useAtomCommand,
  };
});
vi.mock("../../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../../i18n/readWebI18n")>()),
  readWebI18n: () => {
    const locale = fixture.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
import { serverEnvironment } from "../../state/server";
import { toastManager } from "../ui/toast";
import { ResourceTelemetryDiagnostics } from "./ResourceTelemetryDiagnostics";

it.each(["owned", "raw", "empty", "interrupted", "denied"] as const)(
  "uses settlement locale for resource monitor retry failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.allowed = true;
    fixture.retry.mockReset();
    fixture.signal.mockReset();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    stack.defer(() => {
      fixture.locale = "en";
      fixture.allowed = true;
    });
    using refresh = vi.spyOn(registry, "refresh");
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    let finish!: (result: AsyncResult.AsyncResult<never, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<never, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.retry.mockReturnValue(pending);
    const environmentId = EnvironmentId.make("retry-fixture");
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <RegistryContext.Provider value={registry}>
          <ResourceTelemetryDiagnostics environmentId={environmentId} />
        </RegistryContext.Provider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await pending;
        });
      },
    };
    const retry = screen.getByRole("button", { name: "Retry monitor", exact: true });
    await expect.element(retry).toBeEnabled();
    if (kind === "denied") fixture.allowed = false;
    await retry.click();
    if (kind === "denied") {
      expect(fixture.retry).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    } else {
      expect(fixture.retry).toHaveBeenCalledExactlyOnceWith({ environmentId, input: {} });
      await expect.element(retry).toBeDisabled();
      await act(() => {
        retry.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
      });
      expect(fixture.retry).toHaveBeenCalledTimes(1);
      expect(toast).not.toHaveBeenCalled();
      fixture.locale = "zh-CN";
      await screen.rerender(surface("zh-CN"));
      await act(async () => {
        finish(
          AsyncResult.failure(
            kind === "interrupted"
              ? Cause.interrupt()
              : Cause.fail(
                  kind === "raw"
                    ? new Error("Literal $& {retry}")
                    : kind === "empty"
                      ? new Error("")
                      : null,
                ),
          ),
        );
        await pending;
      });
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法重启资源监视器",
        description:
          kind === "raw"
            ? "Literal $& {retry}"
            : kind === "empty"
              ? ""
              : kind === "interrupted"
                ? "All fibers interrupted without error"
                : "资源监视器重试失败。",
      });
      fixture.locale = "en";
      await screen.rerender(surface("en"));
      expect(fixture.retry).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledTimes(1);
    }
    await expect.element(retry).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
    expect(fixture.signal).not.toHaveBeenCalled();
  },
);

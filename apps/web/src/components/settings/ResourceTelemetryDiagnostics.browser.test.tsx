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
  processes: false,
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
  const DateTime = await import("effect/DateTime");
  const Option = await import("effect/Option");
  const readAt = DateTime.makeUnsafe(10000);
  const aggregate = {
    processCount: 1,
    currentCpuPercent: 0,
    cpuTimeMs: 0,
    currentRssBytes: 0,
    peakRssBytes: 0,
    ioReadBytes: 0,
    ioWriteBytes: 0,
    ioReadBytesPerSecond: 0,
    ioWriteBytesPerSecond: 0,
    processStarts: 0,
    processExits: 0,
  };
  const source = {
    status: "healthy" as const,
    lastSampleAt: Option.some(readAt),
    lastError: Option.none<string>(),
  };
  const snapshot: ResourceTelemetrySnapshot = {
    readAt,
    sampleIntervalMs: 1000,
    processes: [
      {
        identity: { pid: 123, startTimeMs: 1000 },
        ppid: 122,
        childPids: [],
        depth: 0,
        name: "Literal $& {process}",
        command: "fixture command",
        status: "running",
        category: "server-child",
        cpuPercent: 0,
        cpuTimeMs: 0,
        residentBytes: 0,
        peakResidentBytes: 0,
        virtualBytes: 0,
        ioReadBytes: 0,
        ioWriteBytes: 0,
        ioReadBytesPerSecond: 0,
        ioWriteBytesPerSecond: 0,
        ioSemantics: "unavailable",
        runTimeMs: 0,
        firstSeenAt: readAt,
        lastSeenAt: readAt,
      },
    ],
    groups: { backend: aggregate, electron: aggregate, monitor: aggregate, allT3: aggregate },
    power: {
      source: "unknown",
      idle: "unknown",
      idleSeconds: null,
      locked: "unknown",
      suspended: false,
      onBattery: "unknown",
      lowPowerMode: "unknown",
      thermalState: "unknown",
      stale: false,
      updatedAt: readAt,
    },
    speedLimitPercent: Option.none(),
    attribution: { readAt, entries: [] },
    health: {
      native: source,
      desktop: source,
      sidecarVersion: Option.none(),
      sidecarPid: Option.none(),
      restartCount: 1,
      collectionDurationMicros: 0,
      scannedProcessCount: 1,
      retainedProcessCount: 1,
      inaccessibleProcessCount: 0,
    },
  };
  const processTelemetry = Atom.make(AsyncResult.success(snapshot));
  const history = Atom.make(AsyncResult.initial<ResourceTelemetryHistory, unknown>(false));
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      resourceTelemetry: () => (fixture.processes ? processTelemetry : telemetry),
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
import { ensureLocalApi } from "../../localApi";
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

it.each(["owned", "raw", "empty", "cancel"] as const)(
  "uses settlement locale for resource signal confirmation failure: %s",
  async (kind) => {
    fixture.locale = "en";
    fixture.allowed = true;
    fixture.processes = true;
    fixture.retry.mockReset();
    fixture.signal.mockReset();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    stack.defer(() => {
      fixture.locale = "en";
      fixture.allowed = true;
      fixture.processes = false;
    });
    using refresh = vi.spyOn(registry, "refresh");
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    let resolve!: (value: boolean) => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<boolean>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void pending.catch(() => undefined);
    using confirm = vi.spyOn(ensureLocalApi().dialogs, "confirm").mockReturnValue(pending);
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
          <ResourceTelemetryDiagnostics environmentId={EnvironmentId.make("confirm-fixture")} />
        </RegistryContext.Provider>
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve(false);
          await pending.catch(() => undefined);
        });
      },
    };
    const kill = screen.getByRole("button", { name: "Send SIGKILL", exact: true });
    await kill.click();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      "Send SIGKILL to process 123? This cannot be handled by the process.",
      { variant: "destructive" },
    );
    await expect.element(kill).toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: "Send SIGINT", exact: true }))
      .toBeDisabled();
    await act(() => {
      kill.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      if (kind === "cancel") resolve(false);
      else
        reject(kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {confirm}" : ""));
      await pending.catch(() => undefined);
    });
    if (kind === "cancel") expect(toast).not.toHaveBeenCalled();
    else
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法确认信号操作",
        description:
          kind === "owned" ? "发送 SIGKILL 失败。" : kind === "raw" ? "Literal $& {confirm}" : "",
      });
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    await expect.element(kill).toBeEnabled();
    await expect
      .element(screen.getByRole("button", { name: "Send SIGINT", exact: true }))
      .toBeEnabled();
    await expect.element(screen.getByText("Literal $& {process}", { exact: true })).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fixture.signal).not.toHaveBeenCalled();
    expect(fixture.retry).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(kind === "cancel" ? 0 : 1);
  },
);

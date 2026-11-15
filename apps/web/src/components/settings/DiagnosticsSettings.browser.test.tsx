import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import {
  AuthDiagnosticsReadScope,
  AuthEnvironmentMaintainScope,
  type ServerProcessDiagnosticsResult,
  type ServerSignalProcessResult,
  AuthOrchestrationOperateScope,
  EnvironmentId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Cause from "effect/Cause";
import { act, render } from "../../../test/render";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({
  open: vi.fn(),
  toast: vi.fn(),
  processes: false,
  locale: "en" as "en" | "zh-CN",
  signal: vi.fn(),
  refresh: vi.fn(),
  permitted: true,
  logsPath: "/mock/literal-$&-{logs}",
}));
vi.mock("../../state/environments", async (original) => ({
  ...(await original<typeof import("../../state/environments")>()),
  useEnvironments: () => ({
    environments: [],
    isReady: true,
    networkStatus: "online",
    presentationById: new Map(),
  }),
}));
vi.mock("./SettingsScopeContext", async (original) => ({
  ...(await original<typeof import("./SettingsScopeContext")>()),
  useSettingsScope: () => ({
    environment: {
      environmentId: EnvironmentId.make("diagnostics-fixture"),
      connection: { phase: "connected" },
      serverConfig: {
        observability: { logsDirectoryPath: fixture.logsPath },
        availableEditors: [],
      },
    },
  }),
}));
vi.mock("../../state/session", async (original) => {
  const actual = await original<typeof import("../../state/session")>();
  const { Atom } = await import("effect/reactivity");
  const session = Atom.make(null);
  return {
    ...actual,
    environmentSession: { ...actual.environmentSession, sessionStateAtom: () => session },
    useEnvironmentScope: (_id: unknown, scope: string) =>
      scope === AuthOrchestrationOperateScope ||
      (fixture.processes && scope === AuthEnvironmentMaintainScope),
    readEnvironmentScope: () => fixture.permitted,
  };
});
vi.mock("../../state/server", async (original) => {
  const actual = await original<typeof import("../../state/server")>();
  const { Atom } = await import("effect/reactivity");
  const empty = Atom.make(null);
  const processes = Atom.make(null);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      traceDiagnostics: () => empty,
      processDiagnostics: () => processes,
      processResourceHistory: () => empty,
    },
  };
});
vi.mock("../../state/query", async (original) => ({
  ...(await original<typeof import("../../state/query")>()),
  useEnvironmentQuery: (query: unknown) => ({
    data:
      query === environmentSession.sessionStateAtom(EnvironmentId.make("diagnostics-fixture"))
        ? { authenticated: true, scopes: [AuthDiagnosticsReadScope] }
        : fixture.processes &&
            query ===
              serverEnvironment.processDiagnostics({
                environmentId: EnvironmentId.make("diagnostics-fixture"),
                input: {},
              })
          ? processData
          : null,
    error: null,
    isPending: false,
    refresh: fixture.refresh,
  }),
}));
vi.mock("../../editorPreferences", async (original) => ({
  ...(await original<typeof import("../../editorPreferences")>()),
  useOpenInPreferredEditor: () => fixture.open,
}));
vi.mock("../../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  return {
    ...actual,
    useAtomCommand: (
      command: Parameters<typeof actual.useAtomCommand>[0],
      options: Parameters<typeof actual.useAtomCommand>[1],
    ) =>
      command === serverEnvironment.signalProcess
        ? fixture.signal
        : actual.useAtomCommand(command, options),
  };
});
vi.mock("../../i18n/readWebI18n", () => ({
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
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: fixture.toast },
}));
vi.mock("./ResourceTelemetryDiagnostics", async (original) => ({
  ...(await original<typeof import("./ResourceTelemetryDiagnostics")>()),
  ResourceTelemetryDiagnostics: () => null,
}));
vi.mock("./TelemetryExportSettings", async (original) => ({
  ...(await original<typeof import("./TelemetryExportSettings")>()),
  TelemetryExportSettings: () => null,
}));
import { ensureLocalApi } from "../../localApi";
import { serverEnvironment } from "../../state/server";
import { environmentSession } from "../../state/session";
import { DiagnosticsSettingsPanel } from "./DiagnosticsSettings";

const processData: ServerProcessDiagnosticsResult = {
  serverPid: 122,
  readAt: DateTime.makeUnsafe("2026-11-15T00:00:00Z"),
  processCount: 1,
  totalRssBytes: 100,
  totalCpuPercent: 0,
  processes: [
    {
      pid: 123,
      startTimeMs: 456,
      ppid: 122,
      pgid: Option.none(),
      status: "running",
      cpuPercent: 0,
      rssBytes: 100,
      elapsed: "1:00",
      command: "fixture/$&/{process}",
      depth: 0,
      childPids: [],
    },
  ],
  error: Option.none(),
};
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
        <DiagnosticsSettingsPanel />
      </AppAtomRegistryProvider>
    </WebI18nContext>
  );
}
function setup() {
  fixture.processes = false;
  fixture.locale = "en";
  fixture.toast.mockReset();
  fixture.open.mockReset();
  fixture.signal.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  fixture.refresh.mockReset();
  fixture.permitted = true;
}
it("keeps cached owned open logs failure current without reopening the editor", async () => {
  setup();
  let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
  fixture.open.mockReturnValue(
    new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en"));
  await page.getByRole("button", { name: "Open logs folder", exact: true }).click();
  await screen.rerender(surface("zh-CN"));
  finish(AsyncResult.failure(Cause.die(null)));
  // The old producer captures English at invocation, so this is a real visible-source mismatch.
  await expect.poll(() => screen.container.textContent).toContain("无法打开日志文件夹。");
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale));
    await expect
      .element(
        page.getByText(locale === "en" ? "Unable to open logs folder." : "无法打开日志文件夹。", {
          exact: true,
        }),
      )
      .toBeVisible();
  }
  expect(fixture.open).toHaveBeenCalledExactlyOnceWith(fixture.logsPath);
  expect(fixture.signal).not.toHaveBeenCalled();
  expect(fixture.refresh).not.toHaveBeenCalled();
});
it.each(["Unable to open logs folder.", ""])("preserves raw open logs error %s", async (raw) => {
  setup();
  fixture.open.mockResolvedValue(AsyncResult.failure(Cause.die(new Error(raw))));
  await using screen = await render(surface("en"));
  await page.getByRole("button", { name: "Open logs folder", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Open logs folder", exact: true }))
    .toBeEnabled();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale));
    if (raw) await expect.element(page.getByText(raw, { exact: true })).toBeVisible();
    await expect
      .element(page.getByText("无法打开日志文件夹。", { exact: true }))
      .not.toBeInTheDocument();
  }
  expect(fixture.open).toHaveBeenCalledExactlyOnceWith(fixture.logsPath);
});
it.each(["interrupted", "denied"] as const)("keeps open logs %s silent", async (mode) => {
  setup();
  fixture.open.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
  await using screen = await render(surface("en"));
  if (mode === "denied") fixture.permitted = false;
  await page.getByRole("button", { name: "Open logs folder", exact: true }).click();
  await screen.rerender(surface("zh-CN"));
  await expect
    .element(page.getByText("无法打开日志文件夹。", { exact: true }))
    .not.toBeInTheDocument();
  expect(fixture.open).toHaveBeenCalledTimes(mode === "denied" ? 0 : 1);
  expect(fixture.signal).not.toHaveBeenCalled();
  expect(fixture.refresh).not.toHaveBeenCalled();
});

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "uses settlement locale for diagnostics signal failure: %s",
  async (kind) => {
    setup();
    fixture.processes = true;
    let finish!: (value: ReturnType<typeof AsyncResult.failure>) => void;
    const pending = new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
      finish = resolve;
    });
    fixture.signal.mockReturnValue(pending);
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await pending;
        });
        fixture.processes = false;
        fixture.locale = "en";
      },
    };
    const send = page.getByRole("button", { name: "Send SIGINT", exact: true });
    await send.click();
    expect(fixture.signal).toHaveBeenCalledExactlyOnceWith({
      environmentId: EnvironmentId.make("diagnostics-fixture"),
      input: { pid: 123, startTimeMs: 456, signal: "SIGINT" },
    });
    await expect.element(send).toBeDisabled();
    await act(async () => {
      send.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(fixture.signal).toHaveBeenCalledTimes(1);
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    const cause =
      kind === "interrupted"
        ? Cause.interrupt()
        : Cause.die(
            kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {signal}" : ""),
          );
    await act(async () => {
      finish(AsyncResult.failure(cause));
      await pending;
    });
    if (kind === "interrupted") expect(fixture.toast).not.toHaveBeenCalled();
    else
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法发送 SIGINT",
        description:
          kind === "owned" ? "发送 SIGINT 失败。" : kind === "raw" ? "Literal $& {signal}" : "",
      });
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    await expect.element(send).toBeEnabled();
    expect(fixture.signal).toHaveBeenCalledTimes(1);
    expect(fixture.refresh).not.toHaveBeenCalled();
    expect(fixture.open).not.toHaveBeenCalled();
  },
);
it("blocks diagnostics signal after call-time scope denial", async () => {
  setup();
  fixture.processes = true;
  await using _screen = await render(surface("en"));
  const send = page.getByRole("button", { name: "Send SIGINT", exact: true });
  await expect.element(send).toBeEnabled();
  fixture.permitted = false;
  await send.click();
  expect(fixture.signal).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
  expect(fixture.refresh).not.toHaveBeenCalled();
});

it.each(["owned", "raw", "empty", "stale"] as const)(
  "uses settlement locale for diagnostics non-signaled result: %s",
  async (kind) => {
    setup();
    fixture.processes = true;
    // Empty is defensive consumer coverage, not a valid wire message; stale tests recognizer compatibility.
    const message =
      kind === "owned"
        ? Option.none<string>()
        : Option.some(
            kind === "raw"
              ? "Literal $& {signal}"
              : kind === "empty"
                ? ""
                : "Process is not a live descendant of the server.",
          );
    const value: ServerSignalProcessResult = {
      pid: 123,
      signal: "SIGINT",
      signaled: false,
      message,
    };
    const result = AsyncResult.success(value);
    let finish!: (value: typeof result) => void;
    const pending = new Promise<typeof result>((resolve) => {
      finish = resolve;
    });
    fixture.signal.mockReturnValue(pending);
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(result);
          await pending;
        });
        fixture.processes = false;
        fixture.locale = "en";
      },
    };
    const send = page.getByRole("button", { name: "Send SIGINT", exact: true });
    await send.click();
    expect(fixture.signal).toHaveBeenCalledExactlyOnceWith({
      environmentId: EnvironmentId.make("diagnostics-fixture"),
      input: { pid: 123, startTimeMs: 456, signal: "SIGINT" },
    });
    await expect.element(send).toBeDisabled();
    await act(async () => {
      send.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(fixture.signal).toHaveBeenCalledTimes(1);
    expect(fixture.refresh).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      finish(result);
      await pending;
    });
    expect(fixture.toast).toHaveBeenCalledExactlyOnceWith(
      kind === "stale"
        ? {
            type: "info",
            title: "进程已退出",
            description: "此进程已不再是 T3 服务器的子进程，可能已经退出。",
          }
        : {
            type: "error",
            title: "无法发送 SIGINT",
            description:
              kind === "owned" ? "发送 SIGINT 失败。" : kind === "raw" ? "Literal $& {signal}" : "",
          },
    );
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    await expect.element(send).toBeEnabled();
    expect(fixture.toast).toHaveBeenCalledTimes(1);
    expect(fixture.signal).toHaveBeenCalledTimes(1);
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.open).not.toHaveBeenCalled();
  },
);

it.each(["owned", "raw", "empty", "cancel"] as const)(
  "uses settlement locale for diagnostics signal confirmation: %s",
  async (kind) => {
    setup();
    fixture.processes = true;
    let reject!: (error: unknown) => void;
    let resolve!: (value: boolean) => void;
    const pending = new Promise<boolean>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void pending.catch(() => undefined);
    const confirm = vi.spyOn(ensureLocalApi().dialogs, "confirm").mockReturnValue(pending);
    using _restore = {
      [Symbol.dispose]() {
        confirm.mockRestore();
        fixture.processes = false;
        fixture.locale = "en";
      },
    };
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve(false);
          await pending.catch(() => undefined);
        });
      },
    };
    const kill = page.getByRole("button", { name: "Send SIGKILL", exact: true });
    await kill.click();
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      "Send SIGKILL to process 123? This cannot be handled by the process.",
      { variant: "destructive" },
    );
    await expect.element(kill).toBeDisabled();
    await act(async () => {
      kill.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      if (kind === "cancel") resolve(false);
      else
        reject(kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {confirm}" : ""));
      await pending.catch(() => undefined);
    });
    if (kind === "cancel") expect(fixture.toast).not.toHaveBeenCalled();
    else
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法确认信号操作",
        description:
          kind === "owned" ? "发送 SIGKILL 失败。" : kind === "raw" ? "Literal $& {confirm}" : "",
      });
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    await expect.element(kill).toBeEnabled();
    await expect.element(page.getByText("fixture/$&/{process}", { exact: true })).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fixture.signal).not.toHaveBeenCalled();
    expect(fixture.refresh).not.toHaveBeenCalled();
    expect(fixture.open).not.toHaveBeenCalled();
  },
);

import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import {
  AuthDiagnosticsReadScope,
  AuthOrchestrationOperateScope,
  EnvironmentId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { render } from "../../../test/render";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";

const fixture = vi.hoisted(() => ({
  open: vi.fn(),
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
    useEnvironmentScope: (_id: unknown, scope: string) => scope === AuthOrchestrationOperateScope,
    readEnvironmentScope: () => fixture.permitted,
  };
});
vi.mock("../../state/server", async (original) => {
  const actual = await original<typeof import("../../state/server")>();
  const { Atom } = await import("effect/reactivity");
  const empty = Atom.make(null);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      traceDiagnostics: () => empty,
      processDiagnostics: () => empty,
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
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: () => fixture.signal,
}));
vi.mock("./ResourceTelemetryDiagnostics", async (original) => ({
  ...(await original<typeof import("./ResourceTelemetryDiagnostics")>()),
  ResourceTelemetryDiagnostics: () => null,
}));
vi.mock("./TelemetryExportSettings", async (original) => ({
  ...(await original<typeof import("./TelemetryExportSettings")>()),
  TelemetryExportSettings: () => null,
}));
import { environmentSession } from "../../state/session";
import { DiagnosticsSettingsPanel } from "./DiagnosticsSettings";

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
  await expect.element(page.getByText("无法打开日志文件夹。", { exact: true })).toBeVisible();
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

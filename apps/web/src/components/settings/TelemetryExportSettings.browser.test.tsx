import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { render } from "../../../test/render";
import { DEFAULT_SERVER_SETTINGS, type ServerObservability } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

const { state, updateSettings, checkOtlpEndpoint, checkOtlpEndpointCommand } = vi.hoisted(() => ({
  state: {
    observability: {} as typeof DEFAULT_SERVER_SETTINGS.observability,
    serverConfig: { environment: { capabilities: {} } } as {
      environment: { capabilities: { otlpEndpointCheck?: boolean } };
      observability?: ServerObservability;
    },
  },
  updateSettings: vi.fn(async () => ({ _tag: "Success" as const, value: undefined })),
  checkOtlpEndpoint: vi.fn(async (_request: unknown) => ({
    _tag: "Success" as const,
    value: { _tag: "Accepted" as const, latencyMs: 12 },
  })),
  checkOtlpEndpointCommand: { permissionAtom: () => null },
}));

vi.mock(import("@effect/atom-react"), async (original) => ({
  ...(await original()),
  useAtomValue: (() => true) as never,
}));
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: unknown) =>
    command === "updateSettings"
      ? updateSettings
      : command === checkOtlpEndpointCommand
        ? checkOtlpEndpoint
        : vi.fn()) as never,
}));
vi.mock(import("../../state/server"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      updateSettings: "updateSettings",
      checkOtlpEndpoint: checkOtlpEndpointCommand,
    } as unknown as typeof actual.serverEnvironment,
  };
});
vi.mock(import("./SettingsScopeContext"), async (original) => ({
  ...(await original()),
  useSettingsScope: (() => ({
    scope: { kind: "environment" },
    environment: {
      environmentId: "env",
      label: "MAC1",
      serverConfig: state.serverConfig,
    },
  })) as never,
}));
vi.mock(import("./useScopedSettings"), async (original) => ({
  ...(await original()),
  useScopedSettings: ((select: (settings: typeof state) => unknown) => select(state)) as never,
}));

import { TelemetryExportSettings } from "./TelemetryExportSettings";

function setup() {
  updateSettings.mockClear();
  checkOtlpEndpoint.mockClear();
  state.serverConfig = { environment: { capabilities: {} } };
}

describe("TelemetryExportSettings", () => {
  it("does not resend a field the user restored after another client changed it", async () => {
    setup();
    state.observability = {
      ...DEFAULT_SERVER_SETTINGS.observability,
      otlpTracesUrl: "http://old/v1/traces",
    };
    await using screen = await render(<TelemetryExportSettings />);

    const { container } = screen;
    const field = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;
    async function replace(id: string, value: string) {
      await userEvent.clear(field(id));
      await userEvent.type(field(id), value);
    }
    await replace("otlpTracesUrl", "http://draft/v1/traces");
    await replace("otlpTracesUrl", "http://old/v1/traces");
    state.observability = { ...state.observability, otlpTracesUrl: "http://other/v1/traces" };
    await screen.rerender(<TelemetryExportSettings />);
    await replace("otlpMetricsUrl", "http://new/v1/metrics");
    const save = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save",
    )!;
    await userEvent.click(save);

    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      environmentId: "env",
      input: { patch: { observability: { otlpMetricsUrl: "http://new/v1/metrics" } } },
    });
    expect(container.textContent).toContain("Saved. Restart the server to apply.");
  });

  it("reports and tests the endpoint the environment set over an empty setting", async () => {
    setup();
    state.observability = { ...DEFAULT_SERVER_SETTINGS.observability, otlpTracesUrl: "" };
    state.serverConfig = {
      environment: { capabilities: { otlpEndpointCheck: true } },
      observability: {
        logsDirectoryPath: "/tmp/logs",
        localTracingEnabled: true,
        otlpTracesUrl: "http://collector/v1/traces",
        otlpTracesSource: "environment",
        otlpTracesVariable: "OTEL_EXPORTER_OTLP_ENDPOINT",
        otlpTracesEnabled: true,
        otlpMetricsEnabled: false,
        otlpLogsEnabled: false,
      },
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
        <TelemetryExportSettings />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));

    await expect
      .element(screen.getByText("Set by environment · Connected · 12 ms"))
      .toBeInTheDocument();
    await expect
      .element(
        screen.getByText("Running: http://collector/v1/traces from OTEL_EXPORTER_OTLP_ENDPOINT"),
      )
      .toBeInTheDocument();
    expect(checkOtlpEndpoint).toHaveBeenCalledExactlyOnceWith({
      environmentId: "env",
      input: { signal: "traces", url: "http://collector/v1/traces" },
    });
    expect(screen.container.querySelector<HTMLInputElement>("#otlpTracesUrl")!.value).toBe("");
    await screen.rerender(surface("zh-CN"));
    await expect
      .element(screen.getByText("由环境设置 · 已连接 · 12 毫秒", { exact: true }))
      .toBeInTheDocument();
    expect(screen.container.textContent).toContain("http://collector/v1/traces");
    expect(screen.container.textContent).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
    expect(checkOtlpEndpoint).toHaveBeenCalledTimes(1);
    expect(updateSettings).not.toHaveBeenCalled();
    await screen.rerender(surface("en"));

    await userEvent.click(screen.getByRole("button", { name: "Test" }).first());

    expect(checkOtlpEndpoint).toHaveBeenCalledTimes(2);
    expect(checkOtlpEndpoint).toHaveBeenLastCalledWith({
      environmentId: "env",
      input: { signal: "traces", url: "http://collector/v1/traces" },
    });
  });
});

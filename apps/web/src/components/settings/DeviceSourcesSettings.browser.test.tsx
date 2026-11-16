import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import * as Cause from "effect/Cause";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import {
  EnvironmentId,
  DevicePlatformAvailability,
  ServerSettings,
  SshDeviceHostConfig,
  type DeviceHostSummary,
} from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { DeviceSourcesSettings, SourcePlatforms } from "./DeviceSourcesSettings";

const decode = Schema.decodeUnknownSync(DevicePlatformAvailability);
const original = "The pool has no iOS devices.";
const marked = decode({
  platform: "ios",
  available: false,
  reason: original,
  reasonMessage: { source: "simlock-device-host", code: "ios-devices-missing" },
});

function platforms(
  locale: ResolvedAppLocale,
  entries: ReadonlyArray<DevicePlatformAvailability>,
  shared: boolean,
) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <SourcePlatforms
        row={{
          key: "test-source",
          title: "Test source",
          description: "",
          shared,
          environments: entries.map((entry, index) => ({
            environmentId: EnvironmentId.make(`environment-${index}`),
            label: `Machine ${index}`,
            added: true,
            platforms: [entry],
          })),
        }}
      />
    </WebI18nContext>
  );
}

it.each([true, false])(
  "switches live platform reasons without changing availability, shared=%s",
  async (shared) => {
    const sdkRoot = "/sdk/Working $&/{sdkRoot}/中文";
    const entry = shared
      ? marked
      : decode({
          platform: "android",
          available: false,
          reason: `Android Emulator is missing from ${sdkRoot}. Install it in Android Studio's SDK Manager.`,
          reasonMessage: { source: "local-device-host", code: "android-emulator-missing", sdkRoot },
        });
    const chinese = shared
      ? "设备池中没有 iOS 设备。"
      : `${sdkRoot} 中缺少 Android 模拟器。请在 Android Studio 的 SDK 管理器中安装。`;
    await using screen = await render(platforms("en", [entry], shared));
    await userEvent.click(screen.getByRole("button"));
    await expect.element(page.getByText(entry.reason!, { exact: true })).toBeVisible();
    await screen.rerender(platforms("zh-CN", [entry], shared));
    await expect.element(page.getByText(chinese, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("button"))
      .toHaveAccessibleName(`Test source: ${shared ? "iOS" : "Android"} 不可用`);
    await screen.rerender(platforms("en", [entry], shared));
    await expect.element(page.getByText(entry.reason!, { exact: true })).toBeVisible();
  },
);

it.each([true, false])(
  "keeps mixed raw and marked reasons separate across machines, shared=%s",
  async (shared) => {
    const raw = decode({ platform: "ios", available: false, reason: original });
    await using screen = await render(platforms("zh-CN", [marked, raw], shared));
    await userEvent.click(screen.getByRole("button"));
    await expect.element(page.getByText("设备池中没有 iOS 设备。", { exact: true })).toBeVisible();
    await expect.element(page.getByText(original, { exact: true })).toBeVisible();
  },
);

it.each([
  undefined,
  { source: "simlock-device-host", code: "future-reason" },
  { source: "local-device-host", code: "ios-devices-missing" },
  { source: "simlock-device-host", code: "android-devices-missing" },
])(
  "leaves same-text wire reasons raw when metadata is absent or mismatched: %j",
  async (reasonMessage) => {
    const entry = decode({ platform: "ios", available: false, reason: original, reasonMessage });
    await using screen = await render(platforms("zh-CN", [entry], true));
    await userEvent.click(screen.getByRole("button"));
    await expect.element(page.getByText(original, { exact: true })).toBeVisible();
  },
);

const fixture = vi.hoisted(() => ({
  active: false,
  allowed: true,
  locale: "en" as "en" | "zh-CN",
  test: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
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
vi.mock("../../state/device", async (original) => {
  const actual = await original<typeof import("../../state/device")>();
  const { Atom, AsyncResult } = await import("effect/reactivity");
  const state = Atom.make(
    AsyncResult.initial<import("@t3tools/contracts").DeviceServiceState, unknown>(false),
  );
  return {
    ...actual,
    deviceEnvironment: {
      ...actual.deviceEnvironment,
      state: (input: Parameters<typeof actual.deviceEnvironment.state>[0]) =>
        fixture.active ? state : actual.deviceEnvironment.state(input),
    },
  };
});
vi.mock("../../state/session", async (original) => {
  const actual = await original<typeof import("../../state/session")>();
  return {
    ...actual,
    readEnvironmentScope: (...args: Parameters<typeof actual.readEnvironmentScope>) =>
      fixture.active ? fixture.allowed : actual.readEnvironmentScope(...args),
  };
});
vi.mock("../../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  return {
    ...actual,
    useAtomCommand: ((command, options) => {
      if (fixture.active && (command as unknown) === deviceEnvironment.testHost)
        return fixture.test;
      if (fixture.active && (command as unknown) === deviceEnvironment.list) return fixture.list;
      if (fixture.active && (command as unknown) === serverEnvironment.updateSettings)
        return fixture.update;
      return actual.useAtomCommand(command, options);
    }) as typeof actual.useAtomCommand,
  };
});
vi.mock("./SettingsScopeContext", async (original) => {
  const actual = await original<typeof import("./SettingsScopeContext")>();
  return {
    ...actual,
    useSettingsScope: (() =>
      fixture.active
        ? {
            scope: { kind: "environment" },
            environment: scopedEnvironment,
            environments: [scopedEnvironment],
            connectedEnvironments: [scopedEnvironment],
            targets: [],
            target: null,
          }
        : actual.useSettingsScope()) as typeof actual.useSettingsScope,
  };
});
vi.mock("~/i18n/readWebI18n", async (original) => {
  const actual = await original<typeof import("~/i18n/readWebI18n")>();
  return {
    ...actual,
    readWebI18n: () => {
      if (!fixture.active) return actual.readWebI18n();
      const locale = fixture.locale;
      return {
        locale,
        t: (
          key: Parameters<typeof translateWebMessage>[1],
          values: Parameters<typeof translateWebMessage>[2],
        ) => translateWebMessage(locale, key, values),
      };
    },
  };
});
import { deviceEnvironment } from "../../state/device";
import { serverEnvironment } from "../../state/server";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import { toastManager } from "../ui/toast";
const host = Schema.decodeSync(SshDeviceHostConfig)({
  id: "fixture-host",
  label: "Literal $& {host}",
  target: "fixture.invalid",
  port: 2222,
});
const settings = Schema.decodeSync(ServerSettings)({
  enableDeviceSupport: true,
  deviceHosts: [host],
});
const environmentId = EnvironmentId.make("device-test-fixture");
const scopedEnvironment = {
  environmentId,
  label: "Literal $& {environment}",
  displayUrl: null,
  connection: { phase: "connected" as const },
  serverConfig: { settings },
};

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "uses settlement locale for device host test failure: %s",
  async (kind) => {
    fixture.active = true;
    fixture.locale = "en";
    fixture.test.mockReset();
    fixture.update.mockReset();
    fixture.list.mockReset();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    stack.defer(() => {
      fixture.active = false;
      fixture.locale = "en";
    });
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    let finish!: (result: AsyncResult.AsyncResult<DeviceHostSummary, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<DeviceHostSummary, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.test.mockReturnValue(pending);
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
          <DeviceSourcesSettings supportsEas={false} supportsSimlock={false} />
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
    await screen.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Test connection", exact: true }).click();
    expect(fixture.test).toHaveBeenCalledExactlyOnceWith({ environmentId, input: host });
    await expect.element(screen.getByText("Testing connection", { exact: true })).toBeVisible();
    await screen.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Test connection", exact: true }).click();
    expect(fixture.test).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {error}" : ""),
              ),
        ),
      );
      await pending;
    });
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "Literal $& {host}：1 个环境中有 1 个失败",
      description:
        "Literal $& {environment}: " +
        (kind === "owned"
          ? "null"
          : kind === "raw"
            ? "Literal $& {error}"
            : kind === "empty"
              ? ""
              : "All fibers interrupted without error"),
    });
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    await expect.element(screen.getByRole("button", { name: "More", exact: true })).toBeEnabled();
    await expect
      .element(screen.getByText("Testing connection", { exact: true }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText(host.label, { exact: true })).toBeVisible();
    expect(scopedEnvironment.serverConfig.settings).toBe(settings);
    expect(fixture.test).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.list).not.toHaveBeenCalled();
  },
);

it.each([
  { kind: "ssh", locale: "zh-CN" },
  { kind: "local", locale: "zh-CN" },
  { kind: "ssh", locale: "en" },
] as const)(
  "uses settlement locale for device host test success: $kind $locale",
  async ({ kind, locale }) => {
    fixture.active = true;
    fixture.locale = "en";
    fixture.test.mockReset();
    fixture.update.mockReset();
    fixture.list.mockReset();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    stack.defer(() => {
      fixture.active = false;
      fixture.locale = "en";
    });
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    let finish!: (result: AsyncResult.AsyncResult<DeviceHostSummary, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<DeviceHostSummary, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.test.mockReturnValue(pending);
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
          <DeviceSourcesSettings supportsEas={false} supportsSimlock={false} />
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
    await screen.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Test connection", exact: true }).click();
    expect(fixture.test).toHaveBeenCalledExactlyOnceWith({ environmentId, input: host });
    await expect.element(screen.getByText("Testing connection", { exact: true })).toBeVisible();
    await screen.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Test connection", exact: true }).click();
    expect(fixture.test).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    fixture.locale = locale;
    await screen.rerender(surface(locale));
    const result: DeviceHostSummary = {
      id: kind === "local" ? "local" : host.id,
      label: host.label,
      kind,
      platforms: [{ platform: "ios", available: true }],
      hubInstalled: false,
      agentDeviceInstalled: false,
    };
    await act(async () => {
      finish(AsyncResult.success(result));
      await pending;
    });
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title:
        locale === "zh-CN"
          ? "Literal $& {host}：连接检查通过"
          : "Literal $& {host}: connection checks passed",
      description:
        locale === "zh-CN"
          ? "已连接，或在每个所选环境中已可在本地使用。"
          : "Connected or already available locally on each selected environment.",
    });
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    await expect.element(screen.getByRole("button", { name: "More", exact: true })).toBeEnabled();
    await expect
      .element(screen.getByText("Testing connection", { exact: true }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText(host.label, { exact: true })).toBeVisible();
    expect(scopedEnvironment.serverConfig.settings).toBe(settings);
    expect(fixture.test).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.list).not.toHaveBeenCalled();
  },
);

it.each(["owned", "raw", "empty", "interrupted", "denied"] as const)(
  "uses settlement locale for device host removal failure: %s",
  async (kind) => {
    fixture.active = true;
    fixture.allowed = true;
    fixture.locale = "en";
    fixture.test.mockReset();
    fixture.update.mockReset();
    fixture.list.mockReset();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    expect(registry.get(primaryEnvironmentIdAtom)).toBeNull();
    stack.defer(() => {
      fixture.active = false;
      fixture.allowed = true;
      fixture.locale = "en";
    });
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    let finish!: (result: AsyncResult.AsyncResult<never, unknown>) => void;
    const pending = new Promise<AsyncResult.AsyncResult<never, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.update.mockReturnValue(pending);
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
          <DeviceSourcesSettings supportsEas={false} supportsSimlock={false} />
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
    await screen.getByRole("button", { name: "More", exact: true }).click();
    const remove = page.getByRole("menuitem", { name: "Remove", exact: true });
    await expect.element(remove).toBeEnabled();
    if (kind === "denied") fixture.allowed = false;
    await remove.click();
    if (kind === "denied") {
      expect(fixture.update).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "Device host not removed everywhere",
        description: translateWebMessage("en", "audit6.settingsDenied", {
          labels: "Literal $& {environment}",
        }),
      });
    } else {
      expect(fixture.update).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: { patch: { deviceHosts: [] } },
      });
      const more = screen.getByRole("button", { name: "More", exact: true });
      await expect.element(more).toBeDisabled();
      await expect
        .element(screen.getByRole("button", { name: "Edit", exact: true }))
        .toBeDisabled();
      await act(() => {
        more.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
      });
      expect(fixture.update).toHaveBeenCalledTimes(1);
      expect(toast).not.toHaveBeenCalled();
      fixture.locale = "zh-CN";
      await screen.rerender(surface("zh-CN"));
      await act(async () => {
        finish(
          AsyncResult.failure(
            kind === "interrupted"
              ? Cause.interrupt()
              : Cause.fail(
                  kind === "owned" ? null : new Error(kind === "raw" ? "Literal $& {write}" : ""),
                ),
          ),
        );
        await pending;
      });
      expect(toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "部分环境中的设备主机未能移除",
        description:
          "Literal $& {environment}: " +
          (kind === "owned"
            ? "null"
            : kind === "raw"
              ? "Literal $& {write}"
              : kind === "empty"
                ? ""
                : "All fibers interrupted without error"),
      });
    }
    fixture.locale = "en";
    await screen.rerender(surface("en"));
    await expect.element(screen.getByRole("button", { name: "More", exact: true })).toBeEnabled();
    await expect.element(screen.getByRole("button", { name: "Edit", exact: true })).toBeEnabled();
    await expect.element(screen.getByText(host.label, { exact: true })).toBeVisible();
    expect(scopedEnvironment.serverConfig.settings).toBe(settings);
    expect(settings.deviceHosts).toEqual([host]);
    expect(fixture.update).toHaveBeenCalledTimes(kind === "denied" ? 0 : 1);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(fixture.test).not.toHaveBeenCalled();
    expect(fixture.list).not.toHaveBeenCalled();
  },
);

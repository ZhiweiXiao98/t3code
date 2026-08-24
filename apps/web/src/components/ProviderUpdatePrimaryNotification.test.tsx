import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { reactHookHarness as hooks } from "../test/reactHookHarness";

const testState = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  providers: [] as ServerProvider[],
  updateProvider: vi.fn(),
}));

const toastState = vi.hoisted(() => ({
  nextId: 0,
  add: vi.fn((_input: unknown) => ++toastState.nextId),
  update: vi.fn(),
  close: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return {
    ...actual,
    useCallback: reactHookHarness.useCallback,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useMemo: reactHookHarness.useMemo,
    useRef: reactHookHarness.useRef,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => testState.providers }));
vi.mock("../state/server", () => ({
  primaryServerProvidersAtom: Symbol("primaryServerProviders"),
  serverEnvironment: { updateProvider: Symbol("updateProvider") },
}));
vi.mock("../state/environments", () => ({
  usePrimaryEnvironment: () => ({ environmentId: EnvironmentId.make("primary") }),
}));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: () => testState.updateProvider,
}));
vi.mock("../providerUpdateDismissal", () => ({
  useDismissedProviderUpdateNotificationKeys: () => ({
    dismissedNotificationKeys: new Set<string>(),
    dismissNotificationKey: vi.fn(),
  }),
}));
vi.mock("../i18n/WebI18nProvider", () => ({
  useI18n: () => ({
    locale: testState.locale,
    t: (key: string, values?: Readonly<Record<string, string | number>>) => {
      const copy = {
        en: {
          "providerUpdate.title.single": `Update Available: ${String(values?.provider ?? "")} ${String(values?.version ?? "")}`,
          "providerUpdate.description.installOrSettings":
            "Install the update now or review provider settings.",
          "providerUpdate.action.settings": "Settings",
          "providerUpdate.action.update": "Update",
        },
        "zh-CN": {
          "providerUpdate.title.single": `可用更新：${String(values?.provider ?? "")} ${String(values?.version ?? "")}`,
          "providerUpdate.description.installOrSettings":
            "立即安装更新，或前往服务提供方设置查看。",
          "providerUpdate.action.settings": "设置",
          "providerUpdate.action.update": "更新",
        },
      } as const;
      return copy[testState.locale][key as keyof (typeof copy)["en"]];
    },
  }),
}));
vi.mock("./chat/providerIconUtils", () => ({ PROVIDER_ICON_BY_PROVIDER: {} }));
vi.mock("./ui/toast", () => ({
  stackedThreadToast: <T,>(value: T) => value,
  toastManager: {
    add: toastState.add,
    update: toastState.update,
    close: toastState.close,
  },
}));

import { ProviderUpdatePrimaryNotification } from "./ProviderUpdatePrimaryNotification";

function updateCandidate(): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    driver: ProviderDriverKind.make("claudeAgent"),
    enabled: true,
    installed: true,
    version: "2.1.231",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-14T12:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    versionAdvisory: {
      status: "behind_latest",
      currentVersion: "2.1.231",
      latestVersion: "2.1.232",
      updateCommand: "claude update",
      canUpdate: true,
      checkedAt: "2026-08-14T12:00:00.000Z",
      message: "Update available.",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function renderNotification(): void {
  hooks.beginRender();
  ProviderUpdatePrimaryNotification();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("ProviderUpdatePrimaryNotification lifecycle", () => {
  beforeEach(() => {
    hooks.reset();
    testState.locale = "en";
    testState.providers = [updateCandidate()];
    testState.updateProvider.mockReset();
    toastState.nextId = 0;
    toastState.add.mockClear();
    toastState.update.mockClear();
    toastState.close.mockClear();
  });

  it("uses the latest language when an update settles without duplicating progress", async () => {
    const result = deferred<ReturnType<typeof AsyncResult.failure>>();
    testState.updateProvider.mockReturnValue(result.promise);

    renderNotification();
    const prompt = toastState.add.mock.calls[0]?.[0] as {
      actionProps?: { onClick?: () => void };
    };
    prompt.actionProps?.onClick?.();

    testState.locale = "zh-CN";
    renderNotification();
    result.resolve(AsyncResult.failure(Cause.die(new Error("Update command failed"))));
    await flushPromises();

    const failedUpdate = toastState.add.mock.calls.at(-1)?.[0] as {
      actionProps?: { children?: string };
    };
    expect(failedUpdate.actionProps?.children).toBe("设置");

    testState.locale = "en";
    renderNotification();
    expect(toastState.add).toHaveBeenCalledTimes(2);
    expect(toastState.update).not.toHaveBeenCalled();
    expect(testState.updateProvider).toHaveBeenCalledOnce();
  });
});

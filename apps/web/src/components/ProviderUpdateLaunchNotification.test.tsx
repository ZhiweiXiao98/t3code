import type { ReactElement } from "react";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { reactHookHarness as hooks } from "../test/reactHookHarness";
import type {
  LocalEnvironmentUpdateGroup,
  ProviderUpdateCandidate,
} from "./ProviderUpdateLaunchNotification.logic";

const testState = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  groups: [] as LocalEnvironmentUpdateGroup[],
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
    useState: reactHookHarness.useState,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("~/state/environments", () => ({ useEnvironments: () => ({ environments: [] }) }));
vi.mock("~/connection/desktopLocal", () => ({
  isDesktopLocalConnectionTarget: () => false,
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
        },
        "zh-CN": {
          "providerUpdate.title.single": `可用更新：${String(values?.provider ?? "")} ${String(values?.version ?? "")}`,
          "providerUpdate.description.installOrSettings":
            "立即安装更新，或前往服务提供方设置查看。",
          "providerUpdate.action.settings": "设置",
        },
      } as const;
      return copy[testState.locale][key as keyof (typeof copy)["en"]];
    },
  }),
}));
vi.mock("./ProviderUpdateLaunchNotification.environments", () => ({
  useLocalEnvironmentUpdateGroups: () => ({
    groups: testState.groups,
    isAnySettling: false,
  }),
}));
vi.mock("./ProviderUpdateEnvironmentRows", () => ({
  ProviderUpdateEnvironmentRows: () => null,
}));
vi.mock("./ProviderUpdatePrimaryNotification", () => ({
  ProviderUpdatePrimaryNotification: () => null,
}));
vi.mock("./ui/toast", () => ({
  stackedThreadToast: <T,>(value: T) => value,
  toastManager: {
    add: toastState.add,
    update: toastState.update,
    close: toastState.close,
  },
}));

import { ProviderUpdateEnvironmentsNotification } from "./ProviderUpdateLaunchNotification";

function updateCandidate(): ProviderUpdateCandidate {
  return {
    instanceId: ProviderInstanceId.make("claudeAgent-wsl"),
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
  } satisfies ServerProvider as ProviderUpdateCandidate;
}

function renderNotification(): void {
  hooks.beginRender();
  ProviderUpdateEnvironmentsNotification();
}

describe("ProviderUpdateEnvironmentsNotification lifecycle", () => {
  beforeEach(() => {
    hooks.reset();
    testState.locale = "en";
    const candidate = updateCandidate();
    testState.groups = [
      {
        environmentId: EnvironmentId.make("wsl"),
        label: "WSL",
        isPrimary: false,
        isSettling: false,
        candidates: [candidate],
        providers: [candidate],
      },
    ];
    toastState.nextId = 0;
    toastState.add.mockClear();
    toastState.update.mockClear();
    toastState.close.mockClear();
  });

  it("relocalizes an interacted toast after its current notification key clears", () => {
    renderNotification();
    const prompt = toastState.add.mock.calls[0]?.[0] as {
      description?: ReactElement<{ onInteract?: () => void }>;
    };
    prompt.description?.props.onInteract?.();

    testState.groups = [];
    renderNotification();
    testState.locale = "zh-CN";
    renderNotification();

    const localizedUpdate = toastState.update.mock.calls.at(-1)?.[1] as {
      title?: string;
      actionProps?: { children?: string };
    };
    expect(localizedUpdate.title).toBe("可用更新：Claude v2.1.232");
    expect(localizedUpdate.actionProps?.children).toBe("设置");
    expect(toastState.add).toHaveBeenCalledOnce();
    expect(toastState.close).not.toHaveBeenCalled();
  });
});

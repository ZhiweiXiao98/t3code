import {
  EnvironmentId,
  ThreadId,
  DeviceServiceState,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import type { ReactNode } from "react";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";

import type { RightPanelSurface } from "~/rightPanelStore";

import { act, render } from "../../../test/render";

import { DevicePanel } from "./DevicePanel";
import "~/index.css";

type CommandResult =
  | { _tag: "Success"; value: { hostId: string; deviceId: string } }
  | { _tag: "Failure"; cause: unknown };
const mocks = vi.hoisted(() => ({
  open: vi.fn<(request: unknown) => Promise<CommandResult>>(),
  close: vi.fn<(request: unknown) => Promise<CommandResult>>(),
  list: vi.fn<(request: unknown) => Promise<CommandResult>>(),
  openDevice: vi.fn(),
  closeSurface: vi.fn(),
}));
const phone = {
  hostId: "local",
  id: "phone",
  name: "Phone",
  platform: "ios",
  version: "iOS 19",
  booted: false,
  physical: false,
} as const;
const deviceState: DeviceServiceState = {
  hosts: [
    {
      id: "local",
      kind: "local",
      label: "This Mac",
      platforms: [{ platform: "ios", available: true }],
      hubInstalled: true,
      agentDeviceInstalled: true,
    },
  ],
  hostStatus: "ready",
  hostStatuses: { local: { status: "ready" } },
  devices: [phone],
  sessions: [
    {
      threadId: ThreadId.make("thread-1"),
      hostId: "local",
      deviceId: "phone",
      platform: "ios",
      openedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  onboardingCompleted: true,
  agentAccessEnabled: true,
  hubBasePath: "/api/device-hub",
  revision: 1,
};
let currentState = deviceState;
// One probe per environment, however many views mount it; each probe sends one list.
vi.mock("~/state/device", async () => {
  const Effect = await import("effect/Effect");
  const { AsyncResult, Atom } = await import("effect/reactivity");
  return {
    deviceEnvironment: { list: "list", open: "open", close: "close" },
    deviceHostProbeAtom: Atom.family((environmentId: string) =>
      Atom.make(() => Effect.promise(() => mocks.list({ environmentId, input: {} }))),
    ),
    NO_DEVICE_PROBE_ATOM: Atom.make(AsyncResult.initial<void, never>()),
    useDeviceState: () => ({ state: currentState, loaded: true }),
  };
});
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: string) =>
    command === "open"
      ? mocks.open
      : command === "close"
        ? mocks.close
        : command === "list"
          ? mocks.list
          : () => Promise.resolve({ _tag: "Success", value: {} }),
}));
vi.mock("~/state/query", () => ({ formatEnvironmentQueryError: () => "Device failed" }));
vi.mock("~/rightPanelStore", () => ({
  useRightPanelStore: {
    getState: () => ({
      byThreadKey: {},
      openDevice: mocks.openDevice,
      closeSurface: mocks.closeSurface,
    }),
  },
  selectThreadRightPanelState: () => ({ isOpen: false, activeSurfaceId: null, surfaces: [] }),
}));
vi.mock("~/components/device/DeviceHostUpdates", () => ({ DeviceHostUpdates: () => null }));
vi.mock("~/components/device/DeviceWorkspace", () => ({
  DeviceWorkspace: ({ onPowerOff }: { onPowerOff: () => void }) => (
    <button onClick={onPowerOff}>Power off</button>
  ),
}));
vi.mock("~/components/preview/PreviewPanelShell", () => ({
  PreviewPanelShell: ({ children }: { children: ReactNode }) => (
    <div className="flex h-full min-h-0 flex-col">{children}</div>
  ),
}));

const threadA = {
  environmentId: EnvironmentId.make("environment-a"),
  threadId: ThreadId.make("thread-1"),
};
// The panel stays mounted across both kinds of switch.
const switches = [
  ["another thread", { environmentId: threadA.environmentId, threadId: ThreadId.make("thread-2") }],
  [
    "the same thread id in another environment",
    { ...threadA, environmentId: EnvironmentId.make("environment-b") },
  ],
] as const;
const threadB = switches[0][1];
const picker: Extract<RightPanelSurface, { kind: "device" }> = { id: "device", kind: "device" };
const phoneTarget = { hostId: "local", deviceId: "phone", platform: "ios", name: "Phone" };
const opened = { _tag: "Success", value: { hostId: "local", deviceId: "phone" } } as const;
const failed = { _tag: "Failure", cause: new Error("boom") } as const;

const deferred = () => {
  let settle!: (result: CommandResult) => void;
  const promise = new Promise<CommandResult>((resolve) => (settle = resolve));
  return { promise, settle };
};

let container: HTMLDivElement;
// Fixed key and a changing threadRef, as RightPanelSurfaceContent mounts it.
const devicePanel = (threadRef: ScopedThreadRef, surface = picker) => (
  <DevicePanel
    key="device-panel"
    mode="embedded"
    threadRef={threadRef}
    surface={surface}
    visible
    onDismissSetup={() => undefined}
  />
);
const startButton = () => container.querySelector<HTMLButtonElement>('[aria-label="Start Phone"]');
const click = (button: HTMLButtonElement | null) =>
  act(async () => {
    button!.click();
  });
const errors = () => container.querySelectorAll('[role="alert"]');

function setup() {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ _tag: "Success", value: { hostId: "local", deviceId: "" } });
  currentState = deviceState;
  container = document.createElement("div");
  container.style.width = "480px";
  container.style.height = "800px";
}

describe("DevicePanel thread switches", () => {
  it("keeps the latest pick pending across switches away and back", async () => {
    setup();
    const first = deferred();
    const second = deferred();
    const latest = deferred();
    mocks.open
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(latest.promise);
    await using screen = await render(devicePanel(threadA), { container });
    await click(startButton());
    await screen.rerender(devicePanel(threadB));
    await click(startButton());
    await screen.rerender(devicePanel(threadA));
    await click(startButton());

    await act(async () => first.settle(failed));

    expect(startButton()).toBeNull();
    expect(errors()).toHaveLength(0);
    expect(mocks.openDevice).not.toHaveBeenCalled();

    await act(async () => second.settle(opened));

    expect(startButton()).toBeNull();
    expect(mocks.openDevice.mock.calls).toEqual([[threadB, phoneTarget]]);

    await act(async () => latest.settle(opened));

    expect(startButton()?.disabled).toBe(false);
    expect(errors()).toHaveLength(0);
    expect(mocks.openDevice.mock.calls).toEqual([
      [threadB, phoneTarget],
      [threadA, phoneTarget],
    ]);
  });
});

describe("DevicePanel host probe", () => {
  it("probes the hosts once while setup shows inside the panel", async () => {
    setup();
    currentState = { ...deviceState, onboardingCompleted: false };
    // An environment no other test probed, so its probe starts fresh.
    const threadRef = { ...threadA, environmentId: EnvironmentId.make("environment-setup") };
    await using _screen = await render(devicePanel(threadRef), { container });

    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(mocks.list.mock.calls).toEqual([
      [{ environmentId: threadRef.environmentId, input: {} }],
    ]);
  });
});

it("renders setup availability provenance without translating raw device reasons", async () => {
  setup();
  const sdkRoot = "C:\\SDK\\Working $&\\{sdkRoot}\\中文";
  const reason = `Android Emulator is missing from ${sdkRoot}. Install it in Android Studio's SDK Manager.`;
  const decode = Schema.decodeUnknownSync(DeviceServiceState);
  const encode = Schema.encodeSync(DeviceServiceState);
  currentState = decode(
    encode({
      ...deviceState,
      hostStatus: "idle",
      hostStatuses: {},
      devices: [],
      sessions: [],
      onboardingCompleted: false,
      hosts: [
        {
          ...deviceState.hosts[0]!,
          platforms: [
            { platform: "ios", available: false, reason: "Working" },
            {
              platform: "android",
              available: false,
              reason,
              reasonMessage: {
                source: "local-device-host",
                code: "android-emulator-missing",
                sdkRoot,
              },
            },
          ],
        },
      ],
    }),
  );
  const threadRef = {
    ...threadA,
    environmentId: EnvironmentId.make("environment-setup-availability"),
  };
  const localizedPanel = (locale: "en" | "zh-CN") => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      {devicePanel(threadRef)}
    </WebI18nContext>
  );
  await using screen = await render(localizedPanel("en"), { container });
  await expect.element(page.getByText(reason, { exact: true })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await screen.rerender(localizedPanel("zh-CN"));
  await expect
    .element(
      page.getByText(
        `${sdkRoot} 中缺少 Android 模拟器。请在 Android Studio 的 SDK 管理器中安装。`,
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect.element(page.getByText("Working", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "继续", exact: true })).toBeDisabled();
  await screen.rerender(localizedPanel("en"));
  await expect.element(page.getByText(reason, { exact: true })).toBeVisible();
  currentState = {
    ...currentState,
    hosts: currentState.hosts.map((host) => ({
      ...host,
      platforms: host.platforms.map((platform) => ({ ...platform, reasonMessage: undefined })),
    })),
  };
  await screen.rerender(localizedPanel("zh-CN"));
  await expect.element(page.getByText(reason, { exact: true })).toBeVisible();
  await expect.element(page.getByText("Working", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "继续", exact: true })).toBeDisabled();
});

describe("DevicePanel discovery warning", () => {
  it("a dismissal hides only the cause it was made for", async () => {
    setup();
    const withCause = (detail: string): DeviceServiceState => ({
      ...deviceState,
      hostStatuses: { local: { status: "ready", detail, incompletePlatforms: ["ios"] } },
    });
    const warning = "iOS list on This Mac may be incomplete.";
    currentState = withCause("first cause");
    await using screen = await render(devicePanel(threadA), { container });

    await screen.getByRole("button", { name: "Dismiss device warning for This Mac" }).click();
    await screen.rerender(devicePanel(threadA));
    await expect.element(screen.getByText(warning)).not.toBeInTheDocument();

    currentState = withCause("second cause");
    await screen.rerender(devicePanel(threadA));
    await expect.element(screen.getByText(warning)).toBeVisible();
  });
});

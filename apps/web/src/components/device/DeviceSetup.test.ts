import type { DeviceServiceState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deviceHubReadiness, platformSetupStatus } from "./DeviceSetup";

const deviceState = (overrides: Partial<DeviceServiceState> = {}): DeviceServiceState => ({
  hosts: [
    {
      id: "local",
      kind: "local",
      label: "This machine",
      hubInstalled: false,
      agentDeviceInstalled: false,
      platforms: [
        { platform: "ios", available: true },
        { platform: "android", available: true },
      ],
    },
  ],
  hostStatus: "ready",
  hostStatuses: {},
  devices: [],
  sessions: [],
  onboardingCompleted: false,
  agentAccessEnabled: false,
  hubBasePath: "/api/device-hub",
  revision: 0,
  ...overrides,
});

describe("device setup guidance", () => {
  it("waits for complete discovery before advising device setup", () => {
    const state = deviceState({
      hostStatus: "idle",
      hosts: [{ ...deviceState().hosts[0]!, id: "remote", kind: "ssh" }],
      hostStatuses: { remote: { status: "ready", androidDiscoveryIncomplete: true } },
    });
    expect(platformSetupStatus(state, "android").message).toContain("may be incomplete");
    expect(platformSetupStatus(state, "ios").message).toContain("Xcode Settings");
    expect(
      platformSetupStatus({ ...state, hostStatuses: { remote: { status: "ready" } } }, "android")
        .message,
    ).toContain("Device Manager");
    expect(
      platformSetupStatus(
        { ...state, hostStatuses: { remote: { status: "ready", incompletePlatforms: ["ios"] } } },
        "ios",
      ).message,
    ).toContain("discovery reported a problem");
  });

  it("counts a remote device host when this machine has no simulator tooling", () => {
    const state = deviceState({
      hostStatus: "idle",
      hostStatuses: { macmini: { status: "ready" } },
      hosts: [
        {
          ...deviceState().hosts[0]!,
          platforms: [
            { platform: "ios", available: false, reason: "Xcode was not found." },
            { platform: "android", available: false, reason: "Android SDK was not found." },
          ],
        },
        {
          id: "macmini",
          kind: "ssh",
          label: "Mac Mini",
          hubInstalled: true,
          agentDeviceInstalled: true,
          platforms: [
            { platform: "ios", available: true },
            { platform: "android", available: false, reason: "Android SDK was not found." },
          ],
        },
      ],
      devices: [
        {
          hostId: "macmini",
          id: "iphone",
          platform: "ios",
          name: "iPhone 16 Pro",
          version: "iOS 27.0",
          booted: true,
          physical: false,
        },
      ],
    });
    expect(deviceHubReadiness(state).ready).toBe(true);
    expect(platformSetupStatus(state, "ios")).toEqual({
      ready: true,
      message: "Xcode and iOS Simulator are available on Mac Mini.",
    });
    expect(platformSetupStatus(state, "android").ready).toBe(false);
  });
});

it("localizes owned iOS discovery failure without altering raw availability reasons", () => {
  const state = deviceState({
    hostStatuses: { local: { status: "ready", incompletePlatforms: ["ios"] } },
  });
  const original = platformSetupStatus(state, "ios");
  expect(original.message).toBe(
    "No iOS devices were listed because device discovery reported a problem.",
  );
  expect(platformSetupStatus(state, "ios", "zh-CN")).toEqual({
    ...original,
    message: "设备发现报告了问题，因此未列出任何 iOS 设备。",
  });
  expect(platformSetupStatus(state, "ios", "en")).toEqual(original);
  const raw = deviceState({
    hosts: [
      {
        ...state.hosts[0]!,
        platforms: [{ platform: "ios", available: false, reason: original.message }],
      },
    ],
  });
  expect(platformSetupStatus(raw, "ios", "zh-CN").message).toBe(original.message);
});

import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  DeviceBootError,
  DeviceServiceState,
  EasDeviceHostConfig,
  SimlockDeviceHostConfig,
  EasDeviceHostConfigs,
  SshDeviceHostConfigs,
} from "./device.ts";
import { secretSettingsFields } from "./settings.ts";

const decodeSshHosts = Schema.decodeUnknownSync(SshDeviceHostConfigs);
const decodeEas = Schema.decodeUnknownSync(EasDeviceHostConfigs);
const encodeState = Schema.encodeSync(DeviceServiceState);
const decodeState = Schema.decodeUnknownSync(DeviceServiceState);
// The host summary as clients decoded it before EAS hosts existed.
const decodeOlderState = Schema.decodeUnknownSync(
  Schema.Struct({
    hosts: Schema.Array(
      Schema.Struct({ id: Schema.String, kind: Schema.Literals(["local", "ssh"]) }),
    ),
  }),
);

describe("configured device hosts", () => {
  it("reads SSH hosts saved before hosts had a kind, and bounds EAS sessions", () => {
    expect(decodeSshHosts([{ id: "mac", label: "Mac mini", target: "julius@mac" }])).toEqual([
      { kind: "ssh", id: "mac", label: "Mac mini", target: "julius@mac" },
    ]);
    expect(decodeEas([{ kind: "eas", id: "eas", label: "EAS Simulator" }])).toEqual([
      {
        kind: "eas",
        id: "eas",
        label: "EAS Simulator",
        accessToken: "",
        maxSessionMinutes: 30,
        idleMinutes: 10,
        maxConcurrentSessions: 2,
      },
    ]);
    expect(() =>
      decodeEas([{ kind: "eas", id: "eas", label: "EAS", maxSessionMinutes: 600 }]),
    ).toThrow();
    // The default idle limit of 10 is not smaller than a session limit of 10.
    expect(() =>
      decodeEas([{ kind: "eas", id: "eas", label: "EAS", maxSessionMinutes: 10 }]),
    ).toThrow();
  });

  it("marks the EAS access token as a secret setting", () => {
    expect(secretSettingsFields(EasDeviceHostConfig)).toEqual(["accessToken"]);
    expect(secretSettingsFields(SimlockDeviceHostConfig)).toEqual(["agentToken"]);
  });
});

describe("device state for clients from before EAS hosts", () => {
  const summary = {
    label: "Host",
    platforms: [],
    hubInstalled: true,
    agentDeviceInstalled: true,
  };
  const state = {
    hosts: [
      { ...summary, id: "local", kind: "local" as const },
      { ...summary, id: "eas", kind: "eas" as const },
      { ...summary, id: "pool", kind: "simlock" as const },
    ],
    hostStatus: "ready" as const,
    hostStatuses: {},
    devices: [],
    sessions: [],
    onboardingCompleted: true,
    agentAccessEnabled: true,
    hubBasePath: "/api/device-hub",
    revision: 1,
  };

  it("preserves reason provenance through host summaries without rejecting newer reasons", () => {
    const reason =
      "Android Emulator is missing from /sdk/$&/{sdkRoot}/中文. Install it in Android Studio's SDK Manager.";
    const platform = { platform: "android" as const, available: false, reason };
    const reasonMessage = {
      source: "local-device-host" as const,
      code: "android-emulator-missing" as const,
      sdkRoot: "/sdk/$&/{sdkRoot}/中文",
    };
    const input = {
      ...state,
      hosts: [
        { ...state.hosts[0]!, platforms: [{ ...platform, reasonMessage }] },
        {
          ...state.hosts[2]!,
          platforms: [
            {
              platform: "ios" as const,
              available: false,
              reason: "The pool has no iOS devices.",
              reasonMessage: {
                source: "simlock-device-host" as const,
                code: "ios-devices-missing" as const,
              },
            },
          ],
        },
      ],
    };
    expect(decodeState(encodeState(input)).hosts).toEqual(input.hosts);
    for (const metadata of [
      undefined,
      { source: "local-device-host", code: "future-reason" },
      { source: "foreign-host", code: "android-emulator-missing", sdkRoot: "/sdk" },
      { source: "local-device-host", code: "ios-devices-missing" },
      { source: "local-device-host", code: "android-emulator-missing" },
      { source: "local-device-host", code: "android-emulator-missing", sdkRoot: 7 },
    ]) {
      const decoded = decodeState({
        ...encodeState(state),
        hosts: [{ ...state.hosts[0]!, platforms: [{ ...platform, reasonMessage: metadata }] }],
      });
      expect(decoded.hosts[0]?.platforms[0]).toMatchObject(platform);
      expect(decoded.hosts[0]?.platforms[0]?.reasonMessage).toBeUndefined();
    }
  });

  it("sends EAS and Simlock hosts where an older client does not look, and reads them back", () => {
    const wire = encodeState(state);
    expect(decodeOlderState(wire).hosts.map((host) => host.id)).toEqual(["local"]);
    expect(decodeState(wire).hosts).toEqual(state.hosts);
  });
});

describe("device boot errors", () => {
  it("gives a next step instead of blaming the environment server when the host sent no details", () => {
    const message = new DeviceBootError({
      hostId: "mac",
      deviceId: "Pixel_10",
      reason: "launch_failed",
      cause: null,
    }).message;
    expect(message).not.toContain("environment server");
    expect(message).toContain("Try again or open another device");
  });

  it("keeps the host's diagnostics when it sent them", () => {
    const message = new DeviceBootError({
      hostId: "mac",
      deviceId: "Pixel_10",
      reason: "launch_failed",
      diagnostics: "emulator: PANIC: Missing emulator engine program for 'x86_64' CPU.",
      cause: null,
    }).message;
    expect(message).toContain("PANIC: Missing emulator engine program");
    expect(message).not.toContain("Try again");
  });
});

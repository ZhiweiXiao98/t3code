import {
  AVAILABLE_CONNECTION_STATE,
  ConnectionBlockedError,
  ConnectionTransientError,
  connectionDiagnosisText,
  presentConnectionDiagnosis,
  type ConnectionAttemptError,
  type ConnectionDiagnosis,
  type ConnectionDiagnosisInput,
  type ConnectionFailureCause,
  type ConnectionHop,
} from "@t3tools/client-runtime/connection";
import { describe, expect, it } from "vite-plus/test";

import { connectionDiagnosisDisplay } from "./connectionDiagnosisDisplay";

const HOST = "Settings/{0}/$&";
const backoff = (lastFailure: ConnectionAttemptError): ConnectionDiagnosisInput => ({
  hostLabel: HOST,
  via: "relay",
  clientVersion: "Settings",
  serverVersion: "{0}/$&",
  state: {
    ...AVAILABLE_CONNECTION_STATE,
    desired: true,
    network: "online",
    phase: "backoff",
    attempt: 3,
    lastFailure,
    retryAt: Date.UTC(2026, 9, 19, 12, 0, 30),
  },
});

const causes: readonly ConnectionFailureCause[] = [
  "clock_skew",
  "not_linked",
  "relay_error",
  "tunnel_pending",
  "tunnel_not_enabled",
  "tunnel_down",
  "origin_unreachable",
  "invalid_response",
  "dns",
  "tls",
  "refused",
  "timeout",
  "unknown",
];
const hops: readonly ConnectionHop[] = ["device", "relay", "tunnel", "server"];

function producerFixtures(): ConnectionDiagnosisInput[] {
  const generic = backoff(new ConnectionTransientError({ reason: "network", detail: "Settings" }));
  return [
    ...causes.map((failureCause) =>
      backoff(
        new ConnectionTransientError({
          reason: "network",
          detail: "Settings/{0}/$&",
          hop: "tunnel",
          failureCause,
          httpStatus: 502,
          traceId: "Settings",
        }),
      ),
    ),
    { ...generic, state: { ...generic.state, network: "offline" } },
    { ...generic, state: { ...generic.state, phase: "offline" } },
    backoff(new ConnectionTransientError({ reason: "session-pending", detail: "Settings" })),
    backoff(
      new ConnectionBlockedError({
        reason: "unsupported",
        detail: "Settings",
        serverUpdateRequired: true,
      }),
    ),
    ...hops.flatMap((hop) => [
      ...(["network", "transport", "timeout"] as const).map((reason) =>
        backoff(new ConnectionTransientError({ reason, detail: "Settings", hop })),
      ),
      ...(["authentication", "permission", "configuration"] as const).map((reason) =>
        backoff(new ConnectionBlockedError({ reason, detail: "Settings", hop })),
      ),
    ]),
    generic,
    { ...generic, via: "direct" },
    ...(["tunnel_down", "origin_unreachable", "invalid_response", null] as const).map(
      (endpointFailure): ConnectionDiagnosisInput => ({
        hostLabel: HOST,
        via: "relay",
        state: AVAILABLE_CONNECTION_STATE,
        relayStatus: {
          status: "offline",
          ...(endpointFailure === null ? {} : { endpointFailure }),
          endpointStatus: 530,
        },
      }),
    ),
    {
      hostLabel: HOST,
      via: "relay",
      state: AVAILABLE_CONNECTION_STATE,
      relayStatus: { status: "offline", offlineReason: "tunnel_released" },
    },
  ];
}

describe("connectionDiagnosisDisplay", () => {
  it("localizes every producer branch without changing technical facts or the copied report", () => {
    for (const input of producerFixtures()) {
      const diagnosis = presentConnectionDiagnosis(input);
      expect(diagnosis).not.toBeNull();
      if (diagnosis === null) throw new Error("Expected a failed connection fixture");
      const original = JSON.stringify(diagnosis);
      const report = connectionDiagnosisText(HOST, diagnosis);
      const display = connectionDiagnosisDisplay(diagnosis, HOST, "zh-CN");
      expect(display.moreInfoUrl).toBe(diagnosis.moreInfoUrl);
      expect(display.hops.map(({ hop, result }) => ({ hop, result }))).toEqual(
        diagnosis.hops.map(({ hop, result }) => ({ hop, result })),
      );
      for (const [index, hop] of display.hops.entries()) {
        if (hop.hop === "relay") expect(hop.label).toBe("T3 Connect");
        else expect(hop.label).not.toBe(diagnosis.hops[index]!.label);
        if (hop.hop === "server" || hop.hop === "tunnel") expect(hop.label).toContain(HOST);
      }
      for (const [index, step] of display.steps.entries()) {
        expect(step).not.toBe(diagnosis.steps[index]);
        if (diagnosis.steps[index]!.includes(HOST)) expect(step).toContain(HOST);
        if (diagnosis.steps[index]!.includes("`t3 connect status`")) {
          expect(step).toContain("`t3 connect status`");
        }
      }
      expect(display.facts.map(([, value]) => value)).toEqual(
        diagnosis.facts.map(([, value]) => value),
      );
      for (const [index, [label]] of display.facts.entries()) {
        expect(label).not.toBe(diagnosis.facts[index]![0]);
      }
      expect(JSON.stringify(diagnosis)).toBe(original);
      expect(connectionDiagnosisText(HOST, diagnosis)).toBe(report);
      expect(connectionDiagnosisDisplay(diagnosis, HOST, "en")).toBe(diagnosis);
    }
  });

  it("keeps future copy and dictionary-colliding values literal, while translating known host templates", () => {
    const diagnosis: ConnectionDiagnosis = {
      headline: "Settings",
      hops: [
        { hop: "device", label: "Settings", result: "failed" },
        { hop: "server", label: `T3 Code on ${HOST}`, result: "unchecked" },
      ],
      steps: ["Settings", "Future recovery step", `Open or restart T3 Code on ${HOST}.`],
      facts: [
        ["Settings", "Settings"],
        ["Error", "Settings"],
        ["Trace ID", "{0}/$&"],
      ],
      moreInfoUrl: "https://example.com/Settings/{0}/$&",
    };
    const display = connectionDiagnosisDisplay(diagnosis, HOST, "zh-CN");
    expect(display.headline).toBe("Settings");
    expect(display.hops[0]!.label).toBe("Settings");
    expect(display.hops[1]!.label).toBe(`${HOST} 上的 T3 Code`);
    expect(display.steps).toEqual([
      "Settings",
      "Future recovery step",
      `请打开或重启 ${HOST} 上的 T3 Code。`,
    ]);
    expect(display.facts).toEqual([
      ["Settings", "Settings"],
      ["错误", "Settings"],
      ["跟踪 ID", "{0}/$&"],
    ]);
    expect(display.moreInfoUrl).toBe(diagnosis.moreInfoUrl);
  });
});

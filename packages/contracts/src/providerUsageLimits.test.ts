import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { describe, expect, it } from "vite-plus/test";

import { ServerProviderUsageLimits, ServerProviderUsageWindow } from "./providerUsageLimits.ts";

const window = { id: "primary", kind: "session", label: "Session", usedPercent: 40 } as const;
const decode = Schema.decodeUnknownSync(ServerProviderUsageWindow);
const encode = Schema.encodeSync(ServerProviderUsageWindow);
const decodeLimits = Schema.decodeUnknownSync(ServerProviderUsageLimits);
const encodeLimits = Schema.encodeSync(ServerProviderUsageLimits);
const legacy = ServerProviderUsageWindow.mapFields(Struct.omit(["labelDescriptor"]));
const decodeLegacy = Schema.decodeUnknownSync(legacy);

describe("usage window label ownership", () => {
  it("round trips optional metadata while preserving legacy windows and raw labels", () => {
    const tagged = { ...window, labelDescriptor: { code: "session" as const } };
    const wire = JSON.parse(JSON.stringify(encode(tagged)));
    expect(decode(wire)).toEqual(tagged);
    expect(decode(window)).toEqual(window);
    expect(decodeLegacy(wire)).toEqual(window);
    for (const labelDescriptor of [
      null,
      4,
      "session",
      {},
      { code: "future" },
      { code: "weeklyScoped" },
      { code: "weeklyScoped", displayName: 42 },
    ]) {
      const limits = decodeLimits({
        checkedAt: "2026-09-03T12:00:00.000Z",
        windows: [{ ...window, labelDescriptor }],
      });
      expect(limits.windows).toHaveLength(1);
      expect(limits.windows[0]?.label).toBe("Session");
      expect(limits.windows[0]?.labelDescriptor).toBeUndefined();
    }
  });
});

describe("usage unavailable message ownership", () => {
  it("round trips optional descriptors without dropping legacy or future unavailable notices", () => {
    const unavailable = { reason: "probeFailed" as const, message: "Settings/$&/{0} 中文" };
    const limits = { checkedAt: "2026-09-03T12:00:00.000Z", windows: [], unavailable };
    expect(decodeLimits(limits)).toEqual(limits);
    for (const messageDescriptor of [
      { code: "codexUsageRequestFailed", rpcCode: -32603 },
      { code: "codexUsageSpawnFailed" },
      { code: "codexUsageProcessExited" },
      { code: "codexUsageNoResponse" },
      { code: "codexUsageLoginRequired" },
      { code: "cursorUsageReadFailed" },
      { code: "cursorUsageDefaultEndpointRequired" },
      { code: "grokUsageReadFailed" },
      { code: "grokUsagePrivacyModeRequired" },
      { code: "openCodeGoUsageReadFailed" },
      { code: "antigravityUsageQuotaUnavailable" },
      { code: "antigravityUsageReadFailed" },
      { code: "antigravityUsageGoogleSignInRequired" },
    ] as const) {
      const tagged = { ...limits, unavailable: { ...unavailable, messageDescriptor } };
      expect(decodeLimits(JSON.parse(JSON.stringify(encodeLimits(tagged))))).toEqual(tagged);
    }
    for (const messageDescriptor of [
      null,
      4,
      "codexUsageNoResponse",
      {},
      { code: "future" },
      { code: "codexUsageRequestFailed" },
      { code: "codexUsageRequestFailed", rpcCode: "-32603" },
    ]) {
      const decoded = decodeLimits({
        ...limits,
        unavailable: { ...unavailable, messageDescriptor },
      });
      expect(decoded.windows).toEqual([]);
      expect(decoded.unavailable).toMatchObject(unavailable);
      expect(decoded.unavailable).not.toHaveProperty("messageDescriptor", messageDescriptor);
    }
  });
});

import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { describe, expect, it } from "vite-plus/test";

import { ServerProviderUsageLimits, ServerProviderUsageWindow } from "./providerUsageLimits.ts";

const window = { id: "primary", kind: "session", label: "Session", usedPercent: 40 } as const;
const decode = Schema.decodeUnknownSync(ServerProviderUsageWindow);
const encode = Schema.encodeSync(ServerProviderUsageWindow);
const decodeLimits = Schema.decodeUnknownSync(ServerProviderUsageLimits);
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

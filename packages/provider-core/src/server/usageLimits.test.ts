import { describe, expect, it } from "vite-plus/test";

import {
  applyUsageLimitsUpdate,
  makeUnavailableUsageLimits,
  resolveUsageLimitsAfterProbe,
} from "./usageLimits.ts";

const checkedAt = "2026-09-03T12:00:00.000Z";
const session = {
  id: "five_hour",
  kind: "session",
  label: "Session",
  usedPercent: 40,
  windowDurationMins: 300,
  resetsAt: "2026-09-03T14:00:00.000Z",
} as const;
const weekly = {
  id: "seven_day",
  kind: "weekly",
  label: "Weekly",
  usedPercent: 20,
  windowDurationMins: 10_080,
} as const;
const published = { checkedAt, windows: [session, weekly] };

describe("applyUsageLimitsUpdate", () => {
  it("publishes label descriptor changes and removal even when usage does not move", () => {
    const tagged = { ...session, labelDescriptor: { code: "session" as const } };
    const added = applyUsageLimitsUpdate({
      previous: published,
      checkedAt,
      update: { windows: [tagged] },
    });
    expect(added).not.toBe(published);
    expect(added?.windows[0]).toEqual(tagged);
    expect(
      applyUsageLimitsUpdate({
        previous: added,
        checkedAt,
        update: { windows: [{ ...tagged, labelDescriptor: { code: "session" } }] },
      }),
    ).toBe(added);
    const changed = applyUsageLimitsUpdate({
      previous: added,
      checkedAt,
      update: { windows: [{ ...tagged, labelDescriptor: { code: "weekly" } }] },
    });
    expect(changed).not.toBe(added);
    const removed = applyUsageLimitsUpdate({
      previous: changed,
      checkedAt,
      update: { windows: [session] },
    });
    expect(removed).not.toBe(changed);
    expect(removed?.windows[0]).toEqual(session);
    const scoped = {
      ...weekly,
      label: "Weekly · Settings",
      labelDescriptor: { code: "weeklyScoped" as const, displayName: "Settings" },
    };
    const before = { checkedAt, windows: [scoped] };
    const after = applyUsageLimitsUpdate({
      previous: before,
      checkedAt,
      update: {
        windows: [
          { ...scoped, labelDescriptor: { code: "weeklyScoped", displayName: "$& {0}\n中文" } },
        ],
      },
    });
    expect(after).not.toBe(before);
    expect(after?.windows[0]?.labelDescriptor).toEqual({
      code: "weeklyScoped",
      displayName: "$& {0}\n中文",
    });
  });

  it("returns the published object itself when no window moved", () => {
    const next = applyUsageLimitsUpdate({
      previous: published,
      checkedAt: "2026-09-03T12:00:05.000Z",
      update: {
        windows: [
          { ...weekly },
          { id: "five_hour", kind: "session", label: "Session", usedPercent: 40 },
        ],
      },
    });
    expect(next).toBe(published);
  });

  it("upserts by id and keeps the reset a percent-only update omits", () => {
    const next = applyUsageLimitsUpdate({
      previous: published,
      checkedAt: "2026-09-03T12:00:05.000Z",
      update: {
        windows: [{ id: "five_hour", kind: "session", label: "Session", usedPercent: 55 }],
      },
    });
    expect(next).not.toBe(published);
    expect(next).toEqual({
      checkedAt: "2026-09-03T12:00:05.000Z",
      windows: [{ ...session, usedPercent: 55 }, weekly],
    });
  });

  it("leaves an unsupported account and an empty update alone", () => {
    const unsupported = { checkedAt, windows: [], unavailable: { reason: "unsupported" as const } };
    expect(
      applyUsageLimitsUpdate({ previous: unsupported, checkedAt, update: { windows: [session] } }),
    ).toBe(unsupported);
    expect(
      applyUsageLimitsUpdate({ previous: published, checkedAt, update: { windows: [] } }),
    ).toBe(published);
  });

  it("marks a first sparse update as unavailable", () => {
    expect(
      applyUsageLimitsUpdate({ previous: undefined, checkedAt, update: { windows: [weekly] } }),
    ).toEqual({ checkedAt, windows: [weekly], unavailable: { reason: "probeFailed" } });
  });

  it("preserves reset credits when a streamed window update changes usage", () => {
    const resetCredits = { availableCount: 2, nextExpiresAt: "2026-10-01T00:00:00.000Z" };
    const next = applyUsageLimitsUpdate({
      previous: { ...published, resetCredits },
      checkedAt: "2026-09-03T12:00:05.000Z",
      update: { windows: [{ ...session, usedPercent: 55 }] },
    });

    expect(next).toEqual({
      checkedAt: "2026-09-03T12:00:05.000Z",
      windows: [{ ...session, usedPercent: 55 }, weekly],
      resetCredits,
    });
  });
});

describe("resolveUsageLimitsAfterProbe", () => {
  it("uses read order for windows while taking metadata from the successful probe", () => {
    const live = {
      checkedAt: "2026-09-03T12:00:05.000Z",
      windows: [
        { ...session, usedPercent: 95 },
        { ...weekly, usedPercent: 70 },
      ],
      resetCredits: { availableCount: 2 },
      externalUsage: { label: "Old dashboard", url: "https://example.com/old" },
    };
    const probed = {
      ...published,
      windows: [{ ...session, usedPercent: 0 }],
      resetCredits: { availableCount: 1 },
      externalUsage: { label: "Usage dashboard", url: "https://example.com/usage" },
    };

    expect(resolveUsageLimitsAfterProbe({ published: live, probed })).toEqual({
      ...probed,
      checkedAt: live.checkedAt,
      windows: live.windows,
    });

    const sameTime = { ...probed, checkedAt: live.checkedAt };
    const newer = { ...probed, checkedAt: "2026-09-03T12:00:06.000Z" };
    expect(resolveUsageLimitsAfterProbe({ published: live, probed: sameTime })).toEqual(sameTime);
    expect(resolveUsageLimitsAfterProbe({ published: live, probed: newer })).toEqual(newer);
  });

  it("keeps the last good windows through a failed probe but not an unsupported one", () => {
    const failed = { checkedAt, windows: [], unavailable: { reason: "probeFailed" as const } };
    const unsupported = { checkedAt, windows: [], unavailable: { reason: "unsupported" as const } };
    expect(resolveUsageLimitsAfterProbe({ published, probed: failed })).toBe(published);
    expect(resolveUsageLimitsAfterProbe({ published, probed: unsupported })).toBe(unsupported);
    expect(resolveUsageLimitsAfterProbe({ published: undefined, probed: failed })).toBe(failed);
  });
});

describe("makeUnavailableUsageLimits", () => {
  it("copies explicit message ownership without assigning it to raw or absent messages", () => {
    const message = "Codex could not read usage (JSON-RPC -32603).";
    const messageDescriptor = { code: "codexUsageRequestFailed" as const, rpcCode: -32603 };
    const input = { checkedAt, reason: "probeFailed" as const, message, messageDescriptor };
    const failed = makeUnavailableUsageLimits(input);
    expect(failed).toEqual({
      checkedAt,
      windows: [],
      unavailable: { reason: "probeFailed", message, messageDescriptor },
    });
    expect(makeUnavailableUsageLimits({ checkedAt, reason: "probeFailed", message })).toEqual({
      checkedAt,
      windows: [],
      unavailable: { reason: "probeFailed", message },
    });
    for (const reason of ["probeFailed", "unsupported"] as const) {
      for (const optionalMessage of [undefined, ""]) {
        expect(
          makeUnavailableUsageLimits({
            checkedAt,
            reason,
            ...(optionalMessage === undefined ? {} : { message: optionalMessage }),
          }),
        ).toEqual({
          checkedAt,
          windows: [],
          unavailable: { reason },
        });
      }
    }
    expect(resolveUsageLimitsAfterProbe({ published, probed: failed })).toBe(published);
    expect(resolveUsageLimitsAfterProbe({ published: undefined, probed: failed })).toBe(failed);
  });
});

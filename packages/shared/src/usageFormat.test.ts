// @effect-diagnostics globalDate:off -- A fixed instant keeps calendar-window assertions deterministic.
import { describe, expect, it, vi } from "vite-plus/test";
import type { UsageSource } from "@t3tools/contracts";

import {
  enumerateHourStarts,
  formatDayShort,
  formatDateTimeShort,
  formatHourShort,
  formatPercent,
  formatRelativeHourShort,
  makeWindow,
  usageSourceMessages,
} from "./usageFormat.ts";

describe("formatPercent", () => {
  it("distinguishes a small positive share from zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(0.0004)).toBe("<0.1%");
    expect(formatPercent(0.0009)).toBe("<0.1%");
    expect(formatPercent(0.001)).toBe("0.1%");
    expect(formatPercent(0.023)).toBe("2.3%");
    expect(formatPercent(0.00004, 2)).toBe("<0.01%");
  });
});

function malformedSource(count: number, overrides: Partial<UsageSource> = {}): UsageSource {
  return {
    fingerprint: {
      hostId: "demo-host",
      provider: "codex",
      resolvedHomePath: "/demo/codex",
      volumeId: "demo-volume",
    },
    status: "partial",
    scannedFiles: 1,
    skippedFiles: 0,
    malformedRecords: count,
    distinctSessions: 1,
    message: `${count} malformed or inconsistent usage record(s) were skipped; usage may be incomplete.`,
    ...overrides,
  };
}

describe("usage source messages", () => {
  it("combines different skipped-record counts into one warning", () => {
    const codex = malformedSource(1);
    const claude = malformedSource(11, {
      fingerprint: { ...codex.fingerprint, provider: "claude", resolvedHomePath: "/demo/claude" },
    });

    expect(usageSourceMessages([codex, claude])).toEqual([
      "12 malformed or inconsistent usage record(s) were skipped; usage may be incomplete.",
    ]);
  });

  it.each([
    { first: 1, second: 1, total: 2 },
    { first: 1, second: 11, total: 12 },
  ])(
    "combines hosts reporting $first and $second skipped records once per source",
    ({ first, second, total }) => {
      const source = malformedSource(first);
      const otherHost = malformedSource(second, {
        fingerprint: { ...source.fingerprint, hostId: "other-demo-host" },
      });

      expect(usageSourceMessages([source, source, otherHost, otherHost])).toEqual([
        `${total} malformed or inconsistent usage record(s) were skipped; usage may be incomplete.`,
      ]);
      expect(usageSourceMessages([source, source])).toEqual([
        `${first} malformed or inconsistent usage record(s) were skipped; usage may be incomplete.`,
      ]);
      expect(usageSourceMessages([otherHost, otherHost])).toEqual([
        `${second} malformed or inconsistent usage record(s) were skipped; usage may be incomplete.`,
      ]);
    },
  );

  it("keeps different machines with the same hostname and home path distinct", () => {
    const source = malformedSource(1);
    const otherMachine = malformedSource(11, {
      fingerprint: { ...source.fingerprint, volumeId: "other-demo-volume" },
    });

    expect(usageSourceMessages([source, otherMachine])).toEqual([
      "12 malformed or inconsistent usage record(s) were skipped; usage may be incomplete.",
    ]);
  });

  it("uses the largest count when connected environments report the same source", () => {
    const source = malformedSource(1);

    expect(usageSourceMessages([source, malformedSource(11), source])).toEqual([
      "11 malformed or inconsistent usage record(s) were skipped; usage may be incomplete.",
    ]);
  });

  it("retains other diagnostics beside the combined warning", () => {
    const source = malformedSource(1);
    const readFailure = "2 transcript path(s) could not be read; usage may be incomplete.";
    const cursor = malformedSource(0, {
      fingerprint: { ...source.fingerprint, provider: "cursor" },
      status: "ok",
      message: "Cursor history is limited to the last 30 days.",
    });

    expect(
      usageSourceMessages([
        { ...source, message: `${readFailure} ${source.message}` },
        { ...source, malformedRecords: 0, message: readFailure },
        cursor,
      ]),
    ).toEqual([
      readFailure,
      cursor.message,
      "1 malformed or inconsistent usage record(s) were skipped; usage may be incomplete.",
    ]);
  });

  it("includes cached diagnostics when a transcript directory is missing", () => {
    const source = malformedSource(1);
    const missing = malformedSource(2, {
      fingerprint: { ...source.fingerprint, hostId: "other-demo-host" },
      status: "missing",
      scannedFiles: 0,
      skippedFiles: 1,
      distinctSessions: 0,
      message:
        "No transcript directory on this environment. 2 malformed or inconsistent usage record(s) were skipped; usage may be incomplete.",
    });

    expect(usageSourceMessages([source, missing, missing])).toEqual([
      "No transcript directory on this environment.",
      "3 malformed or inconsistent usage record(s) were skipped; usage may be incomplete.",
    ]);
  });

  it("omits empty missing sources, healthy sources, and diagnostics handled by an action", () => {
    expect(
      usageSourceMessages([
        malformedSource(0, { status: "missing" }),
        malformedSource(1, { status: "ok" }),
        malformedSource(1, { action: "enableCursorKeychain" }),
      ]),
    ).toEqual([]);
    expect(usageSourceMessages([])).toEqual([]);
  });
});

describe("hourly usage formatting", () => {
  it("keeps requested zones separate when formatting repeated calls", () => {
    const instant = "2026-08-11T12:37:00.000Z";
    for (const zone of ["UTC", "America/New_York", "Asia/Kathmandu", "UTC"]) {
      expect(formatHourShort(instant, zone)).toBe(
        new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric" }).format(
          new Date(instant),
        ),
      );
    }
    expect(() => formatHourShort(instant, "Etc/Unknown")).toThrow(RangeError);
    expect(formatHourShort("invalid", "UTC")).toBe("invalid");
  });

  it("uses the current system zone when no zone is supplied", () => {
    try {
      vi.stubEnv("TZ", "UTC");
      expect(formatHourShort("2026-08-11T12:37:00.000Z")).toBe("12 PM");
      vi.stubEnv("TZ", "America/New_York");
      expect(formatHourShort("2026-08-11T12:37:00.000Z")).toBe("8 AM");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("enumerates 24 fixed buckets across a rolling window", () => {
    const hours = enumerateHourStarts("2026-08-10T12:37:00.000Z", "2026-08-11T12:37:00.000Z");

    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe("2026-08-10T12:37:00.000Z");
    expect(hours[23]).toBe("2026-08-11T11:37:00.000Z");
  });

  it("formats rolling instants in the requested time zone", () => {
    expect(formatHourShort("2026-08-11T00:37:00.000Z", "UTC")).toBe("12 AM");
    expect(formatHourShort("2026-08-11T12:37:00.000Z", "UTC")).toBe("12 PM");
    expect(formatDateTimeShort("2026-08-11T17:37:00.000Z", "UTC")).toBe("Aug 11, 5 PM");
  });

  it("formats visible dates and hours in Simplified Chinese", () => {
    expect(formatDayShort("2026-08-11", "zh-CN")).toBe("8月11日");
    expect(formatDateTimeShort("2026-08-11T17:37:00.000Z", "UTC", true, "zh-CN")).toContain(
      "8月11日",
    );
    expect(
      formatRelativeHourShort(
        "2026-08-10T17:37:00.000Z",
        "2026-08-11T14:37:00.000Z",
        "UTC",
        true,
        "zh-CN",
      ),
    ).toContain("昨天");
  });

  it("honors the time format while preserving Chinese labels", () => {
    expect(formatHourShort("2026-08-11T17:37:00.000Z", "UTC", false, "zh-CN")).toBe("17:00");
    expect(formatHourShort("2026-08-11T17:37:00.000Z", "UTC", true, "zh-CN")).toContain("下午5");
    expect(formatDateTimeShort("2026-08-11T17:37:00.000Z", "UTC", false, "zh-CN")).toContain(
      "17:00",
    );
    expect(
      formatRelativeHourShort(
        "2026-08-10T17:37:00.000Z",
        "2026-08-11T14:37:00.000Z",
        "UTC",
        false,
        "zh-CN",
      ),
    ).toBe("昨天 17:00");
  });

  it("disambiguates repeated hours during a fall-back transition", () => {
    expect(formatHourShort("2026-11-01T05:37:00.000Z", "America/New_York")).toBe("1 AM EDT");
    expect(formatHourShort("2026-11-01T06:37:00.000Z", "America/New_York")).toBe("1 AM EST");
    expect(formatHourShort("2026-11-01T05:37:00.000Z", "America/New_York", false)).toBe(
      "01:00 EDT",
    );
    expect(formatHourShort("2026-11-01T06:37:00.000Z", "America/New_York", false)).toBe(
      "01:00 EST",
    );
  });

  it("builds an exact minute-aligned 24-hour request", () => {
    const window = makeWindow(1, new Date("2026-08-11T12:37:42.123Z"), "hour");

    expect(window.resolution).toBe("hour");
    expect(window.sinceTime).toBe("2026-08-10T12:37:00.000Z");
    expect(window.untilTime).toBe("2026-08-11T12:37:00.000Z");
  });

  it("degrades an unknown resolved zone to UTC instead of crashing", () => {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const resolvedOptions = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ ...resolved, timeZone: "Etc/Unknown" });

    try {
      const now = new Date("2026-08-11T12:37:42.123Z");

      expect(makeWindow(1, now, "hour").timeZone).toBe("UTC");
      expect(makeWindow(30, now).timeZone).toBe("UTC");
    } finally {
      resolvedOptions.mockRestore();
    }
  });
});

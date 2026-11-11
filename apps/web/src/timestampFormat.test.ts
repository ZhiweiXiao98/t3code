import { describe, expect, it, vi } from "vite-plus/test";

import {
  formatChatTimestampTooltip,
  formatDayAwareTimestamp,
  formatShortTimestamp,
  formatUpcomingTimestamp,
  formatElapsedDurationLabel,
  formatExpiresInLabel,
  type DurationLabelText,
} from "./timestampFormat";

describe("timestamps in an explicit time zone", () => {
  // 23:00 UTC on July 1 is 7 PM on July 1 in New York, whatever the host zone.
  const now = Date.parse("2026-07-01T23:00:00.000Z");
  const zone = "America/New_York";

  it("picks relative days from the calendar in that zone", () => {
    expect(formatUpcomingTimestamp("2026-07-02T00:30:00.000Z", "12-hour", now, zone)).not.toMatch(
      /tomorrow/,
    );
    expect(formatUpcomingTimestamp("2026-07-02T05:30:00.000Z", "12-hour", now, zone)).toMatch(
      /^tomorrow at /,
    );
    expect(formatDayAwareTimestamp("2026-07-01T03:30:00.000Z", "12-hour", now, zone)).toMatch(
      /^yesterday at /,
    );
  });
});

describe("duration labels", () => {
  const now = Date.parse("2026-07-01T12:00:00.000Z");
  const text: DurationLabelText = {
    justNow: "刚刚",
    expired: "已过期",
    expiresInAMoment: "即将过期",
    formatUnit: (count, unit) => `${count}${{ s: "秒", m: "分钟", h: "小时", d: "天" }[unit]}`,
    expiresIn: (duration) => `${duration}后过期`,
  };

  it.each([
    [0, "just now", "刚刚"],
    [4, "just now", "刚刚"],
    [5, "5s", "5秒"],
    [60, "1m", "1分钟"],
    [3600, "1h", "1小时"],
    [86400, "1d", "1天"],
  ])("formats elapsed seconds %s with default or supplied text", (seconds, english, localized) => {
    const date = new Date(now - seconds * 1000).toISOString();
    expect(formatElapsedDurationLabel(date, now)).toBe(english);
    expect(formatElapsedDurationLabel(date, now, text)).toBe(localized);
  });

  it.each([
    [0, "Expired", "已过期"],
    [4, "Expires in a moment", "即将过期"],
    [5, "Expires in 5s", "5秒后过期"],
    [60, "Expires in 1m", "1分钟后过期"],
    [61, "Expires in 1m 1s", "1分钟 1秒后过期"],
    [3661, "Expires in 1h 1m 1s", "1小时 1分钟 1秒后过期"],
    [86400, "Expires in 1d", "1天后过期"],
    [90061, "Expires in 1d 1h 1m 1s", "1天 1小时 1分钟 1秒后过期"],
  ])("formats expiry seconds %s with default or supplied text", (seconds, english, localized) => {
    const date = new Date(now + seconds * 1000).toISOString();
    expect(formatExpiresInLabel(date, now)).toBe(english);
    expect(formatExpiresInLabel(date, now, text)).toBe(localized);
  });
});

describe("short timestamp locale overrides", () => {
  it("honors the selected language and clock preference without reusing another locale's cache", () => {
    const date = new Date(2026, 3, 8, 18, 5);
    const iso = date.toISOString();
    expect(formatShortTimestamp(iso, "12-hour", "en-US")).toBe("6:05 PM");
    expect(formatShortTimestamp(iso, "12-hour", "zh-CN")).toBe("下午6:05");
    expect(formatShortTimestamp(iso, "24-hour", "zh-CN")).toBe("18:05");
    expect(formatShortTimestamp(iso, "locale", "zh-CN")).toBe(
      new Intl.DateTimeFormat("zh-CN", {
        hour: "numeric",
        minute: "2-digit",
        hourCycle: new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions()
          .hourCycle,
      }).format(date),
    );
    expect(formatShortTimestamp(iso, "12-hour", "en-US")).toBe("6:05 PM");
    expect(formatShortTimestamp(iso, "12-hour")).toBe(
      date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }),
    );
  });
});

it("localizes calendar copy without changing explicit-zone day or clock semantics", () => {
  const now = Date.parse("2026-07-01T23:00:00.000Z");
  const zone = "America/New_York";
  expect(formatDayAwareTimestamp("2026-07-01T03:30:00.000Z", "24-hour", now, zone, "zh-CN")).toBe(
    "昨天 23:30",
  );
  expect(formatUpcomingTimestamp("2026-07-02T05:30:00.000Z", "24-hour", now, zone, "zh-CN")).toBe(
    "明天 1:30",
  );
  expect(formatUpcomingTimestamp("2026-07-02T00:30:00.000Z", "24-hour", now, zone, "zh-CN")).toBe(
    "20:30",
  );
  expect(formatUpcomingTimestamp("2026-07-02T05:30:00.000Z", "12-hour", now, zone, "en")).toBe(
    "tomorrow at 1:30 AM",
  );
  expect(formatUpcomingTimestamp("2026-07-02T05:30:00.000Z", "12-hour", now, zone, "zh-CN")).toBe(
    "明天 上午1:30",
  );
  expect(formatUpcomingTimestamp("2026-07-02T05:30:00.000Z", "12-hour", now, zone, "en")).toBe(
    "tomorrow at 1:30 AM",
  );
  for (const [past, current] of [
    ["2026-03-08T07:30:00.000Z", "2026-03-09T05:00:00.000Z"],
    ["2026-11-01T05:30:00.000Z", "2026-11-02T06:00:00.000Z"],
  ] as const) {
    expect(formatDayAwareTimestamp(past, "24-hour", Date.parse(current), zone, "zh-CN")).toMatch(
      /^昨天 /,
    );
  }
  const date = new Date(2026, 10, 10, 10, 30).toISOString();
  expect(formatChatTimestampTooltip(date, "24-hour", "zh-CN")).toBe("2026年11月10日 10:30");
  expect(formatChatTimestampTooltip(date, "24-hour", "en")).toBe("10:30, 10th November 2026");
  expect(formatChatTimestampTooltip("invalid", "24-hour", "zh-CN")).toBe("");
});

it.each([
  ["de-DE", "en", "14:30"],
  ["en-US", "zh-CN", "下午2:30"],
])(
  "preserves the %s browser/OS clock when the interface uses %s",
  async (systemLocale, locale, expected) => {
    vi.resetModules();
    vi.stubGlobal("window", { desktopBridge: { getSystemLocale: () => systemLocale } });
    try {
      const { formatShortTimestamp: short, formatUpcomingTimestamp: upcoming } =
        await import("./timestampFormat");
      const date = new Date(2026, 10, 10, 14, 30).toISOString();
      expect(short(date, "locale", locale)).toBe(expected);
      expect(
        upcoming(
          "2026-07-02T18:30:00.000Z",
          "locale",
          Date.parse("2026-07-01T23:00:00.000Z"),
          "America/New_York",
          locale,
        ),
      ).toBe(locale === "zh-CN" ? "明天 下午2:30" : "tomorrow at 14:30");
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  },
);

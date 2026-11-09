import { describe, expect, it } from "vite-plus/test";

import {
  formatDayAwareTimestamp,
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

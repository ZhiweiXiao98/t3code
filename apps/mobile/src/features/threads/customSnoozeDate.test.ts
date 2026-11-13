import { describe, expect, it } from "vite-plus/test";

import {
  applySnoozePickerDate,
  applySnoozePickerTime,
  snoozeDateToPickerDate,
  snoozePickerLabels,
} from "./customSnoozeDate";

describe("custom snooze calendar conversion", () => {
  it("passes the local calendar day to Compose without shifting it across time zones", () => {
    const date = new Date(2026, 8, 17, 0, 30);
    expect(snoozeDateToPickerDate(date)).toBe("2026-09-17T00:00:00.000Z");
  });

  it("applies Compose's UTC calendar day while retaining the local time", () => {
    const date = new Date(2026, 8, 16, 23, 45);
    const next = applySnoozePickerDate(date, new Date("2026-09-20T00:00:00Z"));
    expect([
      next.getFullYear(),
      next.getMonth(),
      next.getDate(),
      next.getHours(),
      next.getMinutes(),
    ]).toEqual([2026, 8, 20, 23, 45]);
    expect(date.getDate()).toBe(16);
    for (const locale of ["en", "zh-CN"] as const) {
      for (const is24Hour of [false, true]) {
        snoozePickerLabels(next, is24Hour, locale);
        expect(snoozeDateToPickerDate(next)).toBe("2026-09-20T00:00:00.000Z");
        const selectedTime = new Date(2026, 8, 1, 8, 15);
        const timed = applySnoozePickerTime(next, selectedTime);
        expect([timed.getFullYear(), timed.getMonth(), timed.getDate()]).toEqual([2026, 8, 20]);
        expect([timed.getHours(), timed.getMinutes(), timed.getSeconds()]).toEqual([8, 15, 0]);
        expect([next.getHours(), next.getMinutes()]).toEqual([23, 45]);
      }
    }
  });

  it("formats app-language labels in the local timezone while retaining the device hour cycle", () => {
    for (const hour of [0, 15]) {
      const date = new Date(2026, 8, 17, hour, 5);
      const original = date.toISOString();
      for (const locale of ["en", "zh-CN"] as const) {
        const shortDate = locale === "zh-CN" ? "9月17日" : "Sep 17";
        const twelveHour =
          locale === "zh-CN"
            ? hour === 0
              ? "上午12:05"
              : "下午3:05"
            : hour === 0
              ? "12:05 AM"
              : "3:05 PM";
        expect(snoozePickerLabels(date, true, locale)).toEqual({
          date: shortDate,
          time: hour === 0 ? (locale === "zh-CN" ? "0:05" : "00:05") : "15:05",
        });
        expect(snoozePickerLabels(date, false, locale)).toEqual({
          date: shortDate,
          time: twelveHour,
        });
      }
      expect(date.toISOString()).toBe(original);
    }
  });
});

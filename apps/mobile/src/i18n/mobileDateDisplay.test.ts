import { expect, it, vi } from "vite-plus/test";
import {
  mobileDateFormatOptions,
  mobileDisplayDate,
  mobileUsageLimitLabel,
} from "./mobileDateDisplay";

it("formats reset dates with the app locale while preserving the viewer time zone", () => {
  const value = "2026-11-15T09:30:00Z";
  const options = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
  const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const locale of ["en", "zh-CN"] as const) {
    const expected = new Date(value).toLocaleString(locale, mobileDateFormatOptions(options));
    expect(mobileDisplayDate(value, options, locale)).toBe(expected);
    expect(mobileDisplayDate(new Date(value), options, locale)).toBe(expected);
    expect(mobileUsageLimitLabel(value, locale)).toBe(
      locale === "en"
        ? `Usage limit reached. Retry after ${expected} (${zone}).`
        : `已达到使用限额，请在 ${expected} (${zone}) 后重试。`,
    );
    expect(mobileUsageLimitLabel(null, locale)).toBe(
      locale === "en" ? "Usage limit reached." : "已达到使用限额。",
    );
  }
});

it("retains device hour cycles while translating date text and honors explicit caller options", async () => {
  const Original = Intl.DateTimeFormat;
  const date = new Date(2026, 10, 15, 9, 30);
  for (const deviceLocale of ["en-US", "en-GB"]) {
    vi.resetModules();
    const cycle = new Original(deviceLocale, { hour: "numeric" }).resolvedOptions().hourCycle;
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
      return new Original(locales === undefined ? deviceLocale : locales, options);
    });
    try {
      const display = await import("./mobileDateDisplay");
      const timestamp = await import("../features/threads/messageTimestamp");
      const options = {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      } as const;
      expect(display.mobileDisplayDate(date, options, "zh-CN")).toBe(
        date.toLocaleString("zh-CN", { ...options, hourCycle: cycle }),
      );
      expect(timestamp.formatMessageTimestamp(date.toISOString(), date.getTime(), "zh-CN")).toBe(
        new Original("zh-CN", { hour: "numeric", minute: "2-digit", hourCycle: cycle }).format(
          date,
        ),
      );
      expect(display.mobileDisplayDate(date, { ...options, hour12: false }, "zh-CN")).toBe(
        date.toLocaleString("zh-CN", { ...options, hour12: false }),
      );
      expect(
        display.mobileDisplayDate(date, { ...options, hourCycle: "h23", timeZone: "UTC" }, "zh-CN"),
      ).toBe(date.toLocaleString("zh-CN", { ...options, hourCycle: "h23", timeZone: "UTC" }));
    } finally {
      spy.mockRestore();
    }
  }
  vi.resetModules();
});

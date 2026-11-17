import { mobileDateFormatOptions } from "../../i18n/mobileDateDisplay";
import { describe, expect, it } from "vite-plus/test";

import { MOBILE_LOCALE } from "../../i18n/mobileStrings";
import { createMessageTimeFormatter, formatMessageTimestamp } from "./messageTimestamp";

describe("formatMessageTimestamp", () => {
  const now = new Date(2026, 10, 8, 20, 0).getTime();
  const time = (date: Date) =>
    date.toLocaleTimeString(
      MOBILE_LOCALE,
      mobileDateFormatOptions({ hour: "numeric", minute: "2-digit" }),
    );

  it("shows only the time for today, and the day and month for any earlier day", () => {
    const today = new Date(2026, 10, 8, 0, 5);
    const yesterday = new Date(2026, 10, 7, 23, 55);
    const lastYear = new Date(2025, 10, 5, 19, 17);
    expect(formatMessageTimestamp(today.toISOString(), now)).toBe(time(today));
    expect(formatMessageTimestamp(yesterday.toISOString(), now)).toBe(
      `${yesterday.toLocaleDateString(MOBILE_LOCALE, { month: "numeric", day: "numeric" })} ${time(yesterday)}`,
    );
    expect(formatMessageTimestamp(lastYear.toISOString(), now)).toBe(
      `${lastYear.toLocaleDateString(MOBILE_LOCALE, { month: "numeric", day: "numeric", year: "numeric" })} ${time(lastYear)}`,
    );
  });
});

it("uses app locale rather than device locale and keeps same-day/year boundaries", () => {
  const now = new Date(2026, 10, 8, 20, 0).getTime();
  for (const locale of ["en", "zh-CN"] as const) {
    for (const date of [
      new Date(2026, 10, 8, 0, 5),
      new Date(2026, 10, 7, 23, 55),
      new Date(2025, 10, 5, 19, 17),
    ]) {
      const time = new Intl.DateTimeFormat(
        locale,
        mobileDateFormatOptions({ hour: "numeric", minute: "2-digit" }),
      ).format(date);
      const day =
        date.getDate() === 8
          ? ""
          : new Intl.DateTimeFormat(locale, {
              month: "numeric",
              day: "numeric",
              ...(date.getFullYear() === 2025 ? { year: "numeric" as const } : {}),
            }).format(date) + " ";
      expect(formatMessageTimestamp(date.toISOString(), now, locale)).toBe(day + time);
    }
    expect(formatMessageTimestamp("invalid", now, locale)).toBe("");
  }
});

describe("createMessageTimeFormatter", () => {
  const now = new Date(2026, 0, 1, 20, 0).getTime();

  it("follows the system clock preference over the locale's hour cycle", () => {
    const format24 = createMessageTimeFormatter(true, "en-US");
    expect(format24(new Date(2026, 0, 1, 15, 7).toISOString(), now)).toBe("15:07");
    expect(format24(new Date(2026, 0, 1, 0, 7).toISOString(), now)).toBe("00:07");
    const format12 = createMessageTimeFormatter(false, "en-GB");
    expect(format12(new Date(2026, 0, 1, 15, 7).toISOString(), now)).toMatch(/^3:07\spm$/i);
  });
});

it("combines the selected Chinese date locale with an explicit system 24-hour clock", () => {
  const now = new Date(2026, 10, 8, 20).getTime();
  const date = new Date(2026, 10, 7, 15, 7);
  const expectedDate = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(date);
  expect(createMessageTimeFormatter(true, "zh-CN")(date.toISOString(), now)).toBe(
    `${expectedDate} 15:07`,
  );
});

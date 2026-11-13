import { mobileDateFormatOptions } from "../../i18n/mobileDateDisplay";
import { describe, expect, it } from "vite-plus/test";

import { MOBILE_LOCALE } from "../../i18n/mobileStrings";
import { formatMessageTimestamp } from "./messageTimestamp";

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

import { MOBILE_LOCALE, localizeMobileString, type MobileLocale } from "../../i18n/mobileStrings";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatScheduledTaskInterval(
  everyMs: number,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const units = [
    [7 * DAY, "week"],
    [DAY, "day"],
    [HOUR, "hour"],
    [MINUTE, "minute"],
    [1_000, "second"],
    [1, "millisecond"],
  ] as const;
  const chineseUnits = ["周", "天", "小时", "分钟", "秒", "毫秒"];
  let remaining = everyMs;
  const parts: string[] = [];
  for (const [index, [size, unit]] of units.entries()) {
    const count = Math.floor(remaining / size);
    if (count === 0) continue;
    if (locale === "en" && count === 1 && remaining === everyMs && remaining === size)
      return `Every ${unit}`;
    parts.push(
      locale === "zh-CN"
        ? `${count} ${chineseUnits[index]}`
        : `${count} ${unit}${count === 1 ? "" : "s"}`,
    );
    remaining %= size;
  }
  return formatMobileMessage("Every {0}", [parts.join(" ")], locale);
}

function localCalendarDay(date: Date): number {
  // Compare calendar days, not 24-hour spans: DST days can have 23 or 25 hours.
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY;
}

export function formatNextScheduledTaskRun(
  nextRunAt: string,
  now: number,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const next = new Date(nextRunAt);
  const current = new Date(now);
  const remaining = next.getTime() - now;
  if (!Number.isFinite(remaining)) return localizeMobileString("Next run unavailable", locale);
  if (remaining <= 0) return localizeMobileString("Next run due", locale);

  const days = localCalendarDay(next) - localCalendarDay(current);
  if (days === 0) {
    if (remaining < MINUTE) return localizeMobileString("Next run in less than a minute", locale);
    const unit = remaining < HOUR ? "minute" : "hour";
    const count = Math.round(remaining / (remaining < HOUR ? MINUTE : HOUR));
    return locale === "zh-CN"
      ? formatMobileMessage(
          unit === "minute" ? "Next run in {0} minutes" : "Next run in {0} hours",
          [count],
          locale,
        )
      : `Next run in ${count} ${unit}${count === 1 ? "" : "s"}`;
  }

  const time = next.toLocaleTimeString(locale === "zh-CN" ? "zh-CN" : [], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (days === 1) return formatMobileMessage("Next run tomorrow at {0}", [time], locale);
  if (days <= 7 && locale === "en") {
    return `Next run next ${next.toLocaleDateString([], { weekday: "long" })} at ${time}`;
  }
  const date = next.toLocaleDateString(locale === "zh-CN" ? "zh-CN" : [], {
    month: "short",
    day: "numeric",
    ...(next.getFullYear() !== current.getFullYear() ? { year: "numeric" as const } : {}),
  });
  return formatMobileMessage("Next run {0} at {1}", [date, time], locale);
}

export function isScheduledWeekdays(weekdays: ReadonlyArray<number>): boolean {
  const days = new Set(weekdays);
  return days.size === 5 && [1, 2, 3, 4, 5].every((day) => days.has(day));
}

export function scheduledWeekdayLabel(day: number, locale: MobileLocale = MOBILE_LOCALE): string {
  return (
    (locale === "zh-CN"
      ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[day] ?? ""
  );
}

export function scheduledRepeatLabel(
  weekdays: ReadonlyArray<number>,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const days = new Set(weekdays);
  if (days.size === 7) return localizeMobileString("Every day", locale);
  if (isScheduledWeekdays(weekdays)) return locale === "zh-CN" ? "工作日" : "Weekdays";
  return (
    [1, 2, 3, 4, 5, 6, 0]
      .filter((day) => days.has(day))
      .map((day) => scheduledWeekdayLabel(day, locale))
      .join(", ") || localizeMobileString("Choose days", locale)
  );
}

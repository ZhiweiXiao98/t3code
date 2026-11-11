import { type TimestampFormat } from "@t3tools/contracts/settings";

function getTimestampFormatOptions(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormatOptions {
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  };

  if (timestampFormat === "locale") {
    return { ...baseOptions, hourCycle: timestampHourCycle };
  }

  return {
    ...baseOptions,
    hour12: timestampFormat === "12-hour",
  };
}

function resolveTimestampLocale(systemLocale: string | null | undefined): string | undefined {
  const tag = systemLocale?.trim();
  if (!tag) return undefined;

  try {
    // Reject structurally invalid tags; let ICU fall back for valid tags it lacks data for.
    Intl.DateTimeFormat.supportedLocalesOf([tag]);
    return tag;
  } catch {
    return undefined;
  }
}

function readHostSystemLocale(): string | null {
  if (typeof window === "undefined") return null;
  return window.desktopBridge?.getSystemLocale() ?? null;
}

const timestampLocale = resolveTimestampLocale(readHostSystemLocale());
const timestampHourCycle = new Intl.DateTimeFormat(timestampLocale, {
  hour: "numeric",
}).resolvedOptions().hourCycle;

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
type WeekdayIndex = (typeof WEEKDAY_INDEXES)[number];

type LocaleWithWeekInfo = Intl.Locale & {
  readonly weekInfo?: { readonly firstDay: number };
  getWeekInfo?: () => { readonly firstDay: number };
};

/**
 * First weekday of a locale as a `Date#getDay` index (0 is Sunday), or
 * `undefined` when the runtime has no week data, so callers keep their own
 * default.
 */
function resolveWeekStartsOn(locale: string | undefined): WeekdayIndex | undefined {
  try {
    const resolved: LocaleWithWeekInfo = new Intl.Locale(
      locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
    );
    // Week info counts Monday as 1 and Sunday as 7.
    const firstDay = resolved.getWeekInfo?.().firstDay ?? resolved.weekInfo?.firstDay;
    return firstDay === undefined ? undefined : WEEKDAY_INDEXES[firstDay % 7];
  } catch {
    return undefined;
  }
}

export const weekStartsOn = resolveWeekStartsOn(timestampLocale);

const timestampFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimestampFormatter(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
  timeZone?: string,
  locale: string | undefined = timestampLocale,
): Intl.DateTimeFormat {
  const cacheKey = `${locale ?? ""}:${timestampFormat}:${includeSeconds ? "seconds" : "minutes"}:${timeZone ?? ""}`;
  const cachedFormatter = timestampFormatterCache.get(cacheKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    ...getTimestampFormatOptions(timestampFormat, includeSeconds),
    ...(timeZone ? { timeZone } : {}),
  });
  timestampFormatterCache.set(cacheKey, formatter);
  return formatter;
}

export function resolveHour12(timestampFormat: TimestampFormat): boolean {
  return getTimestampFormatter(timestampFormat, false).resolvedOptions().hour12 ?? false;
}

export function parseTimestampDate(isoDate: string): Date | null {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Deliberately not the host locale: the tooltip's ordinal suffix and
// day-before-month order below are English, so a localized month alone would
// read "4th Juni 2026".
const monthNameFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });

function ordinalSuffix(day: number): string {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function formatChatTimestampTooltip(
  isoDate: string,
  timestampFormat: TimestampFormat,
  locale?: string,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = formatShortTimestamp(isoDate, timestampFormat, locale);
  if (locale === "zh-CN") {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  const day = date.getDate();
  const month = monthNameFormatter.format(date);
  const year = date.getFullYear();
  return `${time}, ${day}${ordinalSuffix(day)} ${month} ${year}`;
}

export function formatShortTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  locale?: string,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, false, undefined, locale).format(date);
}

const numericDateOptions: Intl.DateTimeFormatOptions = { month: "numeric", day: "numeric" };
const numericDateWithYearOptions: Intl.DateTimeFormatOptions = {
  ...numericDateOptions,
  year: "numeric",
};
const numericDateFormatter = new Intl.DateTimeFormat(timestampLocale, numericDateOptions);
const numericDateWithYearFormatter = new Intl.DateTimeFormat(
  timestampLocale,
  numericDateWithYearOptions,
);

interface CalendarDay {
  year: number;
  /** Days since the epoch, so differences are whole days across DST shifts. */
  index: number;
}

function calendarDay(date: Date, timeZone: string | undefined): CalendarDay {
  if (!timeZone) {
    const year = date.getFullYear();
    return { year, index: Date.UTC(year, date.getMonth(), date.getDate()) / 86_400_000 };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const year = part("year");
  return { year, index: Date.UTC(year, part("month") - 1, part("day")) / 86_400_000 };
}

const numericDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatNumericDate(
  date: Date,
  sameYear: boolean,
  timeZone: string | undefined,
  locale?: string,
): string {
  if (!timeZone && locale === undefined) {
    return (sameYear ? numericDateFormatter : numericDateWithYearFormatter).format(date);
  }
  const key = `${locale ?? timestampLocale ?? ""}:${sameYear}:${timeZone ?? ""}`;
  let formatter = numericDateFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale ?? timestampLocale, {
      ...(sameYear ? numericDateOptions : numericDateWithYearOptions),
      ...(timeZone ? { timeZone } : {}),
    });
    numericDateFormatterCache.set(key, formatter);
  }
  return formatter.format(date);
}

export function formatDayAwareTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  nowMs: number = Date.now(),
  timeZone?: string,
  locale?: string,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = getTimestampFormatter(timestampFormat, false, timeZone, locale).format(date);

  const today = calendarDay(new Date(nowMs), timeZone);
  const messageDay = calendarDay(date, timeZone);
  const dayDiff = today.index - messageDay.index;

  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return locale === "zh-CN" ? `昨天 ${time}` : `yesterday at ${time}`;
  return `${formatNumericDate(date, messageDay.year === today.year, timeZone, locale)} ${time}`;
}

/** `timeZone` overrides the zone the formatters cached when they were built. */
export function formatUpcomingTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  nowMs: number = Date.now(),
  timeZone?: string,
  locale?: string,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = getTimestampFormatter(timestampFormat, false, timeZone, locale).format(date);

  const today = calendarDay(new Date(nowMs), timeZone);
  const targetDay = calendarDay(date, timeZone);
  const dayDiff = targetDay.index - today.index;

  if (dayDiff < 0)
    return formatDayAwareTimestamp(isoDate, timestampFormat, nowMs, timeZone, locale);
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return locale === "zh-CN" ? `明天 ${time}` : `tomorrow at ${time}`;
  return `${formatNumericDate(date, targetDay.year === today.year, timeZone, locale)} ${time}`;
}

type RelativeTimeParts = { value: string; suffix: string | null };
export type RelativeTimeState =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "relative"; value: string; suffix: string | null };

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function relativeTimeUnitMs(elapsedMs: number): number {
  if (elapsedMs < HOUR_MS) return MINUTE_MS;
  if (elapsedMs < DAY_MS) return HOUR_MS;
  return DAY_MS;
}

/** Elapsed time floored to formatRelativeTime precision; equal labels yield equal values. */
export function relativeTimeElapsedMs(isoDate: string, nowMs: number = Date.now()): number | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  const unitMs = relativeTimeUnitMs(elapsedMs);
  return Math.floor(elapsedMs / unitMs) * unitMs;
}

export function msUntilRelativeTimeChange(
  isoDate: string,
  nowMs: number = Date.now(),
): number | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  const unitMs = relativeTimeUnitMs(elapsedMs);
  const nextChangeMs = date.getTime() + (Math.floor(elapsedMs / unitMs) + 1) * unitMs;
  // Delays above 2^31-1 fire immediately; cap safely and let callers reschedule.
  return Math.min(nextChangeMs - nowMs, DAY_MS);
}

export function formatRelativeElapsed(elapsedMs: number): RelativeTimeParts {
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return { value: "just now", suffix: null };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { value: `${minutes}m`, suffix: "ago" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: `${hours}h`, suffix: "ago" };
  const days = Math.floor(hours / 24);
  return { value: `${days}d`, suffix: "ago" };
}

export function formatRelativeTime(
  isoDate: string,
  nowMs: number = Date.now(),
): RelativeTimeParts | null {
  const elapsedMs = relativeTimeElapsedMs(isoDate, nowMs);
  return elapsedMs === null ? null : formatRelativeElapsed(elapsedMs);
}

export function formatRelativeTimeLabel(isoDate: string, nowMs: number = Date.now()) {
  const relative = formatRelativeTime(isoDate, nowMs);
  if (!relative) return "";
  return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
}

export interface DurationLabelText {
  readonly justNow: string;
  readonly expired: string;
  readonly expiresInAMoment: string;
  readonly formatUnit: (count: number, unit: "s" | "m" | "h" | "d") => string;
  readonly expiresIn: (duration: string) => string;
}

const defaultDurationText: DurationLabelText = {
  justNow: "just now",
  expired: "Expired",
  expiresInAMoment: "Expires in a moment",
  formatUnit: (count, unit) => `${count}${unit}`,
  expiresIn: (duration) => `Expires in ${duration}`,
};

export function formatElapsedDurationLabel(
  isoDate: string,
  nowMs: number = Date.now(),
  text: DurationLabelText = defaultDurationText,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = nowMs - date.getTime();
  if (diffMs <= 0) return text.justNow;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return text.justNow;
  if (seconds < 60) return text.formatUnit(seconds, "s");

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return text.formatUnit(minutes, "m");

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return text.formatUnit(hours, "h");

  const days = Math.floor(hours / 24);
  return text.formatUnit(days, "d");
}

/** Pass nowMs to match a parent-driven render tick. */
export function formatExpiresInLabel(
  isoDate: string,
  nowMs: number = Date.now(),
  text: DurationLabelText = defaultDurationText,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = date.getTime() - nowMs;
  if (diffMs <= 0) return text.expired;

  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 5) return text.expiresInAMoment;
  if (totalSeconds < 60) return text.expiresIn(text.formatUnit(totalSeconds, "s"));

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0
      ? text.expiresIn(text.formatUnit(minutes, "m"))
      : text.expiresIn(`${text.formatUnit(minutes, "m")} ${text.formatUnit(seconds, "s")}`);
  }

  if (totalSeconds < 86_400) {
    const hours = Math.floor(totalSeconds / 3600);
    const rem = totalSeconds % 3600;
    const minutes = Math.floor(rem / 60);
    const seconds = rem % 60;
    const parts = [text.formatUnit(hours, "h")];
    if (minutes > 0) parts.push(text.formatUnit(minutes, "m"));
    if (seconds > 0) parts.push(text.formatUnit(seconds, "s"));
    return text.expiresIn(parts.join(" "));
  }

  const days = Math.floor(totalSeconds / 86_400);
  const remAfterDays = totalSeconds % 86_400;
  if (remAfterDays === 0) return text.expiresIn(text.formatUnit(days, "d"));
  const hours = Math.floor(remAfterDays / 3600);
  const rem = remAfterDays % 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem % 60;
  const tail: string[] = [];
  if (hours > 0) tail.push(text.formatUnit(hours, "h"));
  if (minutes > 0) tail.push(text.formatUnit(minutes, "m"));
  if (seconds > 0) tail.push(text.formatUnit(seconds, "s"));
  return tail.length > 0
    ? text.expiresIn(`${text.formatUnit(days, "d")} ${tail.join(" ")}`)
    : text.expiresIn(text.formatUnit(days, "d"));
}

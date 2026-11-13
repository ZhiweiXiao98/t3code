import { formatMobileMessage } from "./mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

const deviceHourCycle = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions()
  .hourCycle;

export function mobileDateFormatOptions(
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  return options?.hour12 !== undefined || options?.hourCycle !== undefined
    ? options
    : { ...options, hourCycle: deviceHourCycle };
}

export function mobileDisplayDate(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(locale, mobileDateFormatOptions(options));
}

export function mobileUsageLimitLabel(
  resetAt: string | null | undefined,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (!resetAt) return localizeMobileString("Usage limit reached.", locale);
  const time = mobileDisplayDate(
    resetAt,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
    locale,
  );
  const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatMobileMessage(
    "Usage limit reached. Retry after {0}.",
    [`${time} (${zone})`],
    locale,
  );
}

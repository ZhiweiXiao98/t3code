import { mobileDateFormatOptions } from "../../i18n/mobileDateDisplay";
import { MOBILE_LOCALE } from "../../i18n/mobileStrings";
const formatters = new Map<
  string,
  { time: Intl.DateTimeFormat; date: Intl.DateTimeFormat; year: Intl.DateTimeFormat }
>();
function dateFormatters(locale: string) {
  let value = formatters.get(locale);
  if (!value) {
    value = {
      time: new Intl.DateTimeFormat(
        locale,
        mobileDateFormatOptions({ hour: "numeric", minute: "2-digit" }),
      ),
      date: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }),
      year: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", year: "numeric" }),
    };
    formatters.set(locale, value);
  }
  return value;
}

/** Time only for today's messages; older ones lead with the day and month. */
export function formatMessageTimestamp(
  input: string,
  nowMs: number = Date.now(),
  localeOrFormatter: string | Intl.DateTimeFormat = MOBILE_LOCALE,
): string {
  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) return "";
  const date = new Date(timestamp);
  const now = new Date(nowMs);
  const locale =
    typeof localeOrFormatter === "string"
      ? localeOrFormatter
      : localeOrFormatter.resolvedOptions().locale;
  const formats = dateFormatters(locale);
  const time = (typeof localeOrFormatter === "string" ? formats.time : localeOrFormatter).format(
    date,
  );
  if (date.toDateString() === now.toDateString()) return time;
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${(sameYear ? formats.date : formats.year).format(date)} ${time}`;
}

/** `is24Hour` overrides the locale's hour cycle with the system clock preference when known. */
export function createMessageTimeFormatter(
  is24Hour: boolean | undefined,
  locale: string = MOBILE_LOCALE,
) {
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(is24Hour === undefined ? {} : { hourCycle: is24Hour ? "h23" : "h12" }),
  });
  return (input: string, nowMs?: number): string =>
    formatMessageTimestamp(input, nowMs, timeFormatter);
}

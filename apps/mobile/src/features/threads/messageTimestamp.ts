import { mobileDateFormatOptions } from "../../i18n/mobileDateDisplay";
import { MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
const formatters = new Map<
  MobileLocale,
  { time: Intl.DateTimeFormat; date: Intl.DateTimeFormat; year: Intl.DateTimeFormat }
>();
function dateFormatters(locale: MobileLocale) {
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
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) return "";
  const date = new Date(timestamp);
  const now = new Date(nowMs);
  const formats = dateFormatters(locale);
  const time = formats.time.format(date);
  if (date.toDateString() === now.toDateString()) return time;
  const sameYear = date.getFullYear() === now.getFullYear();
  return `${(sameYear ? formats.date : formats.year).format(date)} ${time}`;
}

import { formatMobileMessage } from "./mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

const speechLanguageNames = new Map<MobileLocale, Intl.DisplayNames>();

export function mobileSpeechLanguageLabel(
  code: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  try {
    if (typeof Intl.DisplayNames !== "function") return code.toUpperCase();
    let names = speechLanguageNames.get(locale);
    if (!names) {
      names = new Intl.DisplayNames(locale, { type: "language" });
      speechLanguageNames.set(locale, names);
    }
    return names.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function mobileUsageResetLabel(
  value: string,
  resumes: boolean,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return localizeMobileString("Reset time unavailable", locale);
  const formatted = date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return formatMobileMessage(resumes ? "Resumes {0}." : "Resets {0}.", [formatted], locale);
}

export function mobileUsageRecoveryFailure(
  error: unknown,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return error instanceof Error
    ? error.message
    : localizeMobileString("Could not change limit recovery.", locale);
}

export function mobileMermaidFailure(error: unknown, locale: MobileLocale = MOBILE_LOCALE): string {
  return error instanceof Error
    ? error.message
    : localizeMobileString("The diagram could not be rendered.", locale);
}

export function mobilePreviewUploadFailure(
  status: number,
  body: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (!body) return localizeMobileString("The upload was refused.", locale);
  if (status === 409 && body === "The page's file picker is no longer open.") {
    return localizeMobileString("The page's file picker is no longer open.", locale);
  }
  return body;
}

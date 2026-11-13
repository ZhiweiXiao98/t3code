import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function providerAccountFailure(
  failure: unknown,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return failure instanceof Error
    ? failure.message
    : localizeMobileString("Could not update provider sign-in.", locale);
}

export function keyboardNewlineDescription(
  modifier: "Ctrl" | "Command",
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMobileMessage(
    "Return inserts a new line. {0}-Return sends the message.",
    [modifier],
    locale,
  );
}

export function settingsProjectMenuDisplay(
  group: { readonly label: string; readonly archived: boolean },
  locale: MobileLocale = MOBILE_LOCALE,
) {
  return {
    title: group.archived
      ? formatMobileMessage("{0} · Archived", [group.label], locale)
      : group.label,
    localize: false as const,
  };
}

export function claudeAccountFailure(
  failure: unknown,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return failure instanceof Error
    ? failure.message
    : localizeMobileString("Could not save the Claude account.", locale);
}

export function claudeAccountSummary(
  status: "Turned off" | "Signed in" | "Not signed in" | "Not installed" | null,
  configDir: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return [
    status === null ? null : localizeMobileString(status, locale),
    configDir || localizeMobileString("Default config folder", locale),
  ]
    .filter(Boolean)
    .join(" · ");
}

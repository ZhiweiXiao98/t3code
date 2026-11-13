import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

const linkedAtFormatters = {
  en: new Intl.DateTimeFormat("en", { dateStyle: "medium" }),
  "zh-CN": new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }),
};

export function linkedAtLabel(value: string, locale: MobileLocale = MOBILE_LOCALE): string {
  const linkedAt = new Date(value);
  return Number.isNaN(linkedAt.getTime())
    ? localizeMobileString("Link date unavailable", locale)
    : formatMobileMessage("Linked {0}", [linkedAtFormatters[locale].format(linkedAt)], locale);
}

export function endpointLabel(providerKind: string, locale: MobileLocale = MOBILE_LOCALE): string {
  return localizeMobileString(
    providerKind === "cloudflare_tunnel" ? "Managed tunnel" : "Activity publishing only",
    locale,
  );
}

export function deregisterConfirmationMessage(
  label: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMobileMessage(
    "“{0}” will be removed from this account. T3 Connect access will be revoked, any managed tunnel will be removed, and a host space will become available. Local connections on your devices are not changed.",
    [label],
    locale,
  );
}

export function deregisterFailureMessage(
  cause: unknown,
  traceId?: string | null,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const message =
    cause instanceof Error
      ? cause.message
      : localizeMobileString("Could not deregister the server.", locale);
  return traceId
    ? `${message}\n\n${localizeMobileString("Trace ID:", locale)} ${traceId}`
    : message;
}

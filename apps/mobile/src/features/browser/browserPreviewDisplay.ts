import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function browserZoomLabel(factor: number, locale: MobileLocale = MOBILE_LOCALE): string {
  return formatMobileMessage("Zoom ({0}%)", [Math.round(factor * 100)], locale);
}

export function browserViewportLabel(
  category: "Phone" | "Tablet" | "Desktop",
  name: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMobileMessage("{0} ({1})", [localizeMobileString(category, locale), name], locale);
}

import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
import type { CommandPaletteItem } from "./commandPaletteItems";

/** Prepare titles before ranking so highlight offsets refer to the displayed text. */
export function commandPaletteTitle(
  kind: CommandPaletteItem["kind"],
  title: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (kind === "action") return localizeMobileString(title, locale);
  return kind === "thread" && !title ? localizeMobileString("Untitled thread", locale) : title;
}

export function commandPaletteProjectActionTitle(
  projectTitle: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMobileMessage("New thread in {0}", [projectTitle], locale);
}

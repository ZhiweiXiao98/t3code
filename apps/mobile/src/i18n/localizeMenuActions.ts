import type { MenuAction } from "@react-native-menu/menu";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

export function localizeMenuActions(
  actions: readonly MenuAction[],
  locale: MobileLocale = MOBILE_LOCALE,
): MenuAction[] {
  return actions.map((action) => ({
    ...action,
    title: localizeMobileString(action.title, locale),
    ...(action.subtitle === undefined
      ? {}
      : { subtitle: localizeMobileString(action.subtitle, locale) }),
    ...(action.subactions === undefined
      ? {}
      : { subactions: localizeMenuActions(action.subactions, locale) }),
  }));
}

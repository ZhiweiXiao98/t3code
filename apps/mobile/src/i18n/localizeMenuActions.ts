import type { MenuAction } from "@react-native-menu/menu";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

export type LocalizableMenuAction = MenuAction & {
  readonly localize?: boolean;
  readonly subactions?: LocalizableMenuAction[];
};

export function localizeMenuActions(
  actions: readonly LocalizableMenuAction[],
  locale: MobileLocale = MOBILE_LOCALE,
): MenuAction[] {
  return actions.map(({ localize, ...action }) => ({
    ...action,
    title: localize === false ? action.title : localizeMobileString(action.title, locale),
    ...(action.subtitle === undefined
      ? {}
      : {
          subtitle:
            localize === false ? action.subtitle : localizeMobileString(action.subtitle, locale),
        }),
    ...(action.subactions === undefined
      ? {}
      : { subactions: localizeMenuActions(action.subactions, locale) }),
  }));
}

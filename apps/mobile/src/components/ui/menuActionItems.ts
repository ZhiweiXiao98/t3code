import type { HeaderBarButtonMailSearchToolbarItem } from "react-native-screens";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
import type { LocalizableMenuAction } from "../../i18n/localizeMenuActions";
import type { MenuAction } from "@react-native-menu/menu";
import type { AppBarMenuItem } from "./AppBar.types";

/** Adapts a `MenuAction` tree and its selection handler to `AppBar` menu items. */
export function appBarMenuItemsFromActions(
  actions: ReadonlyArray<MenuAction>,
  onSelect: (id: string) => void,
): AppBarMenuItem[] {
  return actions.map((action, index) => {
    const id = action.id ?? String(index);
    return action.subactions?.length
      ? {
          id,
          title: action.title,
          icon: action.image,
          items: appBarMenuItemsFromActions(action.subactions, onSelect),
        }
      : {
          id,
          title: action.title,
          subtitle: action.subtitle,
          icon: action.image,
          iconColor: action.imageColor,
          selected: action.state === "on",
          disabled: action.attributes?.disabled,
          onPress: () => onSelect(id),
        };
  });
}

/** Adapts `AppBar` menu items to a `Menu`'s actions; `findAppBarMenuItem` resolves a selection. */
export function menuActionsFromAppBarItems(
  items: ReadonlyArray<AppBarMenuItem>,
): LocalizableMenuAction[] {
  return items.flatMap((item): LocalizableMenuAction[] =>
    "items" in item
      ? item.inline && !item.title
        ? menuActionsFromAppBarItems(item.items)
        : [
            {
              id: item.id,
              title: item.title ?? "",
              ...(item.localize === undefined ? {} : { localize: item.localize }),
              image: item.icon,
              displayInline: item.inline,
              subactions: menuActionsFromAppBarItems(item.items),
            },
          ]
      : [
          {
            id: item.id,
            title: item.title,
            ...(item.localize === undefined ? {} : { localize: item.localize }),
            subtitle: item.subtitle,
            image: item.icon,
            imageColor: item.iconColor,
            state: item.selected ? "on" : undefined,
            attributes:
              item.disabled || item.destructive
                ? { disabled: item.disabled, destructive: item.destructive }
                : undefined,
          },
        ],
  );
}

export function findAppBarMenuItem(
  items: ReadonlyArray<AppBarMenuItem>,
  id: string,
): Extract<AppBarMenuItem, { readonly onPress: () => void }> | undefined {
  for (const item of items) {
    if ("items" in item) {
      const action = findAppBarMenuItem(item.items, id);
      if (action) return action;
    } else if (item.id === id) {
      return item;
    }
  }
  return undefined;
}

type MailMenu = NonNullable<HeaderBarButtonMailSearchToolbarItem["filterMenu"]>;
export function mailMenuItems(
  items: ReadonlyArray<AppBarMenuItem>,
  locale: MobileLocale = MOBILE_LOCALE,
): MailMenu["items"] {
  return items.map((item) =>
    "items" in item
      ? {
          type: "submenu",
          title:
            item.localize === false
              ? (item.title ?? "")
              : localizeMobileString(item.title ?? "", locale),
          items: mailMenuItems(item.items, locale),
        }
      : {
          type: "action",
          title: item.localize === false ? item.title : localizeMobileString(item.title, locale),
          state: item.selected ? "on" : "off",
          disabled: item.disabled,
          onPress: item.onPress,
        },
  );
}

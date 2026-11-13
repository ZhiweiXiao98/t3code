import type { ReactNode } from "react";
import type { LocalizableMenuAction } from "../../i18n/localizeMenuActions";
import { NativeHeaderToolbar as Toolbar } from "../../native/NativeHeaderToolbar";

export function renderPullRequestThreadMenuItems(
  items: readonly LocalizableMenuAction[],
  select: (id: string) => void,
): ReactNode {
  return items.map((item) =>
    item.subactions ? (
      <Toolbar.Menu key={item.id} title={item.title} localize={item.localize} icon={item.image}>
        {renderPullRequestThreadMenuItems(item.subactions, select)}
      </Toolbar.Menu>
    ) : (
      <Toolbar.MenuAction
        key={item.id}
        localize={item.localize}
        icon={item.image}
        subtitle={item.subtitle}
        disabled={item.attributes?.disabled}
        onPress={() => item.id && select(item.id)}
      >
        <Toolbar.Label>{item.title}</Toolbar.Label>
      </Toolbar.MenuAction>
    ),
  );
}

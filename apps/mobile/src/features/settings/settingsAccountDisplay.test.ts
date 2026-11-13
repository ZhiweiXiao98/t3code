import { expect, it, vi } from "vite-plus/test";
import {
  providerAccountFailure,
  keyboardNewlineDescription,
  settingsProjectMenuDisplay,
} from "./settingsAccountDisplay";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMenuActions, localizeMenuTitle } from "../../i18n/localizeMenuActions";
import {
  menuActionsFromAppBarItems,
  findAppBarMenuItem,
  mailMenuItems,
} from "../../components/ui/menuActionItems";

it("preserves project labels through native menu conversion and dispatch while translating owned suffixes", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const label of ["Settings", "Open", "{0} $& · Archived"]) {
      for (const archived of [true, false]) {
        const onPress = vi.fn();
        const items = [
          {
            id: "project:stable",
            ...settingsProjectMenuDisplay({ label, archived }, locale),
            onPress,
          },
        ];
        const actions = localizeMenuActions(menuActionsFromAppBarItems(items), locale);
        const nested = [{ id: "projects", title: label, localize: false, items }];
        expect(localizeMenuActions(menuActionsFromAppBarItems(nested), locale)[0]).toMatchObject({
          id: "projects",
          title: label,
          subactions: [{ id: "project:stable", title: actions[0]?.title }],
        });
        expect(actions[0]?.title).toBe(
          archived ? `${label} · ${locale === "en" ? "Archived" : "已归档"}` : label,
        );
        expect(actions[0]?.id).toBe("project:stable");
        const mail = mailMenuItems(
          [{ id: "projects", title: label, localize: false, items }],
          locale,
        );
        expect(mail[0]).toMatchObject({
          type: "submenu",
          title: label,
          items: [{ type: "action", title: actions[0]?.title }],
        });
        expect(
          mailMenuItems([{ id: "owned", title: "Settings", items: [] }], locale)[0],
        ).toMatchObject({ type: "submenu", title: locale === "en" ? "Settings" : "设置" });
        const item = findAppBarMenuItem(items, "project:stable");
        if (item && "onPress" in item) item.onPress();
        expect(onPress).toHaveBeenCalledOnce();
      }
      expect(localizeMenuTitle(label, false, locale)).toBe(label);
    }
    expect(localizeMenuTitle("Settings", undefined, locale)).toBe(
      locale === "en" ? "Settings" : "设置",
    );
    expect(localizeMenuTitle(undefined, false, locale)).toBeUndefined();
  }
});

it("translates only owned provider fallbacks and keyboard templates with literal parameters", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const message of ["Settings", "Open", "Could not update provider sign-in.", ""])
      expect(providerAccountFailure(new Error(message), locale)).toBe(message);
    expect(providerAccountFailure(null, locale)).toBe(
      locale === "en" ? "Could not update provider sign-in." : "无法更新提供商登录状态。",
    );
    for (const modifier of ["Ctrl", "Command"] as const)
      expect(keyboardNewlineDescription(modifier, locale)).toBe(
        locale === "en"
          ? `Return inserts a new line. ${modifier}-Return sends the message.`
          : `Return 插入新行，${modifier}-Return 发送消息。`,
      );
    const host = "Settings/{0}/$&";
    expect(
      formatMobileMessage(
        "Running threads sharing this sign-in on {0} will stop. Thread history is kept.",
        [host],
        locale,
      ),
    ).toBe(
      locale === "en"
        ? `Running threads sharing this sign-in on ${host} will stop. Thread history is kept.`
        : `${host} 上共享此登录的运行中任务将停止。任务历史会保留。`,
    );
  }
});

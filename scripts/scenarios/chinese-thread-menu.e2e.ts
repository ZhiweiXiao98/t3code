import { expect } from "e2e";

import { test, WEB } from "./t3.ts";

test(
  "Chinese thread context menus preserve fixture names through dismissal and a locale roundtrip",
  WEB,
  async ({ t3, app, screen, browser }) => {
    const project = await t3.project("example-team/example-project", {
      "README.md": "# example-team/example-project\n",
    });
    await t3.thread({ project, title: "Chat", messages: ["first"], model: "multi-turn" });
    await t3.open();
    // Pairing reloads the app asynchronously; wait for the real signed-in fixture first.
    const thread = screen.getByRole("button", /^Chat, /);
    await expect(thread).toBeVisible();
    await app.open("/settings/general");

    // Use the real preference control, not browser storage or application internals.
    const language = screen.getByRole("combobox", /^(App language|应用语言)$/);
    await language.tap();
    await screen.getByRole("option", "简体中文").tap();
    await expect(language).toHaveText("简体中文");
    await app.open("/");

    // Sidebar rows expose the literal title, optional status, and project in their name.
    // Chat deliberately collides with an English application label.
    const fixtureName = /^Chat, (?:.*?, )?example-team\/example-project$/;
    const menu = screen.getByRole("menu", /^(Context menu|上下文菜单)$/);
    const renameZh = screen.getByRole("menuitem", "重命名任务");
    const copyZh = screen.getByRole("menuitem", "复制");

    await thread.secondaryTap();
    await expect(menu).toBeVisible();
    // Capture the real open menu even if a later localization assertion fails.
    await app.screenshot("menu-zh-open");
    await expect(menu).toHaveAccessibleName("上下文菜单");
    await expect(thread).toHaveAccessibleName(fixtureName);
    await expect(renameZh).toBeVisible();
    await expect(screen.getByRole("menuitem", "置顶任务")).toBeVisible();
    await expect(screen.getByRole("menuitem", "归档任务")).toBeVisible();
    await expect(copyZh).toBeVisible();

    // Opening the submenu does not copy data or execute any thread action.
    await copyZh.tap();
    const copyMenuZh = screen.getByRole("menu", "复制");
    await expect(copyMenuZh).toBeVisible();
    await app.screenshot("menu-zh-copy");
    await expect(copyMenuZh.getByRole("menuitem", "路径")).toBeVisible();
    await expect(copyMenuZh.getByRole("menuitem", "任务 ID")).toBeVisible();
    await browser.keyboard.press("Escape");
    await expect(copyMenuZh).toBeHidden();
    await expect(menu).toBeVisible();
    await browser.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await thread.secondaryTap();
    await expect(menu).toBeVisible();
    await app.screenshot("menu-zh-reopened");
    await expect(renameZh).toBeVisible();
    await expect(thread).toHaveAccessibleName(fixtureName);
    await browser.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await app.open("/settings/general");
    await language.tap();
    await screen.getByRole("option", "English").tap();
    await expect(language).toHaveText("English");
    await app.open("/");
    await thread.secondaryTap();
    await expect(menu).toBeVisible();
    await app.screenshot("menu-en-open");
    await expect(menu).toHaveAccessibleName("Context menu");
    await expect(screen.getByRole("menuitem", "Rename thread")).toBeVisible();
    await expect(screen.getByRole("menuitem", "Copy")).toBeVisible();
    await expect(thread).toHaveAccessibleName(fixtureName);
    await browser.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await app.open("/settings/general");
    await language.tap();
    await screen.getByRole("option", "简体中文").tap();
    await expect(language).toHaveText("简体中文");
    await app.open("/");
    await thread.secondaryTap();
    await expect(menu).toBeVisible();
    await app.screenshot("menu-zh-roundtrip");
    await expect(menu).toHaveAccessibleName("上下文菜单");
    await expect(renameZh).toBeVisible();
    await expect(copyZh).toBeVisible();
    await expect(thread).toHaveAccessibleName(fixtureName);
    await browser.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  },
);

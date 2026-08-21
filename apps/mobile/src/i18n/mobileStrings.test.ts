import { describe, expect, it } from "vite-plus/test";

import { localizeAlertArguments, localizeMobileString } from "./mobileStrings";

describe("mobile strings", () => {
  it("keeps English and technical values unchanged", () => {
    expect(localizeMobileString("Settings", "en")).toBe("Settings");
    expect(localizeMobileString("gpt-5.6-sol", "zh-CN")).toBe("gpt-5.6-sol");
    expect(localizeMobileString("feature/mobile-polish", "zh-CN")).toBe("feature/mobile-polish");
  });

  it("translates fixed messages while preserving surrounding whitespace", () => {
    expect(localizeMobileString("  Settings ", "zh-CN")).toBe("  设置 ");
    expect(localizeMobileString("No conversation yet", "zh-CN")).toBe("还没有对话");
  });

  it("translates dynamic thread states", () => {
    expect(localizeMobileString('No threads matching "docs".', "zh-CN")).toBe(
      "没有与“docs”匹配的任务。",
    );
    expect(localizeMobileString("Show more (3 settled hidden)", "zh-CN")).toBe(
      "显示更多（已隐藏 3 个已收起任务）",
    );
  });

  it("translates alert titles, messages, and button labels", () => {
    expect(
      localizeAlertArguments(
        "No open PR",
        "This branch does not have an open pull request.",
        [{ text: "Cancel" }, { text: "Confirm" }],
        "zh-CN",
      ),
    ).toEqual({
      title: "没有打开的 PR",
      message: "此分支没有打开的 Pull Request。",
      buttons: [{ text: "取消" }, { text: "确认" }],
    });
  });
});

import { describe, expect, it } from "vite-plus/test";
import { translateWebMessage, translateWebSource } from "./messages";
import { splitWebTranslation, type WebTranslate } from "./WebI18nContext";

describe("guest and account link copy", () => {
  it("retains filenames, model names, and repository identifiers as user content", () => {
    expect(translateWebMessage("zh-CN", "guest.removeFile", { name: "Review-{count}.txt" })).toBe(
      "移除 Review-{count}.txt",
    );
    expect(translateWebMessage("zh-CN", "guest.modelLabel", { model: "Open / My Model" })).toBe(
      "模型：Open / My Model",
    );
    expect(
      translateWebMessage("zh-CN", "promptLink.summary.pullRequest", {
        repository: "Open/Review",
        number: 42,
      }),
    ).toBe("拉取请求 Open/Review#42");
    expect(
      translateWebMessage("en", "promptLink.modelUnavailable", {
        model: "null",
        provider: "Custom",
      }),
    ).toBe(
      "The link asked for null, which Custom does not offer here, so its default model is used.",
    );
  });
  it("keeps the singular and plural hidden-character warnings", () => {
    expect(translateWebMessage("en", "promptLink.hiddenOne", { count: 1 })).toBe(
      "T3 Code removed 1 hidden character. Read the prompt before you send it.",
    );
    expect(translateWebMessage("en", "promptLink.hiddenMany", { count: 2 })).toBe(
      "T3 Code removed 2 hidden characters. Read the prompt before you send it.",
    );
    expect(translateWebMessage("zh-CN", "promptLink.hiddenMany", { count: 2 })).toBe(
      "T3 Code 已移除 2 个隐藏字符。发送前请先检查提示词。",
    );
  });
  it("preserves inline account confirmation and upgrade links in both locales", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const t: WebTranslate = (key, values) => translateWebMessage(locale, key, values);
      const [before, after] = splitWebTranslation(t, "t3Chat.confirmLink", "site");
      expect(`${before}t3.chat${after}`).toBe(
        locale === "en"
          ? "Confirm on t3.chat, then select Refresh."
          : "请在 t3.chat 确认，然后选择刷新。",
      );
      const [planBefore, planAfter] = splitWebTranslation(t, "t3Chat.plan.pro", "upgrade", {
        pro: 2,
        premier: 5,
      });
      expect(`${planBefore}UPGRADE${planAfter}`).toContain("UPGRADE");
      expect(`${planBefore}${planAfter}`).toContain("2");
      expect(`${planBefore}${planAfter}`).toContain("5");
    }
  });
  it("retains security and approval information in Chinese", () => {
    expect(
      translateWebSource("zh-CN", "This prompt had hidden characters, it may be malicious"),
    ).toContain("恶意");
    expect(
      translateWebSource(
        "zh-CN",
        "This puts the pull request's code in a new worktree and runs your project's setup script on it.",
      ),
    ).toContain("运行项目的初始化脚本");
    expect(
      translateWebSource(
        "zh-CN",
        "The owner sees your name and approves each message before the agent gets it.",
      ),
    ).toContain("逐条批准");
    expect(
      translateWebSource("zh-CN", "It opens as a draft. Nothing runs until you press Send."),
    ).toContain("只有点击发送后才会运行");
  });
  it("localizes tunnel counts without changing limits", () => {
    expect(translateWebMessage("en", "tunnels.inUse", { used: 1, limit: 3 })).toBe(
      "1 of 3 tunnels in use",
    );
    expect(translateWebMessage("zh-CN", "tunnels.inUse", { used: 1, limit: 3 })).toBe(
      "已使用 1/3 条隧道",
    );
    expect(translateWebMessage("zh-CN", "tunnels.upgrade.pro", { pro: 2, premier: 5 })).toBe(
      "升级到 T3 Chat Pro 可使用最多 2 条隧道，Premier 可使用最多 5 条。",
    );
  });
});

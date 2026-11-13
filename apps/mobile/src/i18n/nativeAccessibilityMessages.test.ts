import { describe, expect, it } from "vite-plus/test";
import { pullRequestReactionTooltip } from "@t3tools/client-runtime/pull-request-reactions";
import {
  mobileConnectionHeadline,
  mobileReactionTooltip,
  mobileSubagentSummary,
} from "./nativeAccessibilityMessages";

describe("native accessibility display messages", () => {
  it("localizes only generated subagent status summaries", () => {
    expect(mobileSubagentSummary("2 working · 1 done · 3 idle", "zh-CN")).toBe(
      "2 运行中 · 1 已完成 · 3 空闲",
    );
    expect(mobileSubagentSummary("2 working · 1 done", "en")).toBe("2 working · 1 done");
    expect(mobileSubagentSummary("2 working · provider error", "zh-CN")).toBe(
      "2 working · provider error",
    );
  });
  it("preserves actor identities and the host's count when localizing reactions", () => {
    const base = {
      content: "thumbs-up" as const,
      actors: ["You", "Settings {0} $&"],
      count: 4,
      viewerHasReacted: true,
    };
    expect(mobileReactionTooltip(base, "zh-CN")).toBe(
      "你、You、Settings {0} $&、另外 1 人 用赞表情回应",
    );
    expect(mobileReactionTooltip(base, "en")).toBe(pullRequestReactionTooltip(base));
    expect(mobileReactionTooltip({ ...base, count: 2 }, "zh-CN")).toBe(
      "You、Settings {0} $& 用赞表情回应",
    );
    expect(mobileReactionTooltip({ ...base, actors: [], viewerHasReacted: false }, "zh-CN")).toBe(
      "4 人 用赞表情回应",
    );
  });
  it("translates generated connection templates without interpreting host names or unknown errors", () => {
    const host = "Settings {0} $&";
    const headline = `${host}'s tunnel is offline`;
    expect(mobileConnectionHeadline(headline, host, "zh-CN")).toBe(`${host} 的隧道已离线`);
    expect(mobileConnectionHeadline(headline, host, "en")).toBe(headline);
    expect(mobileConnectionHeadline("provider: E_UNKNOWN", host, "zh-CN")).toBe(
      "provider: E_UNKNOWN",
    );
  });
});

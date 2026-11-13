import { RunId } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { describe, expect, it, vi } from "vite-plus/test";

import { usageLimitRecoveryBannerItem } from "./UsageLimitRecoveryBanner";
import * as webI18n from "~/i18n/readWebI18n";
import { translateWebMessage } from "~/i18n/messages";
import {
  CHATGPT_USAGE_LIMIT_CODE,
  CHATGPT_WORKSPACE_USAGE_LIMIT_CODE,
} from "@t3tools/shared/usageLimits";

const stoppedAt = new Date(2026, 9, 20, 12, 0);

function bannerDescription(resetAt: Date, timestampFormat: TimestampFormat) {
  return usageLimitRecoveryBannerItem({
    runId: RunId.make("run-1"),
    errorCode: null,
    resetAt: resetAt.toISOString(),
    stoppedAt: stoppedAt.toISOString(),
    settled: false,
    requestPending: false,
    snoozedUntil: null,
    recovery: null,
    timestampFormat,
    onChange: async () => {},
  }).description;
}

describe("usageLimitRecoveryBannerItem", () => {
  it.each([
    ["12-hour", "Resets 5:30 PM"],
    ["24-hour", "Resets 17:30"],
  ] as const)("formats a same-day reset with the %s setting", (timestampFormat, expected) => {
    using _now = vi.spyOn(Date, "now").mockReturnValue(stoppedAt.getTime());
    expect(bannerDescription(new Date(2026, 9, 20, 17, 30), timestampFormat)).toBe(expected);
  });

  it("names the day when the reset is tomorrow", () => {
    using _now = vi.spyOn(Date, "now").mockReturnValue(stoppedAt.getTime());
    expect(bannerDescription(new Date(2026, 9, 21, 17, 30), "24-hour")).toBe(
      "Resets tomorrow at 17:30",
    );
  });
});

it("rebuilds ChatGPT workspace and personal notices in the current locale without changing recovery IDs", () => {
  using readI18n = vi.spyOn(webI18n, "readWebI18n");
  for (const locale of ["zh-CN", "en"] as const) {
    readI18n.mockReturnValue({
      locale,
      t: (key, values) => translateWebMessage(locale, key, values),
    });
    for (const errorCode of [CHATGPT_WORKSPACE_USAGE_LIMIT_CODE, CHATGPT_USAGE_LIMIT_CODE]) {
      const item = usageLimitRecoveryBannerItem({
        runId: RunId.make("chatgpt-recovery"),
        errorCode,
        resetAt: null,
        stoppedAt: stoppedAt.toISOString(),
        settled: false,
        requestPending: false,
        snoozedUntil: null,
        recovery: null,
        timestampFormat: "24-hour",
        onChange: async () => {},
      });
      expect(item.id).toBe("usage-limit-recovery:chatgpt-recovery");
      expect(item.title).toBe(
        locale === "en" ? "ChatGPT usage limit reached" : "已达到 ChatGPT 使用上限",
      );
      expect(item.description).toBe(
        errorCode === CHATGPT_WORKSPACE_USAGE_LIMIT_CODE
          ? locale === "en"
            ? "You've reached your workspace's limit for using your ChatGPT plan in other apps."
            : "你在其他应用中使用 ChatGPT 套餐的额度已达到工作区上限。"
          : locale === "en"
            ? "Reset time unavailable; retry manually"
            : "重置时间不可用，请手动重试",
      );
      expect(item.actions).not.toBeNull();
    }
  }
});

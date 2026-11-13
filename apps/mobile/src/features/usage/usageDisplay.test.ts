import { localizeMobileString } from "../../i18n/mobileStrings";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { describe, expect, it } from "vite-plus/test";
import { resolveUsageAccess } from "@t3tools/client-runtime/state/usage-access";
import {
  formatUsageContractMismatch,
  formatPercent,
  formatTokens,
  formatUsd,
} from "@t3tools/shared/usageFormat";
import {
  mobileUsageContractMismatch,
  mobileUsageError,
  mobileUsageReset,
  mobileUsageSegment,
  mobileUsageShare,
} from "./usageDisplay";

const locale = "zh-CN";
describe("mobile usage display", () => {
  it("translates every wide-chart title and preserves premium amounts", () => {
    expect(
      ["Hourly cost", "Daily cost", "Hourly processed tokens", "Daily processed tokens"].map(
        (title) => localizeMobileString(title, locale),
      ),
    ).toEqual(["每小时成本", "每日成本", "每小时处理的 Token", "每日处理的 Token"]);
    expect(formatMobileMessage("{0} premium", ["$12.34"], locale)).toBe("额外费用 $12.34");
  });
  it("keeps USD and token units distinct for both metrics and unknown prices", () => {
    expect(mobileUsageShare("tokens", 0.25, 1200, 2, false, locale)).toBe(
      `占 Token 的 ${formatPercent(0.25)} · ${formatUsd(2)}`,
    );
    expect(mobileUsageShare("tokens", 0.25, 1200, 2, true, locale)).toBe(
      `占 Token 的 ${formatPercent(0.25)} · 暂无已知费率`,
    );
    expect(mobileUsageShare("cost", 0.25, 1200, 2, false, locale)).toBe(
      `占成本的 ${formatPercent(0.25)} · ${formatTokens(1200)} 个 Token`,
    );
    expect(mobileUsageShare("cost", 0.25, 1200, 2, true, locale)).toBe(
      `暂无已知费率 · ${formatTokens(1200)} 个 Token`,
    );
  });
  it("translates contract templates without consuming environment labels", () => {
    const name = "Settings $& {0}";
    for (const direction of ["serverBehind", "clientBehind"] as const) {
      expect(mobileUsageContractMismatch(name, direction, locale)).toContain(name);
      expect(mobileUsageContractMismatch(name, direction, "en")).toBe(
        formatUsageContractMismatch(name, { direction }),
      );
    }
    expect(mobileUsageContractMismatch(name, "serverBehind", locale)).toBe(
      `${name} 运行的服务器版本较旧，其用量不计入总计。`,
    );
    expect(mobileUsageContractMismatch(name, "clientBehind", locale)).toBe(
      `此客户端版本低于 ${name} 上的服务器，其用量不计入总计。`,
    );
  });
  it("localizes access failures from the producer and preserves unknown error text", () => {
    const failure = resolveUsageAccess({
      connectionPhase: "connected",
      session: null,
      hasSessionError: true,
    });
    expect(mobileUsageError(failure.error!, false, locale)).toBe(
      "无法检查此连接对诊断和用量的访问权限。",
    );
    const offline = resolveUsageAccess({
      connectionPhase: "offline",
      session: null,
      hasSessionError: false,
    });
    expect(mobileUsageError(offline.error!, false, locale)).toBe("此环境未连接。");
    const denied = resolveUsageAccess({
      connectionPhase: "connected",
      session: { authenticated: true, scopes: [] },
      hasSessionError: false,
    });
    expect(mobileUsageError(denied.error!, false, locale)).toBe("此连接无权访问诊断和用量。");
    expect(mobileUsageError("This environment could not report usage.", false, locale)).toBe(
      "此环境无法报告用量。",
    );
    expect(mobileUsageError("Settings", true, locale)).toBe("Settings 正在显示已保存的总计。");
    expect(mobileUsageError("Settings", false, locale)).toBe("Settings");
  });
  it("formats actual reset producer output in short, full, and refill displays", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const window = {
      id: "session",
      kind: "session" as const,
      label: "Session",
      usedPercent: 20,
      resetsAt: "2026-01-02T02:00:00Z",
    };
    expect(mobileUsageReset(window, now, "short", locale)).toBe("1 天 2 小时");
    expect(mobileUsageReset(window, now, "full", locale)).toBe("1 天 2 小时后重置");
    expect(mobileUsageReset(window, now, "refill", locale)).toBe("1 天 2 小时后补充");
    expect(mobileUsageReset({ ...window, resetsAt: undefined }, now, "full", locale)).toBeNull();
    expect(
      mobileUsageReset({ ...window, resetsAt: "2026-01-01T00:00:30Z" }, now, "refill", locale),
    ).toBe("即将重置");
    expect(
      mobileUsageReset({ ...window, resetsAt: "2026-01-01T00:00:00Z" }, now, "full", locale),
    ).toBe("即将重置");
    expect(mobileUsageReset(window, now, "short", "en")).toBe("1d 2h");
    expect(
      mobileUsageSegment(
        2,
        "Settings $& {0}",
        80,
        { reset: mobileUsageReset(window, now, "full", locale), credits: 3 },
        locale,
      ),
    ).toBe("区段 2，Settings $& {0}，剩余 80%，1 天 2 小时后重置，已积攒 3 次重置额度");
    expect(mobileUsageSegment(1, "Usage", 80, { timeLeft: 23.5 }, locale)).toBe(
      "区段 1，Usage，剩余 80%，额度周期剩余 23.5%",
    );
  });
});

import * as NodeModule from "node:module";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { UsageCostSection } from "./UsageCostSection";

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  View: ({
    children,
    style,
  }: {
    children?: ReactNode;
    style?: { flex?: number; backgroundColor?: string };
  }) =>
    createElement(
      "div",
      { style: { flex: style?.flex, backgroundColor: style?.backgroundColor } },
      children,
    ),
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  TextInput: "input",
}));
vi.mock("../settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "light" }),
}));

import { localizeMobileString } from "../../i18n/mobileStrings";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { describe, expect, it, vi } from "vite-plus/test";
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

it("renders owned cost categories in the selected locale without changing amounts, thresholds or the global Input meaning", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
  // Worklets injects a CommonJS warning for plain segment.value used in inline styles.
  const require = NodeModule.createRequire(import.meta.url);
  const animationPath = require.resolve("react-native-reanimated");
  const previousAnimation = require.cache[animationPath];
  const animation = new NodeModule.Module(animationPath);
  animation.filename = animationPath;
  animation.exports = { getUseOfValueInStyleWarning: () => "Inline value style" };
  animation.loaded = true;
  require.cache[animationPath] = animation;
  using _animation = {
    [Symbol.dispose]() {
      if (previousAnimation) require.cache[animationPath] = previousAnimation;
      else delete require.cache[animationPath];
    },
  };
  const merged = {
    costUsd: 20,
    categoryCost: { input: 2, cacheRead: 3, cacheWrite: 4, output: 5, unsplit: 0.005 },
    speedCost: { standard: 6, fast: 7, ultrafast: 8, premium: 9 },
  };
  const before = structuredClone(merged);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    for (const language of ["en", "zh-CN", "en"] as const) {
      await act(async () =>
        root.render(createElement(UsageCostSection, { merged, wide: true, locale: language })),
      );
      const labels = Array.from(container.querySelectorAll("span"), (node) => node.textContent);
      expect(labels).toContain(language === "en" ? "Input" : "输入");
      expect(labels).toContain(language === "en" ? "Other" : "其他");
      expect(labels).toContain(language === "en" ? "Standard" : "标准");
      expect(labels).toContain(language === "en" ? "Fast" : "快速");
      expect(labels).toContain(language === "en" ? "Ultrafast" : "极速");
      expect(labels).not.toContain("待输入");
      for (const cost of [2, 3, 4, 5, 0.005, 6, 7, 8]) expect(labels).toContain(formatUsd(cost));
      expect(labels).toContain(formatMobileMessage("{0} premium", [formatUsd(9)], language));
      expect(
        Array.from(container.querySelectorAll<HTMLElement>("div[style]"), (node) =>
          Number.parseFloat(node.style.flex),
        ).filter(Number.isFinite),
      ).toEqual([2, 3, 4, 5, 0.005, 6, 7, 8]);
      expect(merged).toEqual(before);
    }
    expect(localizeMobileString("Input", "zh-CN")).toBe("待输入");
    const reduced = {
      ...merged,
      categoryCost: { ...merged.categoryCost, cacheWrite: 0, unsplit: 0.004 },
      speedCost: { standard: 6, fast: 0, ultrafast: 0, premium: 0 },
    };
    await act(async () =>
      root.render(
        createElement(UsageCostSection, { merged: reduced, wide: false, locale: "zh-CN" }),
      ),
    );
    const labels = Array.from(container.querySelectorAll("span"), (node) => node.textContent);
    expect(labels).toContain("输入");
    expect(labels).not.toContain("其他");
    expect(labels).not.toContain("缓存写入");
    expect(labels).not.toContain("按速度");
    await act(async () =>
      root.render(
        createElement(UsageCostSection, {
          merged: { ...merged, costUsd: 0 },
          wide: false,
          locale: "zh-CN",
        }),
      ),
    );
    expect(container.textContent).toBe("");
  } finally {
    await act(async () => root.unmount());
  }
});

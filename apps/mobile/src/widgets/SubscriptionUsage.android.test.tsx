import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@expo/ui/jetpack-compose", () => ({
  Button: "Button",
  Column: "Column",
  LinearProgressIndicator: "LinearProgressIndicator",
  Text: "Text",
  getMaterialColors: () => ({
    surface: "background",
    onSurface: "foreground",
    onSurfaceVariant: "secondary",
    surfaceVariant: "track",
    primary: "accent",
    error: "danger",
  }),
}));
vi.mock("@expo/ui/jetpack-compose/modifiers", () => {
  const modifier = () => ({});
  return {
    fillMaxSize: modifier,
    fillMaxWidth: modifier,
    height: modifier,
    padding: modifier,
    paddingAll: modifier,
  };
});
vi.mock("expo-widgets", () => ({ createWidget: () => ({}) }));

import { SubscriptionUsage } from "./SubscriptionUsage.android";
import type { SubscriptionUsageSnapshot } from "./subscriptionUsageSnapshot";

function renderWidget(locale: string, props: SubscriptionUsageSnapshot, now = 1_000) {
  vi.stubEnv("EXPO_PUBLIC_APP_LOCALE", locale);
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  try {
    const tree = SubscriptionUsage(props, {
      colorScheme: "light",
    } as Parameters<typeof SubscriptionUsage>[1]);
    const text: string[] = [];
    const progress: number[] = [];
    const visit = (node: ReactNode) => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!isValidElement<{ children?: ReactNode; progress?: number }>(node)) return;
      if (node.type === "Text") {
        const children = node.props.children;
        text.push(Array.isArray(children) ? children.join("") : String(children));
      }
      if (node.type === "LinearProgressIndicator") progress.push(node.props.progress!);
      visit(node.props.children);
    };
    visit(tree);
    return { text, progress };
  } finally {
    clock.mockRestore();
    vi.unstubAllEnvs();
  }
}

function snapshot(label = "Session"): SubscriptionUsageSnapshot {
  return {
    checkedAt: 0,
    url: "t3code://settings/usage?tab=limits",
    providers: [
      {
        name: label,
        detail: "Subscription remaining",
        windows: [
          { kind: "session", label, remaining: 45, reset: "Next reset Tomorrow {0}/$&" },
          { kind: "weekly", label: "Settings", remaining: 70, reset: "Reset time unavailable" },
          { kind: "monthly", label: "Hidden", remaining: 90, reset: "Next reset Later" },
        ],
        expiresAt: 2_000,
        totalWindows: 3,
      },
    ],
  };
}

describe("SubscriptionUsage Android source boundaries", () => {
  it("renders descriptor-owned labels while retaining legacy and malformed snapshots", () => {
    const suffix = "Settings/$&/{0}\n中文";
    const cases = [
      ["Session", { code: "session" }, "会话"],
      ["Weekly", { code: "weekly" }, "每周"],
      ["Monthly", { code: "monthly" }, "每月"],
      ["Monthly credit limit", { code: "monthlyCreditLimit" }, "每月额度上限"],
      ["Monthly spend", { code: "monthlySpend" }, "每月支出"],
      [`Weekly · ${suffix}`, { code: "weeklyScoped", displayName: suffix }, `每周 · ${suffix}`],
      [
        "Weekly · Settings",
        { code: "weeklyScoped", displayName: "Settings  " },
        "每周 · Settings  ",
      ],
      ["Weekly ·", { code: "weeklyScoped", displayName: "   " }, "每周 ·    "],
      [
        " Weekly · Settings",
        { code: "weeklyScoped", displayName: "Settings  " },
        " Weekly · Settings",
      ],
      ["Session", undefined, "Session"],
      ["Settings", { code: "session" }, "Settings"],
      ["Session ", { code: "session" }, "Session "],
      ["Session", { code: "future" }, "Session"],
      ["Session", null, "Session"],
      ["Session", "session", "Session"],
      ["Session", { code: "constructor" }, "Session"],
      ["Weekly · Settings", { code: "weeklyScoped" }, "Weekly · Settings"],
      ["Weekly · Settings", { code: "weeklyScoped", displayName: "Other" }, "Weekly · Settings"],
      ["Weekly · 42", { code: "weeklyScoped", displayName: 42 }, "Weekly · 42"],
    ] as const;
    for (const [label, labelDescriptor, chinese] of cases) {
      const props = snapshot();
      Object.assign(props.providers[0]!.windows[0]!, { label, labelDescriptor });
      const original = structuredClone(props);
      for (const locale of ["en", "zh-CN", "en"]) {
        const result = renderWidget(locale, props);
        const expected = locale === "zh-CN" ? chinese : label;

        expect(result.text).toContain(
          `${expected} · ${locale === "zh-CN" ? "剩余 45%" : "45% left"}`,
        );
        expect(result.text).toContain(
          locale === "zh-CN" ? "Settings · 剩余 70%" : "Settings · 70% left",
        );
      }
      expect(props).toEqual(original);
    }
  });
  it.each(["en", "zh-CN"])(
    "keeps provider labels literal while localizing owned remaining and reset templates (%s)",
    (locale) => {
      for (const label of [
        "Session",
        "Weekly",
        "Daily",
        "Monthly",
        "1 hour",
        "5 hours",
        "constructor",
        "__proto__",
        "Settings",
        "User's quota/{0}/$&/中文",
        "No limits available",
        "2 accounts · pooled",
        "Next reset Tomorrow",
      ]) {
        const props = snapshot(label);
        const original = structuredClone(props);
        const rendered = renderWidget(locale, props);
        expect(rendered.text).toContain(label);
        expect(rendered.text).toContain(
          `${label} · ${locale === "zh-CN" ? "剩余 45%" : "45% left"}`,
        );
        expect(rendered.text).toContain(
          locale === "zh-CN" ? "Settings · 剩余 70%" : "Settings · 70% left",
        );
        expect(rendered.text).toContain(
          locale === "zh-CN" ? "下次重置：Tomorrow {0}/$&" : "Next reset Tomorrow {0}/$&",
        );
        expect(rendered.text).toContain(
          locale === "zh-CN" ? "重置时间不可用" : "Reset time unavailable",
        );
        expect(rendered.text).toContain(
          locale === "zh-CN" ? "在 T3 中查看另外 1 项" : "1 more in T3",
        );
        expect(rendered.progress).toEqual([0.45, 0.7]);
        expect(props).toEqual(original);
      }
    },
  );

  it.each(["en", "zh-CN"])(
    "matches only owned detail and reset sources, including prototype-shaped values (%s)",
    (locale) => {
      const props = snapshot();
      const provider = props.providers[0]!;
      provider.windows = [];
      for (const [detail, chinese] of [
        ["Open T3 to connect", "打开 T3 以连接"],
        ["Open T3 to refresh", "打开 T3 以刷新"],
        ["No limits available", "暂无可用额度"],
        ["Subscription remaining", "订阅剩余额度"],
        ["2 accounts · pooled", "2 个账户 · 合并额度"],
      ] as const) {
        provider.detail = detail;
        const original = structuredClone(props);
        expect(renderWidget(locale, props).text).toContain(locale === "zh-CN" ? chinese : detail);
        expect(props).toEqual(original);
      }
      for (const detail of [
        "constructor",
        "__proto__",
        "toString",
        "hasOwnProperty",
        "Session",
        "Weekly",
        "5 hours",
        "Settings",
        "Reset time unavailable",
        "Next reset Tomorrow",
        "Team: 2 accounts · pooled",
        "2 accounts · pooled\n",
        "No limits available ",
        "",
      ]) {
        provider.detail = detail;
        expect(renderWidget(locale, props).text).toContain(detail);
      }
      for (const reset of [
        "constructor",
        "__proto__",
        "toString",
        "Open T3 to refresh",
        "No limits available",
        "2 accounts · pooled",
        "Session",
        "5 hours",
        "Settings",
        "Next reset ",
        "Next reset Tomorrow\n",
        "custom: Next reset Tomorrow",
        "",
      ]) {
        const props = snapshot();
        props.providers[0]!.windows[0]!.reset = reset;
        expect(renderWidget(locale, props).text).toContain(reset);
      }
    },
  );

  it.each(["en", "zh-CN"])(
    "keeps expiry and missing-snapshot behavior while localizing owned connection states (%s)",
    (locale) => {
      const props = snapshot("Weekly");
      const original = structuredClone(props);
      expect(renderWidget(locale, props, 1_999).progress).toEqual([0.45, 0.7]);
      const expired = renderWidget(locale, props, 2_000);
      expect(expired.progress).toEqual([]);
      expect(expired.text).toContain("Weekly");
      expect(expired.text).toContain(locale === "zh-CN" ? "打开 T3 以刷新" : "Open T3 to refresh");
      expect(expired.text).not.toContain(
        locale === "zh-CN" ? "在 T3 中查看另外 1 项" : "1 more in T3",
      );
      expect(props).toEqual(original);
      const missing = renderWidget(locale, { checkedAt: 0 } as SubscriptionUsageSnapshot);
      expect(missing.text).toEqual(
        expect.arrayContaining([
          "Codex",
          "Claude",
          locale === "zh-CN" ? "打开 T3 以连接" : "Open T3 to connect",
          locale === "zh-CN" ? "点击以在 T3 中连接" : "Tap to connect in T3",
        ]),
      );
      expect(missing.progress).toEqual([]);
    },
  );
});

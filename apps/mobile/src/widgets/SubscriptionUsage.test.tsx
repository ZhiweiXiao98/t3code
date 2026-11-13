import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@expo/ui/swift-ui", () => ({
  HStack: "HStack",
  ProgressView: "ProgressView",
  Spacer: "Spacer",
  Text: "Text",
  VStack: "VStack",
}));
vi.mock("@expo/ui/swift-ui/modifiers", () => {
  const modifier = () => ({});
  return {
    accessibilityElement: modifier,
    accessibilityLabel: (label: string) => ({ label }),
    containerBackground: modifier,
    environment: modifier,
    fixedSize: modifier,
    font: modifier,
    foregroundStyle: modifier,
    frame: modifier,
    layoutPriority: modifier,
    lineLimit: modifier,
    progressViewStyle: modifier,
    tint: modifier,
    widgetURL: modifier,
  };
});
vi.mock("expo-widgets", () => ({ createWidget: () => ({}) }));

import { SubscriptionUsage } from "./SubscriptionUsage";
import type { SubscriptionUsageSnapshot } from "./subscriptionUsageSnapshot";

function renderWidget(
  locale: string,
  props: SubscriptionUsageSnapshot,
  overrides: Partial<Parameters<typeof SubscriptionUsage>[1]> = {},
) {
  vi.stubEnv("EXPO_PUBLIC_APP_LOCALE", locale);
  try {
    const tree = SubscriptionUsage(props, {
      widgetFamily: "systemLarge",
      widgetRenderingMode: "fullColor",
      colorScheme: "light",
      ...overrides,
    } as Parameters<typeof SubscriptionUsage>[1]);
    const text: string[] = [];
    const labels: string[] = [];
    const visit = (node: ReactNode) => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!isValidElement<{ children?: ReactNode; modifiers?: { label?: string }[] }>(node)) return;
      for (const modifier of node.props.modifiers ?? []) {
        if (modifier.label) labels.push(modifier.label);
      }
      if (node.type === "Text") {
        const children = node.props.children;
        text.push(Array.isArray(children) ? children.join("") : String(children));
      }
      visit(node.props.children);
    };
    visit(tree);
    return { text, labels };
  } finally {
    vi.unstubAllEnvs();
  }
}

function snapshot(): SubscriptionUsageSnapshot {
  return {
    checkedAt: 0,
    providers: [
      {
        name: "Settings",
        detail: "2 accounts · pooled",
        windows: [
          { kind: "session", label: "Session", remaining: 45, reset: "Next reset Tomorrow" },
          { kind: "weekly", label: "Settings", remaining: 70, reset: "Reset time unavailable" },
        ],
        expiresAt: Number.MAX_SAFE_INTEGER,
        totalWindows: 6,
      },
    ],
  };
}

describe("SubscriptionUsage iOS localization", () => {
  it.each(["en", "zh-CN"])(
    "localizes owned copy and accessibility without translating provider labels (%s)",
    (locale) => {
      const result = renderWidget(locale, snapshot());
      expect(result.text).toContain("Settings");
      expect(result.text).toContain("Session");
      if (locale === "zh-CN") {
        expect(result.text).toEqual(
          expect.arrayContaining([
            "2 个账户 · 合并额度",
            "剩余 45%",
            "下次重置：Tomorrow",
            "重置时间不可用",
            "在 T3 中查看另外 2 项",
            "点击以在 T3 中连接",
          ]),
        );
        expect(result.labels).toContain(
          "Settings，Session，剩余百分之 45。下次重置：Tomorrow。2 个账户 · 合并额度。",
        );
        expect(result.text).not.toContain("设置");
        expect(result.text).not.toContain("会话");
      } else {
        expect(result.text).toEqual(
          expect.arrayContaining([
            "2 accounts · pooled",
            "45% left",
            "Next reset Tomorrow",
            "Reset time unavailable",
            "2 more in T3",
            "Tap to connect in T3",
          ]),
        );
        expect(result.labels).toContain(
          "Settings, Session, 45 percent remaining. Next reset Tomorrow. 2 accounts · pooled.",
        );
      }
    },
  );

  it("keeps unknown snapshot detail/reset values literal and matches only owned templates", () => {
    const props = snapshot();
    props.providers[0]!.detail = "Team: 2 accounts · pooled";
    props.providers[0]!.windows[0]!.reset = "Settings";
    const result = renderWidget("zh-CN", props);
    expect(result.text).toContain("Team: 2 accounts · pooled");
    expect(result.text).toContain("Settings");
    expect(result.labels[0]).toContain("。Settings。Team: 2 accounts · pooled。");
    props.providers[0]!.detail = "constructor";
    expect(renderWidget("zh-CN", props).text).toContain("constructor");
  });

  it("localizes expired and missing-period states in full and accessory widgets", () => {
    const props = snapshot();
    props.providers[0]!.expiresAt = 1;
    expect(renderWidget("zh-CN", props).text).toContain("打开 T3 以刷新");
    expect(renderWidget("zh-CN", props, { widgetFamily: "accessoryRectangular" }).text).toContain(
      "打开 T3",
    );
    props.providers[0]!.expiresAt = Number.MAX_SAFE_INTEGER;
    props.providers[0]!.windows = props.providers[0]!.windows.slice(0, 1);
    const configuration = { codexPeriod: "weekly" as const };
    expect(renderWidget("zh-CN", props, { configuration }).text).toContain("未报告每周额度");
    const accessory = renderWidget("zh-CN", props, {
      configuration,
      widgetFamily: "accessoryRectangular",
    });
    expect(accessory.text).toContain("不适用");
    expect(accessory.labels).toContain("Settings. 未报告每周额度.");
    expect(renderWidget("en", props, { configuration }).text).toContain("No weekly limit reported");
  });

  it("localizes empty, connection, and dated snapshots", () => {
    const empty = { checkedAt: 0, providers: [] };
    expect(renderWidget("zh-CN", empty).text).toContain("暂无可用的订阅额度。");
    // Gallery previews can omit providers before the first app snapshot arrives.
    expect(renderWidget("zh-CN", { checkedAt: 0 } as SubscriptionUsageSnapshot).text).toContain(
      "打开 T3 以连接",
    );
    const props = snapshot();
    props.checkedAt = Date.UTC(2026, 0, 2, 12, 30);
    expect(renderWidget("zh-CN", props).text).toContain(
      `更新于 ${new Date(props.checkedAt).toLocaleString("zh-CN", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}`,
    );
    expect(renderWidget("en", props).text).toContain(
      `As of ${new Date(props.checkedAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}`,
    );
  });
});

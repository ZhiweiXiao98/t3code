import { HStack, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityLabel,
  containerBackground,
  environment,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  progressViewStyle,
  tint,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { SubscriptionUsageSnapshot as SubscriptionUsageProps } from "./subscriptionUsageSnapshot";

type UsageConfiguration = {
  codexPeriod?: "auto" | "session" | "weekly";
  claudePeriod?: "auto" | "session" | "weekly";
};

export function SubscriptionUsage(
  props: SubscriptionUsageProps,
  widgetEnvironment: WidgetEnvironment<UsageConfiguration> & {
    showsContainerBackground?: boolean;
  },
) {
  "widget";
  // The extension evaluates this function without the app's module scope.
  const isChinese = process.env.EXPO_PUBLIC_APP_LOCALE === "zh-CN";
  const copy = (english: string, chinese: string) => (isChinese ? chinese : english);
  const localizeWindowLabel = (window: { label: string; labelDescriptor?: unknown }): string => {
    if (!isChinese) return window.label;
    const descriptor = window.labelDescriptor;
    if (typeof descriptor !== "object" || descriptor === null || !("code" in descriptor)) {
      return window.label;
    }
    let english: string;
    let chinese: string;
    switch (descriptor.code) {
      case "session":
        english = "Session";
        chinese = "会话";
        break;
      case "weekly":
        english = "Weekly";
        chinese = "每周";
        break;
      case "monthly":
        english = "Monthly";
        chinese = "每月";
        break;
      case "monthlyCreditLimit":
        english = "Monthly credit limit";
        chinese = "每月额度上限";
        break;
      case "monthlySpend":
        english = "Monthly spend";
        chinese = "每月支出";
        break;
      case "weeklyScoped":
        if (!("displayName" in descriptor) || typeof descriptor.displayName !== "string") {
          return window.label;
        }
        english = `Weekly · ${descriptor.displayName}`;
        chinese = `每周 · ${descriptor.displayName}`;
        break;
      default:
        return window.label;
    }
    return window.label === english ||
      (descriptor.code === "weeklyScoped" && window.label === english.trim())
      ? chinese
      : window.label;
  };
  const localizeDetail = (value: string) => {
    if (!isChinese) return value;
    const messages: Record<string, string> = {
      "Open T3 to connect": "打开 T3 以连接",
      "Open T3 to refresh": "打开 T3 以刷新",
      "No limits available": "暂无可用额度",
      "Subscription remaining": "订阅剩余额度",
    };
    if (Object.hasOwn(messages, value)) return messages[value]!;
    const pooled = /^(\d+) accounts · pooled$/.exec(value);
    return pooled ? `${pooled[1]} 个账户 · 合并额度` : value;
  };
  const localizeReset = (value: string) => {
    if (!isChinese) return value;
    if (value === "Reset time unavailable") return "重置时间不可用";
    const reset = /^Next reset (.+)$/.exec(value);
    return reset ? `下次重置：${reset[1]}` : value;
  };
  const remaining = (value: number) => copy(`${value}% left`, `剩余 ${value}%`);
  const usageLabel = (
    name: string,
    window: { label: string; labelDescriptor?: unknown; remaining: number; reset: string },
    detail: string,
  ) =>
    copy(
      `${name}, ${localizeWindowLabel(window)}, ${window.remaining} percent remaining. ${localizeReset(window.reset)}. ${detail}.`,
      `${name}，${localizeWindowLabel(window)}，剩余百分之 ${window.remaining}。${localizeReset(window.reset)}。${localizeDetail(detail)}。`,
    );
  const family = widgetEnvironment.widgetFamily;
  // Gallery snapshots can render an old timeline entry after it has expired.
  const now = Math.max(widgetEnvironment.date?.getTime() ?? 0, Date.now());
  const accessory = family === "accessoryRectangular";
  const compact =
    family === "systemSmall" || accessory || widgetEnvironment.levelOfDetail === "simplified";
  const dense = family === "systemSmall" || family === "systemMedium";
  const limit = family === "systemExtraLarge" ? 6 : family === "systemLarge" ? 4 : 2;
  const monochrome =
    widgetEnvironment.widgetRenderingMode !== "fullColor" || widgetEnvironment.isLuminanceReduced;
  const mode = props.theme?.mode;
  const appearance =
    mode === "light" || mode === "dark"
      ? mode
      : widgetEnvironment.colorScheme === "dark"
        ? "dark"
        : "light";
  // StandBy can remove the card even in full color; text must then follow the host.
  const palette =
    !accessory && !monochrome && widgetEnvironment.showsContainerBackground !== false
      ? props.theme?.[appearance]
      : undefined;
  const primary = palette?.foreground ?? "primary";
  const secondary = palette?.secondary ?? "secondary";
  const providers = props.providers ?? [
    { name: "Codex", detail: "Open T3 to connect", windows: [], expiresAt: 0 },
    { name: "Claude", detail: "Open T3 to connect", windows: [], expiresAt: 0 },
  ];
  const columns = providers.map((provider) => {
    const stale = provider.windows.length > 0 && now >= provider.expiresAt;
    const period =
      widgetEnvironment.configuration?.[
        provider.name === "Claude" ? "claudePeriod" : "codexPeriod"
      ] ?? "auto";
    const windows = stale
      ? []
      : provider.windows.filter((window) => period === "auto" || window.kind === period);
    const tightest = windows.reduce<(typeof windows)[number] | undefined>(
      (result, window) => (!result || window.remaining < result.remaining ? window : result),
      undefined,
    );
    const compactWindows = [
      windows.find((window) => window.kind === "session"),
      windows.find((window) => window.kind === "weekly"),
    ].filter((window) => window !== undefined);
    const shown =
      accessory || widgetEnvironment.levelOfDetail === "simplified"
        ? tightest
          ? [tightest]
          : []
        : family === "systemSmall" && compactWindows.length > 0
          ? compactWindows
          : period === "auto" && compactWindows.length > 0
            ? [
                ...compactWindows,
                ...windows.filter((window) => !compactWindows.includes(window)),
              ].slice(0, limit)
            : windows.slice(0, limit);
    const detail = stale
      ? copy("Open T3 to refresh", "打开 T3 以刷新")
      : period !== "auto" && windows.length === 0 && provider.windows.length > 0
        ? copy(`No ${period} limit reported`, `未报告${period === "session" ? "会话" : "每周"}额度`)
        : localizeDetail(provider.detail);
    const barModifiers = [
      progressViewStyle("linear"),
      frame({ height: 4 }),
      ...(monochrome ? [] : [tint(provider.name === "Claude" ? "#d97757" : "#8e8e93")]),
    ];
    if (accessory) {
      return (
        <VStack
          key={provider.name}
          alignment="leading"
          spacing={2}
          modifiers={[
            accessibilityElement("ignore"),
            accessibilityLabel(
              tightest
                ? usageLabel(provider.name, tightest, provider.detail)
                : `${provider.name}. ${detail}.`,
            ),
          ]}
        >
          <HStack spacing={4}>
            <Text
              modifiers={[
                font({ textStyle: "caption", weight: "semibold" }),
                lineLimit(1),
                foregroundStyle(primary),
              ]}
            >
              {provider.name}
              {tightest ? ` · ${localizeWindowLabel(tightest)}` : ""}
            </Text>
            <Spacer />
            <Text
              modifiers={[
                font({ textStyle: "caption", weight: "semibold" }),
                lineLimit(1),
                layoutPriority(1),
                foregroundStyle(primary),
              ]}
            >
              {tightest
                ? remaining(tightest.remaining)
                : period !== "auto" && !stale && provider.windows.length > 0
                  ? copy("N/A", "不适用")
                  : copy("Open T3", "打开 T3")}
            </Text>
          </HStack>
          {tightest ? (
            <ProgressView value={tightest.remaining / 100} modifiers={barModifiers} />
          ) : null}
        </VStack>
      );
    }
    return (
      <VStack
        key={provider.name}
        alignment="leading"
        spacing={dense ? 1 : compact ? 2 : 4}
        modifiers={[
          frame({ maxWidth: Infinity, alignment: "leading" }),
          fixedSize({ horizontal: false, vertical: true }),
        ]}
      >
        <Text
          modifiers={[
            font({ textStyle: compact ? "caption" : "headline", weight: "bold" }),
            lineLimit(1),
            foregroundStyle(primary),
          ]}
        >
          {provider.name}
        </Text>
        {!compact || shown.length === 0 ? (
          <Text
            modifiers={[font({ textStyle: "caption2" }), foregroundStyle(secondary), lineLimit(1)]}
          >
            {detail === localizeDetail("Subscription remaining") ? " " : detail}
          </Text>
        ) : null}
        {shown.map((window) => (
          <VStack
            key={window.label}
            alignment="leading"
            spacing={dense ? 1 : 2}
            modifiers={[
              accessibilityElement("ignore"),
              accessibilityLabel(usageLabel(provider.name, window, provider.detail)),
            ]}
          >
            <HStack spacing={4}>
              <Text
                modifiers={[
                  font({ textStyle: compact || dense ? "caption2" : "caption" }),
                  foregroundStyle(secondary),
                  lineLimit(1),
                ]}
              >
                {localizeWindowLabel(window)}
              </Text>
              <Spacer />
              <Text
                modifiers={[
                  font({
                    textStyle: compact || dense ? "caption2" : "caption",
                    weight: "semibold",
                  }),
                  lineLimit(1),
                  layoutPriority(1),
                  foregroundStyle(
                    window.remaining <= 10 && !monochrome
                      ? (palette?.danger ??
                          (widgetEnvironment.colorScheme === "light" ? "#dc2626" : "#fca5a5"))
                      : primary,
                  ),
                ]}
              >
                {remaining(window.remaining)}
              </Text>
            </HStack>
            <ProgressView value={window.remaining / 100} modifiers={barModifiers} />
            {!compact ? (
              <Text modifiers={[font({ size: 10 }), foregroundStyle(secondary), lineLimit(1)]}>
                {localizeReset(window.reset)}
              </Text>
            ) : null}
          </VStack>
        ))}
        {!compact &&
        !stale &&
        (period === "auto" ? (provider.totalWindows ?? windows.length) : windows.length) > limit ? (
          <Text
            modifiers={[font({ textStyle: "caption2" }), foregroundStyle(secondary), lineLimit(1)]}
          >
            {copy(
              `${(period === "auto" ? (provider.totalWindows ?? windows.length) : windows.length) - limit} more in T3`,
              `在 T3 中查看另外 ${(period === "auto" ? (provider.totalWindows ?? windows.length) : windows.length) - limit} 项`,
            )}
          </Text>
        ) : null}
      </VStack>
    );
  });
  return (
    <VStack
      alignment="leading"
      spacing={accessory || dense ? 2 : 6}
      modifiers={[
        ...(props.url ? [widgetURL(props.url)] : []),
        ...(palette
          ? [
              containerBackground(palette.background, "widget"),
              environment("colorScheme", appearance),
            ]
          : []),
      ]}
    >
      {providers.length === 0 ? (
        <Text modifiers={[font({ textStyle: "caption" }), foregroundStyle(secondary)]}>
          {copy("No subscription limits available.", "暂无可用的订阅额度。")}
        </Text>
      ) : compact ? (
        <VStack alignment="leading" spacing={accessory || dense ? 4 : 8}>
          {columns}
        </VStack>
      ) : (
        <HStack alignment="top" spacing={16}>
          {columns}
        </HStack>
      )}
      {!accessory ? <Spacer /> : null}
      {!accessory ? (
        <Text
          modifiers={[font({ textStyle: "caption2" }), foregroundStyle(secondary), lineLimit(1)]}
        >
          {props.checkedAt
            ? `${copy("As of", "更新于")} ${new Date(props.checkedAt).toLocaleString(isChinese ? "zh-CN" : undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}`
            : copy("Tap to connect in T3", "点击以在 T3 中连接")}
        </Text>
      ) : null}
    </VStack>
  );
}

export default createWidget("SubscriptionUsage", SubscriptionUsage);

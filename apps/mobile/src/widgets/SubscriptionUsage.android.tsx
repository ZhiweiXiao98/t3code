import {
  Button,
  Column,
  getMaterialColors,
  LinearProgressIndicator,
  Text,
} from "@expo/ui/jetpack-compose";
import {
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { SubscriptionUsageSnapshot as SubscriptionUsageProps } from "./subscriptionUsageSnapshot";

export function SubscriptionUsage(props: SubscriptionUsageProps, environment: WidgetEnvironment) {
  "widget";
  // The widget has no app module scope: keep helpers local and let Expo inline the locale.
  // Android has no timeline; expiry alarms and taps re-render to refresh freshness.
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
    return pooled && pooled[0] === value ? `${pooled[1]} 个账户 · 合并额度` : value;
  };
  const localizeReset = (value: string) => {
    if (!isChinese) return value;
    if (value === "Reset time unavailable") return "重置时间不可用";
    const reset = /^Next reset (.+)$/.exec(value);
    return reset && reset[0] === value ? `下次重置：${reset[1]}` : value;
  };
  const now = Date.now();
  const limit = 2;
  const mode = props.theme?.mode;
  const appearance =
    mode === "light" || mode === "dark"
      ? mode
      : environment.colorScheme === "dark"
        ? "dark"
        : "light";
  const palette = props.theme?.[appearance];
  const colors = palette
    ? {
        surface: palette.background,
        onSurface: palette.foreground,
        onSurfaceVariant: palette.secondary,
        surfaceVariant: palette.track,
        primary: palette.accent,
        error: palette.danger,
      }
    : getMaterialColors({ scheme: appearance });
  const muted = colors.onSurfaceVariant;
  const providers = props.providers ?? [
    { name: "Codex", detail: "Open T3 to connect", windows: [], expiresAt: 0, totalWindows: 0 },
    { name: "Claude", detail: "Open T3 to connect", windows: [], expiresAt: 0, totalWindows: 0 },
  ];
  return (
    // Android lacks widgetURL; one card Button routes taps to the app listener opening props.url.
    <Button
      colors={{ containerColor: colors.surface }}
      modifiers={[fillMaxSize()]}
      onClick={() => {}}
    >
      <Column modifiers={[fillMaxSize(), paddingAll(16)]}>
        {providers.map((provider, index) => {
          const stale =
            provider.windows.length > 0 && provider.expiresAt > 0 && now >= provider.expiresAt;
          const shown = stale ? [] : provider.windows.slice(0, limit);
          const hidden = stale ? 0 : (provider.totalWindows ?? provider.windows.length) - limit;
          return (
            <Column
              key={provider.name}
              modifiers={[fillMaxWidth(), padding(0, index === 0 ? 0 : 10, 0, 0)]}
            >
              <Text
                color={colors.onSurface}
                maxLines={1}
                style={{ fontSize: 13, fontWeight: "bold" }}
              >
                {provider.name}
              </Text>
              {shown.length === 0 ? (
                <Text color={muted} maxLines={1} style={{ fontSize: 11 }}>
                  {localizeDetail(stale ? "Open T3 to refresh" : provider.detail)}
                </Text>
              ) : null}
              {shown.map((window) => {
                const low = window.remaining <= 10;
                return (
                  <Column key={window.label} modifiers={[fillMaxWidth(), padding(0, 4, 0, 0)]}>
                    <Text
                      color={low ? colors.error : colors.onSurface}
                      maxLines={1}
                      style={{ fontSize: 11 }}
                    >
                      {`${localizeWindowLabel(window)} · ${isChinese ? `剩余 ${window.remaining}%` : `${window.remaining}% left`}`}
                    </Text>
                    <Column modifiers={[fillMaxWidth(), padding(0, 3, 0, 3)]}>
                      <LinearProgressIndicator
                        progress={window.remaining / 100}
                        color={low ? colors.error : colors.primary}
                        trackColor={colors.surfaceVariant}
                        modifiers={[fillMaxWidth(), height(6)]}
                      />
                    </Column>
                    <Text color={muted} maxLines={1} style={{ fontSize: 10 }}>
                      {localizeReset(window.reset)}
                    </Text>
                  </Column>
                );
              })}
              {hidden > 0 ? (
                <Text color={muted} maxLines={1} style={{ fontSize: 10 }}>
                  {isChinese ? `在 T3 中查看另外 ${hidden} 项` : `${hidden} more in T3`}
                </Text>
              ) : null}
            </Column>
          );
        })}
        <Text
          color={muted}
          maxLines={1}
          style={{ fontSize: 10 }}
          modifiers={[padding(0, 10, 0, 0)]}
        >
          {props.checkedAt
            ? `${copy("As of", "更新于")} ${new Date(props.checkedAt).toLocaleString(isChinese ? "zh-CN" : undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}`
            : copy("Tap to connect in T3", "点击以在 T3 中连接")}
        </Text>
      </Column>
    </Button>
  );
}

export default createWidget("SubscriptionUsage", SubscriptionUsage);

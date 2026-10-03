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
  // The widget runtime evaluates this function without the app's module scope.
  // Android has no timeline, so freshness is decided on every render; the
  // expiry alarm and each tap trigger one while the app is closed.
  // Expo inlines this build setting before serializing the widget function.
  // Keep all translation helpers inside it: the OS has no app module scope.
  const isChinese = process.env.EXPO_PUBLIC_APP_LOCALE === "zh-CN";
  const copy = (english: string, chinese: string) => (isChinese ? chinese : english);
  const localizeValue = (value: string) => {
    if (!isChinese) return value;
    const messages: Record<string, string> = {
      "Open T3 to connect": "打开 T3 以连接",
      "Open T3 to refresh": "打开 T3 以刷新",
      "No limits available": "暂无可用额度",
      "Subscription remaining": "订阅剩余额度",
      "Reset time unavailable": "重置时间不可用",
      Session: "会话",
      Weekly: "每周",
      Daily: "每日",
      Monthly: "每月",
    };
    if (messages[value]) return messages[value];
    const pooled = /^(\d+) accounts · pooled$/.exec(value);
    if (pooled) return `${pooled[1]} 个账户 · 合并额度`;
    const hours = /^(\d+) hours?$/.exec(value);
    if (hours) return `${hours[1]} 小时`;
    const reset = /^Next reset (.+)$/.exec(value);
    return reset ? `下次重置：${reset[1]}` : value;
  };
  const now = Date.now();
  // The 4x3 default cell fits two quotas per provider with their reset text.
  const limit = 2;
  const colors = getMaterialColors({
    scheme: environment.colorScheme === "dark" ? "dark" : "light",
  });
  const muted = colors.onSurfaceVariant;
  const providers = props.providers ?? [
    { name: "Codex", detail: "Open T3 to connect", windows: [], expiresAt: 0, totalWindows: 0 },
    { name: "Claude", detail: "Open T3 to connect", windows: [], expiresAt: 0, totalWindows: 0 },
  ];
  return (
    // The card is one Button so a tap reaches the app's interaction listener,
    // which opens props.url. expo-widgets has no Android counterpart to widgetURL.
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
                  {localizeValue(stale ? "Open T3 to refresh" : provider.detail)}
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
                      {`${localizeValue(window.label)} · ${isChinese ? `剩余 ${window.remaining}%` : `${window.remaining}% left`}`}
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
                      {localizeValue(window.reset)}
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

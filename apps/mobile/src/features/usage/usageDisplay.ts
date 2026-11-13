import {
  formatUsageContractMismatch,
  formatPercent,
  formatTokens,
  formatUsd,
} from "@t3tools/shared/usageFormat";
import { formatResetsIn } from "@t3tools/shared/usageLimits";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function mobileUsageShare(
  metric: "cost" | "tokens",
  share: number,
  tokens: number,
  cost: number,
  unknown = false,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (metric === "tokens")
    return formatMobileMessage(
      "{0} of tokens · {1}",
      [
        formatPercent(share),
        unknown ? localizeMobileString("no known rates", locale) : formatUsd(cost),
      ],
      locale,
    );
  return unknown
    ? formatMobileMessage("no known rates · {0} tokens", [formatTokens(tokens)], locale)
    : formatMobileMessage(
        "{0} of cost · {1} tokens",
        [formatPercent(share), formatTokens(tokens)],
        locale,
      );
}

export function mobileUsageContractMismatch(
  label: string,
  direction: "serverBehind" | "clientBehind",
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return formatMobileMessage(formatUsageContractMismatch("{0}", { direction }), [label], locale);
}

const OWNED_USAGE_ERRORS = new Set([
  "This environment could not report usage.",
  "Could not check this connection's access to diagnostics and usage.",
  "This environment is not connected.",
  "This connection does not have access to diagnostics and usage.",
]);
export function mobileUsageError(
  error: string,
  saved = false,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const message = OWNED_USAGE_ERRORS.has(error) ? localizeMobileString(error, locale) : error;
  return saved ? formatMobileMessage("{0} Showing saved totals.", [message], locale) : message;
}

export function mobileUsageReset(
  window: Parameters<typeof formatResetsIn>[0],
  now: number,
  style: "full" | "short" | "refill" = "full",
  locale: MobileLocale = MOBILE_LOCALE,
): string | null {
  const reset = formatResetsIn(window, now);
  if (reset === null) return null;
  if (locale !== "zh-CN")
    return style === "short"
      ? reset.replace("resets in ", "")
      : style === "refill"
        ? reset.replace("resets in ", "in ").replace("resets now", "now")
        : reset;
  if (!reset.startsWith("resets in ")) return localizeMobileString(reset, locale);
  const duration = reset
    .slice("resets in ".length)
    .replace(/(\d+)d/g, "$1 天")
    .replace(/(\d+)h/g, "$1 小时")
    .replace(/(\d+)m/g, "$1 分钟");
  return style === "short"
    ? duration
    : formatMobileMessage(
        style === "refill" ? "Refills in {0}" : "resets in {0}",
        [duration],
        locale,
      );
}

export function mobileUsageSegment(
  index: number,
  name: string,
  remaining: number,
  details: { timeLeft?: number | null; reset?: string | null; credits?: number },
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const parts = [
    formatMobileMessage("Segment {0}, {1}, {2}% left", [index, name, remaining], locale),
  ];
  if (details.timeLeft != null)
    parts.push(formatMobileMessage("{0}% of the window left", [details.timeLeft], locale));
  if (details.reset) parts.push(details.reset);
  if (details.credits)
    parts.push(formatMobileMessage("{0} reset credits banked", [details.credits], locale));
  return parts.join(locale === "zh-CN" ? "，" : ", ");
}

const USAGE_COST_LABELS = {
  input: ["Input", "输入"],
  cacheRead: ["Cache read", "缓存读取"],
  cacheWrite: ["Cache write", "缓存写入"],
  output: ["Output", "输出"],
  other: ["Other", "其他"],
  standard: ["Standard", "标准"],
  fast: ["Fast", "快速"],
  ultrafast: ["Ultrafast", "极速"],
} as const;

// Only the client-owned usage cost buckets, never provider service-tier labels.
export function mobileUsageCostLabel(
  category: keyof typeof USAGE_COST_LABELS,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return USAGE_COST_LABELS[category][locale === "zh-CN" ? 1 : 0];
}

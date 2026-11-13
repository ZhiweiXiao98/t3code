import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

// Keep diagnostics in English; only explicitly authored display text is localized.
export interface WslFailureReason {
  readonly reason: string;
  readonly localizedReason?: { readonly "zh-CN": string };
}

export const wslFailureReason = (reason: string, chinese: string): WslFailureReason => ({
  reason,
  localizedReason: { "zh-CN": chinese },
});

export const localizeWslFailureReason = (
  failure: WslFailureReason,
  locale: ResolvedAppLocale,
): string =>
  locale === "zh-CN" ? (failure.localizedReason?.[locale] ?? failure.reason) : failure.reason;

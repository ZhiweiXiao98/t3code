import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

export function welcomePrivacyClause(
  locale: ResolvedAppLocale,
  telemetryDisabled: boolean,
): string {
  if (locale === "zh-CN") return telemetryDisabled ? "请参阅" : "如需退出，请参阅";
  return telemetryDisabled ? "See the" : "To opt out, see the";
}

import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

const SUBAGENT_STATUSES = new Set([
  "Starting",
  "Idle",
  "Working",
  "Waiting",
  "Completed",
  "Interrupted",
  "Failed",
  "Cancelled",
]);

/** Only for labels returned by formatProviderSubagentStatus, never provider error text. */
export function localizeMobileSubagentStatus(
  value: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (locale !== "zh-CN") return value;
  if (SUBAGENT_STATUSES.has(value)) return localizeMobileString(value, locale);
  const status =
    /^(Working|Waiting|Idle|Starting|Completed)( in)? (\d+(?:h|m|s)(?: \d+(?:h|m|s))*)$/.exec(
      value,
    );
  if (!status) return value;
  const duration = status[3]!
    .replace(/(\d+)h/g, "$1 小时")
    .replace(/(\d+)m/g, "$1 分钟")
    .replace(/(\d+)s/g, "$1 秒");
  return `${localizeMobileString(status[1]!, locale)}${status[2] ? "，用时" : " "}${duration}`;
}

export function mobileListPosition(
  position: number,
  count: number,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return localizeMobileString("{position} of {count}", locale)
    .replace("{position}", String(position))
    .replace("{count}", String(count));
}

export function mobileRunsOn(environment: string, locale: MobileLocale = MOBILE_LOCALE): string {
  return localizeMobileString("Runs on {environment}", locale).replace(
    "{environment}",
    () => environment,
  );
}

/** Translate UI templates before inserting opaque names, paths, commands, or user text. */
export function formatMobileMessage(
  template: string,
  values: ReadonlyArray<string | number | boolean | null | undefined>,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return localizeMobileString(template, locale).replace(
    /\{(\d+)\}/g,
    (placeholder, key: string) => {
      const index = Number(key);
      return index < values.length ? String(values[index]) : placeholder;
    },
  );
}

/** Local list failures have an application fallback; actual error messages are opaque. */
export function mobilePullRequestListFailure(
  error: unknown,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return error instanceof Error
    ? error.message
    : localizeMobileString("Couldn't load pull requests.", locale);
}

/** Keep real environment error messages untouched; only absent/blank failures use UI copy. */
export function mobileEnvironmentQueryFailure(
  error: unknown,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : localizeMobileString("The environment request failed.", locale);
}

export function mobilePullRequestListFailures(
  results: readonly PromiseSettledResult<unknown>[],
  locale: MobileLocale = MOBILE_LOCALE,
): string | null {
  return (
    results
      .flatMap((result) =>
        result.status === "rejected" ? [mobilePullRequestListFailure(result.reason, locale)] : [],
      )
      .join("\n") || null
  );
}

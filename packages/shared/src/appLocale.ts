import type { AppLocalePreference } from "@t3tools/contracts/settings";

export type ResolvedAppLocale = Exclude<AppLocalePreference, "system">;

function resolveRuntimeLocale(runtimeLocale: string): ResolvedAppLocale | null {
  const candidate = runtimeLocale.trim();
  if (candidate.length === 0) {
    return null;
  }

  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(candidate);
  } catch {
    return null;
  }

  if (locale.language === "en") {
    return "en";
  }
  if (locale.language !== "zh") {
    return null;
  }

  return locale.maximize().script === "Hans" ? "zh-CN" : "en";
}

export function resolveAppLocale(
  preference: AppLocalePreference,
  runtimeLocales: ReadonlyArray<string>,
): ResolvedAppLocale {
  if (preference !== "system") {
    return preference;
  }

  for (const runtimeLocale of runtimeLocales) {
    const resolved = resolveRuntimeLocale(runtimeLocale);
    if (resolved !== null) {
      return resolved;
    }
  }

  return "en";
}

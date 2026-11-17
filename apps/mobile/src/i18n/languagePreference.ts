import { resolveClientLanguage, type AppLocalePreference } from "@t3tools/contracts/settings";

/** Saved language wins; a Chinese distribution supplies only an unset-preference default. */
export function resolveMobileLanguagePreference(
  preferences: {
    readonly language?: string | undefined;
    readonly appLocale?: AppLocalePreference | undefined;
  },
  buildLocale: string | undefined = process.env.EXPO_PUBLIC_APP_LOCALE,
): string {
  if (preferences.language !== undefined || preferences.appLocale !== undefined) {
    return resolveClientLanguage(preferences);
  }
  return resolveClientLanguage({
    appLocale: buildLocale === "zh-CN" ? "zh-CN" : buildLocale === "en" ? "en" : "system",
  });
}

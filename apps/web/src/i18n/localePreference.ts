import { resolveLocale } from "@t3tools/client-runtime/locales";
import {
  resolveClientLanguage,
  type ClientSettingsPatch,
  type AppLocalePreference,
} from "@t3tools/contracts/settings";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./locales";
import { readRuntimeLocales } from "./readRuntimeLocales";

/** New language is authoritative; old appLocale remains a compatibility projection. */
export function resolvedWebLanguage(
  settings: {
    readonly language?: string | undefined;
    readonly appLocale?: AppLocalePreference | undefined;
  },
  runtimeLocales: readonly string[] = readRuntimeLocales(),
): string {
  return resolveLocale(
    resolveClientLanguage(settings),
    runtimeLocales,
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,
  );
}

export function legacyLocaleForLanguage(language: string): "zh-CN" | "en" {
  return language === "zh" || language === "zh-CN" ? "zh-CN" : "en";
}

export function synchronizedLocalePatch(
  patch: ClientSettingsPatch,
): ClientSettingsPatch {
  if (patch.language !== undefined) {
    return {
      ...patch,
      appLocale:
        patch.language === "system"
          ? "system"
          : legacyLocaleForLanguage(patch.language),
    };
  }
  if (patch.appLocale !== undefined) {
    return {
      ...patch,
      language: patch.appLocale === "zh-CN" ? "zh" : patch.appLocale,
    };
  }
  return patch;
}

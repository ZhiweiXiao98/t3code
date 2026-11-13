import type { AppLocalePreference } from "@t3tools/contracts/settings";
import { resolveAppLocale } from "@t3tools/shared/appLocale";
import { readRuntimeLocales } from "./readRuntimeLocales";
import { translateWebMessage, type WebMessageKey, type WebMessageValues } from "./messages";

/** The settings store supplies its own snapshot reader to avoid importing it back through i18n. */
export function createSettingsMessageReader(readPreference: () => AppLocalePreference) {
  return (key: WebMessageKey, values?: WebMessageValues): string =>
    translateWebMessage(resolveAppLocale(readPreference(), readRuntimeLocales()), key, values);
}

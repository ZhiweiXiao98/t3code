import { resolveAppLocale } from "@t3tools/shared/appLocale";
import { readRuntimeLocales } from "./readRuntimeLocales";
import { getClientSettings } from "../hooks/useSettings";
import { translateWebMessage, type WebMessageKey, type WebMessageValues } from "./messages";

/** Capture the current locale for non-React actions, without calling a hook. */
export function readWebI18n() {
  const locale = resolveAppLocale(getClientSettings().appLocale, readRuntimeLocales());
  return {
    locale,
    t: (key: WebMessageKey, values?: WebMessageValues) => translateWebMessage(locale, key, values),
  };
}

import type { AppLocalePreference } from "@t3tools/contracts/settings";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { createContext, useContext } from "react";

import { translateWebMessage, type WebMessageKey, type WebMessageValues } from "./messages";

export type WebTranslate = (key: WebMessageKey, values?: WebMessageValues) => string;

export interface WebI18nContextValue {
  readonly locale: ResolvedAppLocale;
  readonly appLocale: AppLocalePreference;
  readonly setAppLocale: (locale: AppLocalePreference) => void;
  readonly t: WebTranslate;
}

const translateEnglish: WebTranslate = (key, values) => translateWebMessage("en", key, values);
const noopSetAppLocale = (_locale: AppLocalePreference) => undefined;

export const WebI18nContext = createContext<WebI18nContextValue>({
  locale: "en",
  appLocale: "system",
  setAppLocale: noopSetAppLocale,
  t: translateEnglish,
});

/** Read locale state without importing the settings store or connection runtime. */
export function useI18n(): WebI18nContextValue {
  return useContext(WebI18nContext);
}

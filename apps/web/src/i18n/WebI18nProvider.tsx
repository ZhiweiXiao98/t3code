import type { AppLocalePreference } from "@t3tools/contracts/settings";
import { resolveAppLocale, type ResolvedAppLocale } from "@t3tools/shared/appLocale";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useClientSettings, useUpdateClientSettings } from "../hooks/useSettings";
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

const WebI18nContext = createContext<WebI18nContextValue>({
  locale: "en",
  appLocale: "system",
  setAppLocale: noopSetAppLocale,
  t: translateEnglish,
});

function readRuntimeLocales(): ReadonlyArray<string> {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages.length > 0) return [...navigator.languages];
  return navigator.language ? [navigator.language] : [];
}

export function WebI18nProvider({ children }: { readonly children: ReactNode }) {
  const appLocale = useClientSettings((settings) => settings.appLocale);
  const updateClientSettings = useUpdateClientSettings();
  const [runtimeLocales, setRuntimeLocales] = useState(readRuntimeLocales);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleLanguageChange = () => setRuntimeLocales(readRuntimeLocales());
    window.addEventListener("languagechange", handleLanguageChange);
    return () => window.removeEventListener("languagechange", handleLanguageChange);
  }, []);

  const locale = resolveAppLocale(appLocale, runtimeLocales);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setAppLocale = useCallback(
    (nextLocale: AppLocalePreference) => updateClientSettings({ appLocale: nextLocale }),
    [updateClientSettings],
  );
  const t = useCallback<WebTranslate>(
    (key, values) => translateWebMessage(locale, key, values),
    [locale],
  );
  const value = useMemo<WebI18nContextValue>(
    () => ({ appLocale, locale, setAppLocale, t }),
    [appLocale, locale, setAppLocale, t],
  );

  return <WebI18nContext value={value}>{children}</WebI18nContext>;
}

/** English remains available when a standalone component test omits the provider. */
export function useI18n(): WebI18nContextValue {
  return useContext(WebI18nContext);
}

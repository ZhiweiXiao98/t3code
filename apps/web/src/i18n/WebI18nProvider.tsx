import type { AppLocalePreference } from "@t3tools/contracts/settings";
import { resolveAppLocale } from "@t3tools/shared/appLocale";
import { type ReactNode, useEffect, useState } from "react";

import { useClientSettings, updateClientSettings } from "../hooks/useSettings";
import { translateWebMessage } from "./messages";
import { WebI18nContext, type WebI18nContextValue, type WebTranslate } from "./WebI18nContext";

function readRuntimeLocales(): ReadonlyArray<string> {
  const desktopLocale =
    typeof window === "undefined" ? null : (window.desktopBridge?.getSystemLocale?.() ?? null);
  const browserLocales =
    typeof navigator === "undefined"
      ? []
      : navigator.languages.length > 0
        ? [...navigator.languages]
        : navigator.language
          ? [navigator.language]
          : [];
  return desktopLocale ? [desktopLocale, ...browserLocales] : browserLocales;
}

export function WebI18nProvider({ children }: { readonly children: ReactNode }) {
  const appLocale = useClientSettings((settings) => settings.appLocale);
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

  const setAppLocale = (nextLocale: AppLocalePreference) =>
    updateClientSettings({ appLocale: nextLocale });
  const t: WebTranslate = (key, values) => translateWebMessage(locale, key, values);
  const value: WebI18nContextValue = { appLocale, locale, setAppLocale, t };

  return <WebI18nContext value={value}>{children}</WebI18nContext>;
}

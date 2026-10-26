import type { AppLocalePreference } from "@t3tools/contracts/settings";
import { resolveAppLocale } from "@t3tools/shared/appLocale";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "../hooks/useSettings";
import { translateWebMessage, type WebMessageKey, type WebMessageValues } from "./messages";
import { WebI18nContext, type WebI18nContextValue, type WebTranslate } from "./WebI18nContext";

export { useI18n, type WebI18nContextValue, type WebTranslate } from "./WebI18nContext";

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

export function splitWebTranslation(
  t: WebTranslate,
  key: WebMessageKey,
  placeholder: string,
  values: WebMessageValues = {},
): readonly [before: string, after: string] {
  const marker = `\u0000t3-${placeholder}\u0000`;
  const message = t(key, { ...values, [placeholder]: marker });
  const markerIndex = message.indexOf(marker);
  return markerIndex === -1
    ? [message, ""]
    : [message.slice(0, markerIndex), message.slice(markerIndex + marker.length)];
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

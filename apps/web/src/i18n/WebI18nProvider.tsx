import type { AppLocalePreference } from "@t3tools/contracts/settings";
import { resolveAppLocale } from "@t3tools/shared/appLocale";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";

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

function subscribeRuntimeLocale(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

function readSystemLocale() {
  return resolveAppLocale("system", readRuntimeLocales());
}

function readServerLocale() {
  return "en" as const;
}

export function WebI18nProvider({ children }: { readonly children: ReactNode }) {
  const appLocale = useClientSettings((settings) => settings.appLocale);
  const runtimeLocale = useSyncExternalStore(
    subscribeRuntimeLocale,
    readSystemLocale,
    readServerLocale,
  );
  const locale = resolveAppLocale(appLocale, [runtimeLocale]);

  // oxlint-disable-next-line t3code/react-effect-budget -- Synchronize the document language used by screen readers and browser translation with the selected UI locale.
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

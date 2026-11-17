import type { AppLocalePreference } from "@t3tools/contracts/settings";
import { resolveClientLanguage } from "@t3tools/contracts/settings";
import {
  legacyLocaleForLanguage,
  resolvedWebLanguage,
} from "./localePreference";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";

import { useClientSettings, updateClientSettings } from "../hooks/useSettings";
import { readRuntimeLocales } from "./readRuntimeLocales";
import { translateWebMessage } from "./messages";
import {
  WebI18nContext,
  type WebI18nContextValue,
  type WebTranslate,
} from "./WebI18nContext";

function subscribeRuntimeLocale(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

function readSystemLocale() {
  return resolvedWebLanguage({ appLocale: "system" }, readRuntimeLocales());
}

function readServerLocale() {
  return "en" as const;
}

export function WebI18nProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const language = useClientSettings(resolveClientLanguage);
  const appLocale: AppLocalePreference =
    language === "system" ? "system" : legacyLocaleForLanguage(language);
  const runtimeLocale = useSyncExternalStore(
    subscribeRuntimeLocale,
    readSystemLocale,
    readServerLocale,
  );
  const activeLanguage = resolvedWebLanguage({ language }, [runtimeLocale]);
  const locale = legacyLocaleForLanguage(activeLanguage);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Synchronize the document language used by screen readers and browser translation with the selected UI locale.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang =
        activeLanguage === "zh" ? "zh-CN" : activeLanguage;
    }
  }, [activeLanguage]);

  const setAppLocale = (nextLocale: AppLocalePreference) =>
    updateClientSettings({ appLocale: nextLocale });
  const t: WebTranslate = (key, values) =>
    translateWebMessage(locale, key, values);
  const value: WebI18nContextValue = { appLocale, locale, setAppLocale, t };

  return <WebI18nContext value={value}>{children}</WebI18nContext>;
}

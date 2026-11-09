/** Prefer the desktop OS locale to Chromium's packaged locale when available. */
export function readRuntimeLocales(): readonly string[] {
  const browserLocales =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : navigator.language
          ? [navigator.language]
          : [];
  if (typeof window === "undefined") return browserLocales;
  try {
    const systemLocale = window.desktopBridge?.getSystemLocale?.();
    if (typeof systemLocale === "string" && systemLocale.trim()) {
      return [systemLocale, ...browserLocales];
    }
  } catch {
    // A missing or unavailable desktop bridge must not prevent browser fallback.
  }
  return browserLocales;
}

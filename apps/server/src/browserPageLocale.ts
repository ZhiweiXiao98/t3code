import { resolveAppLocale, type ResolvedAppLocale } from "@t3tools/shared/appLocale";

// Callback pages know the browser's languages, not the initiating client's saved preference.
export function browserPageLocale(acceptLanguage: string | undefined): ResolvedAppLocale {
  const preferences = (acceptLanguage ?? "").split(",").flatMap((entry, index) => {
    const match =
      /^([a-z]{1,8}(?:-[a-z0-9]{1,8})*|\*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i.exec(
        entry.trim(),
      );
    if (!match) return [];
    const quality = match[2] === undefined ? 1 : Number(match[2]);
    return quality === 0 ? [] : [{ language: match[1]!, quality, index }];
  });
  preferences.sort((left, right) => right.quality - left.quality || left.index - right.index);
  return resolveAppLocale(
    "system",
    preferences.map(({ language }) => (language === "*" ? "en" : language)),
  );
}

import { expect, it } from "vite-plus/test";
import { resolvedWebLanguage, synchronizedLocalePatch } from "./localePreference";

it("retains old saved choices and gives an explicit new language precedence", () => {
  expect(resolvedWebLanguage({ appLocale: "zh-CN" }, ["en-US"])).toBe("zh");
  expect(resolvedWebLanguage({ appLocale: "en" }, ["zh-CN"])).toBe("en");
  expect(resolvedWebLanguage({ appLocale: "system" }, ["zh-CN"])).toBe("zh");
  expect(resolvedWebLanguage({ language: "fr", appLocale: "zh-CN" }, ["zh-CN"])).toBe("fr");
  expect(resolvedWebLanguage({ language: "system", appLocale: "zh-CN" }, ["en-US"])).toBe("en");
});
it("synchronizes both settings entry points without downgrading new languages", () => {
  expect(synchronizedLocalePatch({ appLocale: "zh-CN" })).toEqual({
    language: "zh",
    appLocale: "zh-CN",
  });
  expect(synchronizedLocalePatch({ language: "en" })).toEqual({
    language: "en",
    appLocale: "en",
  });
  expect(synchronizedLocalePatch({ language: "zh", appLocale: "en" })).toEqual({
    language: "zh",
    appLocale: "zh-CN",
  });
  expect(synchronizedLocalePatch({ language: "de" })).toEqual({
    language: "de",
    appLocale: "en",
  });
  expect(synchronizedLocalePatch({ appLocale: "system" })).toEqual({
    language: "system",
    appLocale: "system",
  });
  const unrelated = { inAppNotificationsEnabled: true };
  expect(synchronizedLocalePatch(unrelated)).toBe(unrelated);
});
it("keeps the last language through serialized settings/restart roundtrip", () => {
  let saved = { appLocale: "zh-CN" as const } as {
    language?: string;
    appLocale: "en" | "zh-CN" | "system";
  };
  for (const [language, expected] of [
    ["en", "en"],
    ["zh", "zh"],
    ["ja", "ja"],
  ] as const) {
    saved = JSON.parse(JSON.stringify({ ...saved, ...synchronizedLocalePatch({ language }) }));
    expect(resolvedWebLanguage(saved, ["en-US"])).toBe(expected);
  }
});

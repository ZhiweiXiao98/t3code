import { describe, expect, it } from "vite-plus/test";
import { resolveMobileLanguagePreference } from "./languagePreference";

describe("mobile language preference migration", () => {
  it("preserves an explicit language, including system, over legacy and Chinese build defaults", () => {
    for (const language of ["en", "zh", "ja", "system"]) {
      expect(resolveMobileLanguagePreference({ language, appLocale: "zh-CN" }, "zh-CN")).toBe(language);
    }
  });
  it("migrates legacy preferences without persisting a second explicit language", () => {
    for (const [appLocale, expected] of [["zh-CN", "zh"], ["en", "en"], ["system", "system"]] as const) {
      const preferences = { appLocale };
      expect(resolveMobileLanguagePreference(preferences, "zh-CN")).toBe(expected);
      expect(preferences).toEqual({ appLocale });
    }
  });
  it("keeps the distribution default only when no preference exists", () => {
    expect(resolveMobileLanguagePreference({}, "zh-CN")).toBe("zh");
    expect(resolveMobileLanguagePreference({}, "en")).toBe("en");
    expect(resolveMobileLanguagePreference({}, "system")).toBe("system");
    expect(resolveMobileLanguagePreference({}, "")).toBe("system");
  });
});

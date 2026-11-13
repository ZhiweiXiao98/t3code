// @effect-diagnostics nodeBuiltinImport:off - checks the production import boundary that prevents a settings-store cycle.
import * as NodeFS from "node:fs";
import type { AppLocalePreference } from "@t3tools/contracts/settings";
import { describe, expect, it, vi } from "vite-plus/test";
import { createSettingsMessageReader } from "./settingsMessageReader";
import { translateWebMessage } from "./messages";

const runtime = vi.hoisted(() => ({ locales: ["en"] as string[] }));
vi.mock("./readRuntimeLocales", () => ({ readRuntimeLocales: () => runtime.locales }));

describe("settings-owned message reader", () => {
  it("reads the current preference when an asynchronous callback reports failure", async () => {
    let preference: AppLocalePreference = "en";
    const read = createSettingsMessageReader(() => preference);
    const values = { label: "server/{label}/中文/$&", error: "provider: {error}\nraw" };
    expect(read("audit3.saveOn", values)).toBe(translateWebMessage("en", "audit3.saveOn", values));
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const callback = ready.then(() => read("audit3.saveOn", values));
    preference = "zh-CN";
    finish();
    expect(await callback).toBe(translateWebMessage("zh-CN", "audit3.saveOn", values));
    preference = "en";
    expect(read("audit3.saveOn", values)).toBe(translateWebMessage("en", "audit3.saveOn", values));
    expect(read("audit3.saveOn", values)).toContain(values.label);
    expect(read("audit3.saveOn", values)).toContain(values.error);
  });

  it("also reads current runtime locales when the preference is system", () => {
    const read = createSettingsMessageReader(() => "system");
    try {
      for (const locale of ["en", "zh-CN", "en"] as const) {
        runtime.locales = [locale];
        expect(read("audit3.settingNotSaved")).toBe(
          translateWebMessage(locale, "audit3.settingNotSaved"),
        );
      }
    } finally {
      runtime.locales = ["en"];
    }
  });

  it("keeps the store's localization dependency free of the reverse store import", () => {
    const source = (path: string) => NodeFS.readFileSync(new URL(path, import.meta.url), "utf8");
    const store = source("../hooks/useSettings.ts");
    expect(store).not.toMatch(/from\s+["'][^"']*readWebI18n["']/);
    expect(store).toContain(
      "createSettingsMessageReader(() => getClientSettingsSnapshot().appLocale)",
    );
    for (const file of ["./settingsMessageReader.ts", "./readRuntimeLocales.ts", "./messages.ts"]) {
      expect(source(file)).not.toMatch(
        /from\s+["'][^"']*(?:useSettings|readWebI18n|WebI18nContext)["']/,
      );
    }
  });
});

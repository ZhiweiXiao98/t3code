import { describe, expect, it } from "vite-plus/test";

import { browserPageLocale } from "./browserPageLocale.ts";

describe("browser callback locale", () => {
  it.each([
    [undefined, "en"],
    ["", "en"],
    ["zh", "zh-CN"],
    ["zh-SG", "zh-CN"],
    ["zh-Hans-CN", "zh-CN"],
    ["en-US,zh-CN;q=0.8", "en"],
    ["en-US;q=0.5, zh-CN;q=0.9", "zh-CN"],
    ["ZH-cn;Q=0.900, en;q=0.8", "zh-CN"],
    ["zh-CN;q=0.8,en-US;q=0.8", "zh-CN"],
    ["en-US;q=0.8,zh-CN;q=0.8", "en"],
    ["fr-FR,zh-CN;q=0.8,en;q=0.5", "zh-CN"],
    ["zh-TW,zh;q=0.8", "en"],
    ["zh-Hant;q=1,zh-Hans;q=0.9", "en"],
    ["zh-CN;q=0,en-US", "en"],
    ["*", "en"],
    ["*;q=1,zh-CN;q=0.5", "en"],
    ["zh-CN;q=1,*;q=0.5", "zh-CN"],
    ["zh-CN;q=bogus,en", "en"],
    ["zh-CN;q=2,en", "en"],
    ["zh-CN;q=-1,en", "en"],
    ["zh-CN;q=0.1234,en", "en"],
    ["zh-CN;q=1;anything=1,en", "en"],
    ['zh-CN" onload="alert(1),en', "en"],
    ["not_a_locale,zh-CN", "zh-CN"],
  ] as const)("resolves %s to %s", (header, expected) => {
    expect(browserPageLocale(header)).toBe(expected);
  });
});

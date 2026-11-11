import { describe, expect, it } from "vite-plus/test";

import { readAnnotationLocale } from "./GuestProtocol.ts";

describe("readAnnotationLocale", () => {
  it("accepts resolved app languages and never interprets guest content as a locale", () => {
    expect(readAnnotationLocale("zh-CN")).toBe("zh-CN");
    expect(readAnnotationLocale("en")).toBe("en");
    for (const value of [
      undefined,
      null,
      "system",
      "zh-SG",
      "<script>zh-CN</script>",
      ["zh-CN"],
      { locale: "zh-CN" },
      { toString: () => "zh-CN" },
    ]) {
      expect(readAnnotationLocale(value)).toBe("en");
    }
  });
});

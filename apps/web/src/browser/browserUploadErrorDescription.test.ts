import { describe, expect, it } from "vite-plus/test";
import { browserUploadErrorDescription } from "./browserUploadErrorDescription";

describe("browser upload error presentation", () => {
  it("translates only the two owned upload messages at the current locale", () => {
    for (const [source, chinese] of [
      ["The page's file picker is no longer open.", "页面的文件选择器已关闭。"],
      ["The upload was refused.", "上传被拒绝。"],
    ] as const) {
      const error = new Error(source);
      expect(browserUploadErrorDescription("zh-CN", error)).toBe(chinese);
      expect(browserUploadErrorDescription("en", error)).toBe(source);
      expect(error.message).toBe(source);
    }
  });

  it("keeps unknown server, network and opaque text verbatim", () => {
    for (const source of [
      "provider/{fileName}/$&/中文\nhttps://example.com/a?x=1",
      "The upload was refused. extra detail",
      "external: The page's file picker is no longer open.",
      "The upload was refused.\n",
      "Failed to fetch",
      "constructor",
      "",
    ]) {
      for (const locale of ["zh-CN", "en"] as const) {
        expect(browserUploadErrorDescription(locale, new Error(source))).toBe(source);
      }
    }
  });

  it("preserves the existing missing-description behavior for non-Errors", () => {
    for (const cause of [
      undefined,
      null,
      "The upload was refused.",
      { message: "The upload was refused." },
    ]) {
      expect(browserUploadErrorDescription("zh-CN", cause)).toBeUndefined();
    }
  });
});

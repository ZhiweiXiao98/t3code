// @effect-diagnostics nodeBuiltinImport:off - checks finite display copy against its production upload and action sources.
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { localizeAttachmentUploadFailure } from "./attachmentUploadMessages";
import { translateWebMessage } from "./messages";

const source = (path: string) => NodeFS.readFileSync(new URL(path, import.meta.url), "utf8");

describe("owned upload failure display", () => {
  it("covers the app-owned queue failures without changing their stored source", () => {
    const queue = source("../lib/attachmentUploadQueue.ts");
    for (const text of [
      "Upload failed",
      "Upload timed out",
      "This connection cannot upload attachments.",
      "Uploaded file expired. Remove it and attach it again.",
      "Uploaded file could not be verified. Retry when the server reconnects.",
      "Unsupported image type",
      "Original file is no longer available",
      "Upload could not start",
      "Not connected",
    ]) {
      expect(queue).toContain(JSON.stringify(text));
      const failure = { status: "failed", reason: text };
      for (const locale of ["en", "zh-CN", "en"] as const) {
        const display = localizeAttachmentUploadFailure(locale, failure.reason);
        if (locale === "en") expect(display).toBe(text);
        else expect(display).toMatch(/[\u3400-\u9fff]/);
      }
      expect(failure.reason).toBe(text);
    }
  });

  it("preserves the exact status in the owned rejection template", () => {
    for (const code of [0, 100, 413, 500, 599]) {
      const text = `Upload rejected (${code})`;
      expect(localizeAttachmentUploadFailure("en", text)).toBe(text);
      expect(localizeAttachmentUploadFailure("zh-CN", text)).toBe(`上传被拒绝（${code}）`);
    }
  });

  it("preserves unknown errors and does not reinterpret cancellation or opaque content", () => {
    for (const text of [
      "Upload cancelled",
      "Upload rejected (999)",
      "Upload rejected (0413)",
      "external: Upload failed",
      "Upload timed out\nextra",
      "Upload rejected (413) details",
      "provider/{fileName}/$&/中文",
      "constructor",
      "__proto__",
      "",
    ])
      expect(localizeAttachmentUploadFailure("zh-CN", text)).toBe(text);
  });

  it("keeps the thread and monitor translations at their owned construction sites", () => {
    expect(source("../hooks/useThreadActionMenu.ts")).toContain(
      'new Error(t("audit10.threadNotLoaded"))',
    );
    expect(source("../lib/resourceTelemetryState.ts")).toContain(
      'throw new Error(t("audit10.monitorPermission"))',
    );
    expect(translateWebMessage("en", "audit10.threadNotLoaded")).toBe(
      "This thread has not loaded yet.",
    );
    expect(translateWebMessage("zh-CN", "audit10.threadNotLoaded")).toBe("此会话尚未加载。");
    expect(translateWebMessage("en", "audit10.monitorPermission")).toBe(
      "This connection cannot restart the resource monitor.",
    );
    expect(translateWebMessage("zh-CN", "audit10.monitorPermission")).toBe(
      "此连接无权重启资源监视器。",
    );
  });
});

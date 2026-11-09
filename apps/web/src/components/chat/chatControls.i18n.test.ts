import { describe, expect, it } from "vite-plus/test";
import { translateWebMessage, type WebMessageKey } from "../../i18n/messages";

// Keep this adjacent to the controls. This deliberately avoids mounting media/network resources.
describe("chat controls translation regressions", () => {
  const t = (locale: "en" | "zh-CN", key: WebMessageKey, values = {}) =>
    translateWebMessage(locale, key, values);

  it("keeps user-controlled provider, path, model, and version values verbatim", () => {
    const value = "User_原文 /tmp/file.ts ${code} <model>";
    for (const locale of ["en", "zh-CN"] as const) {
      for (const [key, parameter] of [
        ["chatControls.previewNamed", "name"],
        ["chatControls.usingModel", "model"],
        ["chatControls.installProvider", "provider"],
        ["chatControls.readyUpdate", "version"],
        ["chatControls.diagramError", "message"],
      ] as const) {
        expect(t(locale, key, { [parameter]: value })).toContain(value);
      }
    }
  });

  it("preserves complete English count grammar and translates complete Chinese phrases", () => {
    expect(t("en", "chatControls.updatingOne", { count: 1 })).toBe("Updating 1 machine");
    expect(t("en", "chatControls.updatingMany", { count: 2 })).toBe("Updating 2 machines");
    expect(t("en", "chatControls.manualOne", { count: 1 })).toBe("1 needs a manual update");
    expect(t("en", "chatControls.manualMany", { count: 2 })).toBe("2 need a manual update");
    expect(t("zh-CN", "chatControls.updatingMany", { count: 2 })).toBe("正在更新 2 台机器");
    expect(t("zh-CN", "chatControls.manualMany", { count: 2 })).toBe("2 台需要手动更新");
  });

  it("keeps complete image descriptions independent of the image-count source translation", () => {
    expect(t("zh-CN", "chatControls.closeImage")).toBe("关闭图片预览");
    expect(t("zh-CN", "chatControls.expandedImage")).toBe("展开图片预览");
    expect(t("en", "chatControls.closeImage")).toBe("Close image preview");
    expect(t("en", "chatControls.expandedVideo")).toBe("Expanded video preview");
    expect(t("zh-CN", "chatControls.annotatedCrop")).toBe("带批注的预览裁剪图");
    expect(t("zh-CN", "chatControls.zoomInstructions")).toContain("按 Enter");
  });

  it("retains media and status placeholders", () => {
    expect(t("en", "chatControls.expandedPreview", { name: "photo.png" })).toBe(
      "Expanded photo.png preview",
    );
    expect(t("zh-CN", "chatControls.closeVideo")).toBe("关闭视频预览");
    expect(
      t("en", "chatControls.subagentCompletedTime", { label: "Completed", duration: "12s" }),
    ).toBe("Completed in 12s");
    expect(
      t("zh-CN", "chatControls.subagentCompletedTime", { label: "已完成", duration: "12s" }),
    ).toBe("已完成，耗时 12s");
  });
});

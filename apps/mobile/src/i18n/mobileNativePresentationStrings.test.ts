import { expect, it, vi } from "vite-plus/test";
import { formatMobileMessage } from "./mobileDisplayStrings";
import { localizeMobileString } from "./mobileStrings";
import {
  mobileSpeechLanguageLabel,
  mobileUsageResetLabel,
  mobileUsageRecoveryFailure,
  mobileMermaidFailure,
  mobilePreviewUploadFailure,
} from "./mobileNativePresentationStrings";

it("uses the app language for model languages and benchmark percentages", () => {
  expect(mobileSpeechLanguageLabel("en", "en")).toBe("English");
  expect(mobileSpeechLanguageLabel("en", "zh-CN")).toBe("英语");
  expect(mobileSpeechLanguageLabel("invalid_code", "zh-CN")).toBe("INVALID_CODE");
  expect(formatMobileMessage("{0}% error", [12.5], "zh-CN")).toBe("错误率 12.5%");
  expect(formatMobileMessage("{0}% error", [12.5], "en")).toBe("12.5% error");
  vi.stubGlobal("Intl", { DisplayNames: undefined });
  try {
    expect(mobileSpeechLanguageLabel("en", "zh-CN")).toBe("EN");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("formats resume and reset dates in the chosen locale without changing timestamps", () => {
  const timestamp = "2026-11-15T09:30:00Z";
  for (const locale of ["en", "zh-CN"] as const) {
    const date = new Date(timestamp).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    for (const resumes of [false, true]) {
      expect(mobileUsageResetLabel(timestamp, resumes, locale)).toBe(
        locale === "en"
          ? `${resumes ? "Resumes" : "Resets"} ${date}.`
          : `将于 ${date} ${resumes ? "恢复" : "重置"}。`,
      );
    }
    expect(mobileUsageResetLabel("invalid", false, locale)).toBe(
      locale === "en" ? "Reset time unavailable" : "重置时间不可用",
    );
  }
});

it("translates generated recovery and Mermaid fallback errors but never matching renderer/provider messages", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    expect(mobileUsageRecoveryFailure(null, locale)).toBe(
      locale === "en" ? "Could not change limit recovery." : "无法更改额度恢复设置。",
    );
    expect(mobileMermaidFailure(null, locale)).toBe(
      locale === "en" ? "The diagram could not be rendered." : "无法渲染图表。",
    );
    for (const message of [
      "Settings",
      "Open",
      "The diagram could not be rendered.",
      "Could not change limit recovery.",
      "renderer/{0}/$&\ncode",
    ]) {
      expect(mobileUsageRecoveryFailure(new Error(message), locale)).toBe(message);
      expect(mobileMermaidFailure(new Error(message), locale)).toBe(message);
      expect(formatMobileMessage("Unable to render diagram: {0}", [message], locale)).toBe(
        locale === "en" ? `Unable to render diagram: ${message}` : `无法渲染图表：${message}`,
      );
    }
    expect(localizeMobileString("The diagram renderer failed to load.", locale)).toBe(
      locale === "en" ? "The diagram renderer failed to load." : "图表渲染器加载失败。",
    );
  }
});

it("formats model progress without translating provider model names", () => {
  const name = "Settings {0} $&";
  expect(formatMobileMessage("{0} download progress", [name], "zh-CN")).toBe(`${name} 下载进度`);
  expect(formatMobileMessage("{0} download progress", [name], "en")).toBe(
    `${name} download progress`,
  );
  expect(formatMobileMessage("{0}% downloaded · Tap to cancel", [42], "zh-CN")).toBe(
    "已下载 42% · 点按取消",
  );
});

it("localizes the file upload endpoint's closed-picker response and empty-body fallback only", async () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const closedPicker = "The page's file picker is no longer open.";
    const response = new Response(closedPicker, { status: 409 });
    expect(response.ok).toBe(false);
    expect(mobilePreviewUploadFailure(response.status, await response.text(), locale)).toBe(
      locale === "en" ? closedPicker : "页面的文件选择器已关闭。",
    );
    expect(mobilePreviewUploadFailure(500, "", locale)).toBe(
      locale === "en" ? "The upload was refused." : "上传被拒绝。",
    );
    for (const body of [
      "Settings",
      "Open",
      "The upload was refused.",
      `${closedPicker} details`,
      "server/{0}/$&\nfile.txt",
    ]) {
      expect(mobilePreviewUploadFailure(409, body, locale)).toBe(body);
    }
    expect(mobilePreviewUploadFailure(500, closedPicker, locale)).toBe(closedPicker);
  }
});

it("formats model download confirmations once and preserves opaque names through Dialog localization", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const name of ["Settings", "Open", "Download", "{0} $&"]) {
      const title = formatMobileMessage("Download {0}?", [name], locale);
      const message = formatMobileMessage(
        "{0} will download {1} and use it as its transcription model.",
        [name, "12 MB"],
        locale,
      );
      expect(title).toBe(locale === "en" ? `Download ${name}?` : `下载 ${name}？`);
      expect(message).toBe(
        locale === "en"
          ? `${name} will download 12 MB and use it as its transcription model.`
          : `${name} 将下载 12 MB，并将其用作语音转写模型。`,
      );
      expect(localizeMobileString(title, locale)).toBe(title);
      expect(localizeMobileString(message, locale)).toBe(message);
    }
  }
});

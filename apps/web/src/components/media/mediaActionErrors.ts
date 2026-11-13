import { ClipboardApiUnavailableError, ClipboardWriteError } from "../../hooks/useCopyToClipboard";
import type { MediaActionId } from "@t3tools/client-runtime/media-actions";
import { translateWebMessage, type WebMessageKey } from "../../i18n/messages";
import * as Schema from "effect/Schema";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const MESSAGES: Readonly<Record<string, string>> = {
  "This connection cannot read host files.": "此连接无权读取主机文件。",
  "This media is unavailable. Try reopening the preview.": "此媒体不可用。请尝试重新打开预览。",
  "Reconnect to this environment and try again.": "请重新连接此环境后重试。",
  "The environment returned an invalid media URL.": "环境返回了无效的媒体 URL。",
  "Image copying is unavailable. Use a secure browser connection or save the image.":
    "无法复制图片。请使用安全的浏览器连接或保存图片。",
  "This inline media could not be decoded.": "无法解码此内嵌媒体。",
  "The file could not be fetched. Check the connection and try again.":
    "无法获取文件。请检查连接后重试。",
  "The file could not be fetched. The host may block browser access (CORS), or the connection may be unavailable.":
    "无法获取文件。主机可能阻止了浏览器访问（CORS），或连接不可用。",
  "This link returned a web page instead of media. Open the original URL.":
    "此链接返回了网页而非媒体。请打开原始 URL。",
  "The browser could not decode this image for copying. Try saving it instead.":
    "浏览器无法解码此图片以进行复制。请尝试保存图片。",
  "This image is too large or has no usable dimensions. Try saving it instead.":
    "此图片过大或尺寸无效。请尝试保存图片。",
  "Image copying is unavailable in this browser.": "此浏览器无法复制图片。",
  "The image could not be converted to PNG.": "无法将图片转换为 PNG。",
};

export class MediaActionError extends Schema.TaggedError<MediaActionError>()("MediaActionError", {
  source: Schema.String,
  status: Schema.optionalKey(Schema.Number),
  cause: Schema.optionalKey(Schema.Defect()),
}) {
  override get message(): string {
    return this.status === undefined
      ? this.source
      : `The file could not be fetched (HTTP ${this.status}).`;
  }
}
const isMediaActionError = Schema.is(MediaActionError);
const isClipboardUnavailable = Schema.is(ClipboardApiUnavailableError);
const isClipboardWriteError = Schema.is(ClipboardWriteError);

export function mediaActionErrorMessage(locale: ResolvedAppLocale, error: unknown): string | null {
  const unavailable =
    isClipboardUnavailable(error) &&
    Object.getPrototypeOf(error) === ClipboardApiUnavailableError.prototype;
  const writeFailed =
    isClipboardWriteError(error) && Object.getPrototypeOf(error) === ClipboardWriteError.prototype;
  if (unavailable || writeFailed) {
    if (locale !== "zh-CN" || (error.target !== "file path" && error.target !== "URL"))
      return error.message;
    const target = error.target === "file path" ? "文件路径" : "URL";
    return unavailable ? `复制${target}时剪贴板 API 不可用。` : `无法将${target}复制到剪贴板。`;
  }
  if (!isMediaActionError(error) || Object.getPrototypeOf(error) !== MediaActionError.prototype)
    return null;
  if (locale !== "zh-CN") return error.message;
  if (error.status !== undefined) return `无法获取文件（HTTP ${error.status}）。`;
  return Object.hasOwn(MESSAGES, error.source) ? MESSAGES[error.source]! : error.message;
}

export function mediaActionFailureTitle(
  locale: ResolvedAppLocale,
  action: MediaActionId | null,
  kind: "image" | "video",
) {
  if (action === null) return translateWebMessage(locale, "audit12.media.menuFailed");
  const keys: Record<MediaActionId, WebMessageKey> = {
    "copy-full-path": "markdownFile.copyFullPath",
    "copy-relative-path": "markdownFile.copyRelativePath",
    "copy-url": "audit12.media.copyUrl",
    "open-file": "audit12.media.openFile",
    "copy-image": "audit12.media.copyImage",
    "save-image": "audit12.media.complete",
    save: kind === "image" ? "audit12.media.saveImage" : "audit12.media.saveVideo",
  };
  return translateWebMessage(locale, "audit12.media.actionFailed", {
    action: translateWebMessage(locale, keys[action]).toLowerCase(),
  });
}

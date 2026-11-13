import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const UPLOAD_FAILURES: Readonly<Record<string, string>> = {
  "Upload failed": "上传失败",
  "Upload timed out": "上传超时",
  "This connection cannot upload attachments.": "此连接无权上传附件。",
  "Uploaded file expired. Remove it and attach it again.": "已上传的文件已过期。请移除后重新添加。",
  "Uploaded file could not be verified. Retry when the server reconnects.":
    "无法验证已上传的文件。请在服务器重新连接后重试。",
  "Unsupported image type": "不支持的图片类型",
  "Original file is no longer available": "原始文件已不可用",
  "Upload could not start": "无法开始上传",
  "Not connected": "未连接",
};

export function localizeAttachmentUploadFailure(locale: ResolvedAppLocale, source: string): string {
  if (locale !== "zh-CN") return source;
  if (Object.hasOwn(UPLOAD_FAILURES, source)) return UPLOAD_FAILURES[source]!;
  const rejected = /^Upload rejected \((0|[1-5]\d{2})\)$/.exec(source);
  return rejected ? `上传被拒绝（${rejected[1]}）` : source;
}

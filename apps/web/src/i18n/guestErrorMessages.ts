import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const GUEST_ERRORS: Readonly<Record<string, string>> = {
  "This guest link is no longer active.": "此访客链接已失效。",
  "This guest link was already used.": "此访客链接已被使用。",
  "Wait for the owner to answer your earlier messages.": "请等待所有者回复你之前的消息。",
  "Wait for the owner to answer your earlier messages before you attach more files.":
    "请等待所有者回复你之前的消息，然后再添加更多附件。",
  "This guest link is not valid.": "此访客链接无效。",
  "This page is for an older guest link. Reload it to continue.":
    "此页面对应旧的访客链接。请重新加载以继续。",
  "This item is not available.": "此条目不可用。",
  "The owner's server rejected this request.": "所有者的服务器拒绝了此请求。",
  "Write a message or attach a file.": "请输入消息或添加文件。",
  "Attach up to 4 files to a message.": "每条消息最多可添加 4 个文件。",
  "Attached files can total up to 10 MB per message.": "每条消息的附件总大小不能超过 10 MB。",
  "This file cannot be attached. Images must be PNG, JPEG, GIF, or WebP.":
    "无法添加此文件。图片必须为 PNG、JPEG、GIF 或 WebP 格式。",
  "The request was not valid.": "请求无效。",
  "Could not load this item.": "无法加载此条目。",
  "Output is no longer available.": "输出已不可用。",
};

export function localizeGuestError(locale: ResolvedAppLocale, message: string): string {
  return locale === "zh-CN" && Object.hasOwn(GUEST_ERRORS, message)
    ? GUEST_ERRORS[message]!
    : message;
}

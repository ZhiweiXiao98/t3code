import type { AppLocalePreference } from "@t3tools/contracts";
import { resolveAppLocale, type ResolvedAppLocale } from "@t3tools/shared/appLocale";

export interface PreviewPromptMessages {
  readonly open: string;
  readonly cancel: string;
  readonly allow: string;
  readonly block: string;
  readonly openLink: (protocol: string) => string;
  readonly openLinkDetail: (url: string) => string;
  readonly clipboardRead: (origin: string) => string;
  readonly choosePasskey: string;
  readonly unnamedPasskey: string;
}

const messages = {
  en: {
    open: "Open",
    cancel: "Cancel",
    allow: "Allow",
    block: "Block",
    openLink: (protocol) => `Open this ${protocol} link?`,
    openLinkDetail: (url) => `A page in the browser wants to open another application:\n\n${url}`,
    clipboardRead: (origin) => `${origin} wants to see text and images copied to the clipboard`,
    choosePasskey: "Choose a passkey",
    unnamedPasskey: "Unnamed passkey",
  },
  "zh-CN": {
    open: "打开",
    cancel: "取消",
    allow: "允许",
    block: "阻止",
    openLink: (protocol) => `要打开此 ${protocol} 链接吗？`,
    openLinkDetail: (url) => `浏览器中的网页想要打开另一个应用程序：\n\n${url}`,
    clipboardRead: (origin) => `${origin} 想要查看复制到剪贴板的文字和图片`,
    choosePasskey: "选择通行密钥",
    unnamedPasskey: "未命名的通行密钥",
  },
} satisfies Record<ResolvedAppLocale, PreviewPromptMessages>;

export function resolvePreviewPromptMessages(
  preference: AppLocalePreference,
  runtimeLocales: ReadonlyArray<string>,
): PreviewPromptMessages {
  return messages[resolveAppLocale(preference, runtimeLocales)];
}

import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const ZH_CN_PROVIDER_AUTHENTICATION_SOURCE: Readonly<Record<string, string>> = {
  "Provider sign-in failed. Try again.": "提供商登录失败。请重试。",
  "Could not open the sign-in page. Copy the link and open it in your browser.":
    "无法打开登录页面。请复制链接并在浏览器中打开。",
  "Provider sign-in link": "提供商登录链接",
  "Could not copy the sign-in link.": "无法复制登录链接。",
  "Change account": "切换账号",
  "Retry connection": "重试连接",
  "Retry sign-in": "重试登录",
  Connect: "连接",
  "Sign in": "登录",
};

/** Translate only application-owned notices, never credential values or provider output. */
export function translateProviderAuthenticationSource(
  locale: ResolvedAppLocale,
  source: string,
): string {
  return locale === "zh-CN" && Object.hasOwn(ZH_CN_PROVIDER_AUTHENTICATION_SOURCE, source)
    ? ZH_CN_PROVIDER_AUTHENTICATION_SOURCE[source]!
    : source;
}

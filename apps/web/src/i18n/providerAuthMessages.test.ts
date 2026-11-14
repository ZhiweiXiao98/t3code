import { expect, it } from "vite-plus/test";
import {
  providerAuthFailureValue,
  translateProviderAuthMessage,
  type ProviderAuthDisplayError,
} from "./providerAuthMessages";

const cases = [
  ["providerSignIn", "Provider sign-in failed. Try again.", "提供商登录失败。请重试。"],
  [
    "openSignIn",
    "Could not open the sign-in page. Copy the link and open it in your browser.",
    "无法打开登录页面。请复制链接并在浏览器中打开。",
  ],
  ["copySignIn", "Could not copy the sign-in link.", "无法复制登录链接。"],
  [
    "terminalUnavailable",
    "The provider sign-in terminal is no longer available.",
    "提供商登录终端已不可用。",
  ],
  [
    "terminalInput",
    "Could not send input to the provider sign-in terminal.",
    "无法向提供商登录终端发送输入。",
  ],
  ["codexSetup", "Codex setup failed. Try again.", "Codex 设置失败。请重试。"],
  [
    "handoffFailed",
    "ChatGPT sign-in could not finish. Try again.",
    "ChatGPT 登录未能完成。请重试。",
  ],
  [
    "handoffInterrupted",
    "ChatGPT sign-in on the primary environment was interrupted. Try again.",
    "主环境中的 ChatGPT 登录已中断。请重试。",
  ],
  [
    "localSignIn",
    "Could not finish sign-in on this computer. Try again or paste the redirect URL below.",
    "无法在此计算机上完成登录。请重试，或在下方粘贴重定向 URL。",
  ],
] as const;

it.each(cases)(
  "renders owned %s at the current locale but leaves raw collisions untouched",
  (localCode, english, chinese) => {
    const owned = { localCode } satisfies ProviderAuthDisplayError;
    for (const [locale, expected] of [
      ["en", english],
      ["zh-CN", chinese],
      ["en", english],
    ] as const) {
      expect(translateProviderAuthMessage(locale, owned)).toBe(expected);
      expect(translateProviderAuthMessage(locale, english)).toBe(english);
      expect(translateProviderAuthMessage(locale, { message: english })).toBe(english);
    }
  },
);

it("keeps ownership only for the non-Error fallback and preserves actual Error messages", () => {
  const fallback = { localCode: "providerSignIn" } satisfies ProviderAuthDisplayError;
  expect(providerAuthFailureValue("opaque failure", fallback)).toBe(fallback);
  expect(providerAuthFailureValue(null, fallback)).toBe(fallback);
  for (const message of ["Provider sign-in failed. Try again.", "", "opaque $& {0} 中文"]) {
    const failure = providerAuthFailureValue(new Error(message), fallback);
    expect(failure).toBe(message);
    expect(translateProviderAuthMessage("zh-CN", failure)).toBe(message);
  }
  expect(providerAuthFailureValue(undefined, "raw query fallback")).toBe("raw query fallback");
  expect(translateProviderAuthMessage("zh-CN", null)).toBeNull();
  expect(translateProviderAuthMessage("en", undefined)).toBeNull();
});

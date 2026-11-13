import { describe, expect, it } from "vite-plus/test";

import { renderErrorPage } from "./auth/mcpOAuthHtml.ts";
import { renderLoopbackAuthorizationCompleteHtml } from "./cloud/cliAuthHtml.ts";
import { codexAuthCallbackPage } from "./provider/CodexAuthCallbackPage.ts";

describe("browser authorization pages", () => {
  it.each(["en", "zh-CN"] as const)(
    "keeps unknown MCP descriptions literal and escaped in %s",
    (locale) => {
      const unknown = "Settings <script>\"&' {name}";
      const page = renderErrorPage(unknown, locale);
      expect(page).toContain(`<html lang="${locale}">`);
      expect(page).toContain("Settings &lt;script&gt;&quot;&amp;&#39; {name}");
      expect(page).not.toContain("<script>");
      expect(renderErrorPage("__proto__", locale)).toContain("<p>__proto__</p>");
      expect(renderErrorPage("constructor", locale)).toContain("<p>constructor</p>");
    },
  );

  it("translates only the known MCP page errors and defaults to English", () => {
    for (const [source, chinese] of [
      [
        "This sign-in link names an unknown app. Start the sign-in again from it.",
        "此登录链接指定了未知应用。请从该应用重新发起登录。",
      ],
      [
        "This sign-in link sends you to an address the app did not register.",
        "此登录链接指向该应用未注册的地址。",
      ],
    ] as const) {
      expect(renderErrorPage(source)).toContain(`<p>${source}</p>`);
      expect(renderErrorPage(source, "zh-CN")).toContain(`<p>${chinese}</p>`);
    }
  });

  it.each(["en", "zh-CN"] as const)(
    "keeps Codex destinations, escaping, nonce and failure behavior in %s",
    (locale) => {
      const returnUrl =
        "http://localhost:7001/settings/providers?instanceId=codex_work&code=secret-code";
      const page = codexAuthCallbackPage(true, returnUrl, 'nonce"<&', locale);
      expect(page).toContain(`<html lang="${locale}">`);
      expect(page).toContain(
        'content="1;url=http://localhost:7001/settings/providers?instanceId=codex_work"',
      );
      expect(page).toContain(
        'href="http://localhost:7001/settings/providers?instanceId=codex_work"',
      );
      expect(page).toContain('nonce="nonce&quot;&lt;&amp;"');
      expect(page).toContain('history.replaceState(null,"","/auth/callback")');
      expect(page).not.toContain("secret-code");
      expect(page).toContain(locale === "zh-CN" ? "已登录" : "You&#39;re signed in");

      const failed = codexAuthCallbackPage(false, returnUrl, "nonce", locale);
      expect(failed).not.toContain('http-equiv="refresh"');
      expect(failed).toContain(locale === "zh-CN" ? "未能完成登录" : "Sign-in couldn&#39;t finish");
      const foreign = codexAuthCallbackPage(true, "https://attacker.example/", "nonce", locale);
      expect(foreign).not.toContain("attacker.example");
      expect(foreign).not.toContain('http-equiv="refresh"');
    },
  );

  it.each(["dev", "nightly", "latest"] as const)(
    "uses the supplied language independently of the %s release stage",
    (stage) => {
      const english = renderLoopbackAuthorizationCompleteHtml(stage);
      const chinese = renderLoopbackAuthorizationCompleteHtml(stage, "zh-CN");
      expect(english).toContain('<html lang="en">');
      expect(english).toContain("Browser authorization complete");
      expect(chinese).toContain('<html lang="zh-CN">');
      expect(chinese).toContain("浏览器授权完成");
      expect(chinese).toContain(`data-stage="${stage}"`);
      expect(chinese.match(/<p class="brand">(.*?)<\/p>/)?.[1]).toBe(
        english.match(/<p class="brand">(.*?)<\/p>/)?.[1],
      );
    },
  );
});

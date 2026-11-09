import { translateWebExtraSource } from "./webExtraMessages";
import { describe, expect, it } from "vite-plus/test";
import { THEME_COLOR_ROLES } from "@t3tools/shared/themePalettes";
import { getThemeRoleTranslation, translateThemeEditorSource } from "./themeEditorMessages";
import { translateProviderAuthenticationSource } from "./providerAuthenticationMessages";

describe("scoped source messages", () => {
  it("localizes every known theme role without replacing English labels", () => {
    for (const role of THEME_COLOR_ROLES) {
      expect(typeof getThemeRoleTranslation("zh-CN", role)).toBe("string");
      expect(getThemeRoleTranslation("en", role)).toBeUndefined();
    }
    expect(getThemeRoleTranslation("zh-CN", "canvas")).toBe("背景");
    expect(getThemeRoleTranslation("zh-CN", "toolbarForeground")).toBe("工具栏文本");
  });

  it("translates static theme editing notices and axis labels", () => {
    expect(translateThemeEditorSource("zh-CN", "Saturation")).toBe("饱和度");
    expect(translateThemeEditorSource("zh-CN", "Brightness")).toBe("亮度");
    expect(translateThemeEditorSource("zh-CN", "Name your theme first.")).toBe("请先为主题命名。");
    expect(translateThemeEditorSource("en", "Name your theme first.")).toBe(
      "Name your theme first.",
    );
  });

  it("localizes authentication buttons and application-owned errors", () => {
    expect(translateProviderAuthenticationSource("zh-CN", "Change account")).toBe("切换账号");
    expect(translateProviderAuthenticationSource("zh-CN", "Retry connection")).toBe("重试连接");
    expect(
      translateProviderAuthenticationSource("zh-CN", "Provider sign-in failed. Try again."),
    ).toBe("提供商登录失败。请重试。");
    expect(translateProviderAuthenticationSource("en", "Sign in")).toBe("Sign in");
  });

  it("preserves unknown values, names, URLs, and prototype-looking strings verbatim", () => {
    for (const value of [
      "My Theme {count}",
      "user@example.test",
      "https://example.test/login?state=opaque-value",
      "provider-error: API-v2 {name}",
      "constructor",
      "toString",
      "__proto__",
      "",
    ]) {
      expect(translateThemeEditorSource("zh-CN", value)).toBe(value);
      expect(translateProviderAuthenticationSource("zh-CN", value)).toBe(value);
    }
  });
});

describe("reconstructed extra web copy", () => {
  it("retains English, unknown names, and prototype-property text verbatim", () => {
    for (const source of [
      "Thread completed",
      "User_原文 {count} /tmp/file.ts",
      "__proto__",
      "constructor",
    ]) {
      expect(translateWebExtraSource("en", source)).toBe(source);
    }
    for (const source of ["User_原文 {count} /tmp/file.ts", "__proto__", "constructor"]) {
      expect(translateWebExtraSource("zh-CN", source)).toBe(source);
    }
  });

  it("covers scoped PDF, notification, interval, and scheduled-task labels", () => {
    expect(translateWebExtraSource("zh-CN", "Fit width")).toBe("适应宽度");
    expect(translateWebExtraSource("zh-CN", "Thread completed")).toBe("任务已完成");
    expect(translateWebExtraSource("zh-CN", "Active host power interval")).toBe(
      "活跃时主机电源检查间隔",
    );
    expect(translateWebExtraSource("zh-CN", "Bad signature")).toBe("签名无效");
    expect(translateWebExtraSource("zh-CN", "Wait for the full response")).toBe("等待完整响应");
    expect(translateWebExtraSource("zh-CN", "Project order")).toBe("项目顺序");
  });
});

import { expect, it } from "vite-plus/test";
import {
  providerSkillDescription,
  providerSlashCommandDescription,
} from "./composerCommandDescriptions";

it("translates provider command fallbacks but preserves provided descriptions and input hints", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    expect(providerSlashCommandDescription({}, locale)).toBe(
      locale === "en" ? "Run provider command" : "运行服务提供方命令",
    );
    expect(
      providerSlashCommandDescription(
        { description: "Run provider command", input: { hint: "ignored" } },
        locale,
      ),
    ).toBe("Run provider command");
    expect(
      providerSlashCommandDescription({ input: { hint: "Run provider command" } }, locale),
    ).toBe("Run provider command");
    expect(providerSlashCommandDescription({ description: "Deploy {scope}/$& 中文" }, locale)).toBe(
      "Deploy {scope}/$& 中文",
    );
  }
});

it("translates owned skill scope descriptions without rewriting supplied text or unknown scope tokens", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    expect(providerSkillDescription({ scope: "project" }, locale, "fallback")).toBe(
      locale === "en" ? "project skill" : "项目 技能",
    );
    expect(providerSkillDescription({ scope: "user" }, locale, "fallback")).toBe(
      locale === "en" ? "user skill" : "个人 技能",
    );
    expect(providerSkillDescription({ scope: "system" }, locale, "fallback")).toBe(
      locale === "en" ? "system skill" : "系统 技能",
    );
    expect(
      providerSkillDescription(
        { shortDescription: "project skill", description: "ignored", scope: "project" },
        locale,
        "fallback",
      ),
    ).toBe("project skill");
    expect(
      providerSkillDescription(
        { description: "project skill", scope: "project" },
        locale,
        "fallback",
      ),
    ).toBe("project skill");
    expect(providerSkillDescription({}, locale, "")).toBe("");
    expect(providerSkillDescription({}, locale, "fallback")).toBe("fallback");
    for (const scope of ["plugin@custom/{scope}/$&", "toString", "__proto__"]) {
      expect(providerSkillDescription({ scope }, locale, "fallback")).toBe(
        locale === "en" ? `${scope} skill` : `${scope} 技能`,
      );
    }
  }
});

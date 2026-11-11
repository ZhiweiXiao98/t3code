import { describe, expect, it } from "vite-plus/test";
import { cloudSpeechDisclosure } from "@t3tools/shared/speech";
import {
  translateVoiceSettingsMessage,
  translateVoiceSettingsSource,
  translateVoiceSettingsError,
} from "./voiceSettingsMessages";

describe("voice settings localization boundaries", () => {
  it("interpolates identifiers once without interpreting their contents as placeholders", () => {
    const environment = "Dev {company} / $& 中文";
    expect(
      translateVoiceSettingsMessage("zh-CN", "{provider} via {environment}", {
        provider: "OpenRouter {environment}",
        environment,
      }),
    ).toBe(`OpenRouter {environment}，经由 ${environment}`);
    expect(
      translateVoiceSettingsMessage("en", "{provider} via {environment}", {
        provider: "OpenRouter {environment}",
        environment,
      }),
    ).toBe(`OpenRouter {environment} via ${environment}`);
    expect(
      translateVoiceSettingsMessage("zh-CN", "Add an alias for {term}", {
        term: "O'Reilly {term}",
      }),
    ).toBe("为 O'Reilly {term} 添加别名");
  });

  it("retains missing placeholders and ignores inherited interpolation values", () => {
    const values = Object.create({ name: "inherited model" }) as Record<string, string>;
    expect(translateVoiceSettingsMessage("zh-CN", "Delete {name}", values)).toBe("删除 {name}");
    expect(translateVoiceSettingsMessage("en", "Delete {name}", values)).toBe("Delete {name}");
  });

  it("preserves unknown descriptions, errors and language names verbatim", () => {
    for (const value of [
      "My custom model {count}",
      "Recommended",
      "provider/error: 403 /api/voice",
      "French",
      "中文用户词语",
      "constructor",
      "toString",
      "__proto__",
      "",
    ]) {
      expect(translateVoiceSettingsSource("zh-CN", value)).toBe(value);
      expect(translateVoiceSettingsSource("en", value)).toBe(value);
      expect(translateVoiceSettingsError("en", value)).toBe(value);
      expect(translateVoiceSettingsError("zh-CN", value)).toBe(value);
    }
    expect(
      translateVoiceSettingsSource("zh-CN", "Best all-around choice for English dictation"),
    ).toBe("英语听写的综合首选");
    expect(translateVoiceSettingsError("zh-CN", "The microphone disconnected.")).toBe(
      "麦克风已断开连接。",
    );
  });

  it("keeps English cloud disclosures equivalent to the shared consent text", () => {
    const environment = "Mac {company}";
    for (const [provider, company] of [
      ["openai", "OpenAI"],
      ["xai", "xAI"],
      ["openrouter", "OpenRouter"],
    ] as const) {
      const message =
        provider === "openrouter"
          ? "After you stop, {environment} sends the recording to OpenRouter. OpenRouter chooses who runs your model. T3 requests zero data retention; your OpenRouter account may allow safety retention."
          : "After you stop, {environment} sends your recording and vocabulary hints, including project names, to {company}.";
      expect(translateVoiceSettingsMessage("en", message, { environment, company })).toBe(
        cloudSpeechDisclosure(provider, environment),
      );
      const chinese = translateVoiceSettingsMessage("zh-CN", message, { environment, company });
      expect(chinese).toContain(environment);
      expect(chinese).toContain(company);
    }
  });
});

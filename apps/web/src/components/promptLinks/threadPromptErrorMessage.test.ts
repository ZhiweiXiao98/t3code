import { parseThreadLinkPrompt, PROMPT_LINK_MAX_PROMPT_LENGTH } from "@t3tools/shared/promptLinks";
import { expect, it } from "vite-plus/test";
import { threadPromptErrorMessage } from "./threadPromptErrorMessage";

it("formats actual parser limits and hidden-content failures without changing accepted prompt text", () => {
  const tooLong = parseThreadLinkPrompt(`?prompt=${"a".repeat(PROMPT_LINK_MAX_PROMPT_LENGTH + 1)}`);
  if (tooLong.ok) throw new Error("Expected length refusal");
  expect(threadPromptErrorMessage(tooLong.error, "zh-CN")).toBe(
    `此提示词超过 ${PROMPT_LINK_MAX_PROMPT_LENGTH.toLocaleString("en-US")} 个字符，因此 T3 Code 未打开它。`,
  );
  expect(threadPromptErrorMessage(tooLong.error, "en")).toBe(tooLong.error);
  const hidden = parseThreadLinkPrompt(`?prompt=${encodeURIComponent("\u200b\u200c")}`);
  if (hidden.ok) throw new Error("Expected hidden-content refusal");
  expect(threadPromptErrorMessage(hidden.error, "zh-CN")).toBe(
    "此提示词仅包含隐藏字符，可能存在恶意内容，因此 T3 Code 未打开它。",
  );
  const prompt = "opaque/{0}/$& Not set";
  const accepted = parseThreadLinkPrompt(`?prompt=${encodeURIComponent(prompt)}`);
  expect(accepted).toEqual({ ok: true, value: { text: prompt, hiddenCharacters: 0 } });
  expect(threadPromptErrorMessage("future local diagnostic/{0}/$&", "zh-CN")).toBe(
    "future local diagnostic/{0}/$&",
  );
});

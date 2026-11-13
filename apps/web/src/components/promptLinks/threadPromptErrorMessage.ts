import { PROMPT_LINK_MAX_PROMPT_LENGTH } from "@t3tools/shared/promptLinks";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

/** Accepts only the closed local parseThreadLinkPrompt error result, never transport errors. */
export function threadPromptErrorMessage(error: string, locale: ResolvedAppLocale): string {
  if (locale !== "zh-CN") return error;
  const maximum = PROMPT_LINK_MAX_PROMPT_LENGTH.toLocaleString("en-US");
  if (error === `This prompt is longer than ${maximum} characters, so T3 Code did not open it.`)
    return `此提示词超过 ${maximum} 个字符，因此 T3 Code 未打开它。`;
  if (
    error ===
    "This prompt had only hidden characters, so it may be malicious. T3 Code did not open it."
  )
    return "此提示词仅包含隐藏字符，可能存在恶意内容，因此 T3 Code 未打开它。";
  return error;
}

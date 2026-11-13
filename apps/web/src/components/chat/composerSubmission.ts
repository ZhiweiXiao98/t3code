import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage } from "~/i18n/messages";
import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@t3tools/contracts";
import { expandAssistantCitationsForProvider } from "@t3tools/shared/assistantCitations";

type ComposerSubmitEvent = { preventDefault: () => void };

type ComposerSubmissionInput = {
  locale?: ResolvedAppLocale;
  prompt: string;
  providerInput?: string;
  submissionTarget: "provider-turn" | "pending-user-input";
};

export function getComposerPromptLengthViolation(prompt: string): number | null {
  const normalizedPrompt = prompt.trim();
  const inputLength = Math.max(
    normalizedPrompt.length,
    expandAssistantCitationsForProvider(normalizedPrompt).length,
  );
  const excess = inputLength - PROVIDER_SEND_TURN_MAX_INPUT_CHARS;
  return excess > 0 ? excess : null;
}

export function formatComposerPromptLengthViolation(
  excess: number,
  locale: ResolvedAppLocale = "en",
): string {
  return translateWebMessage(locale, "audit15.promptLength", {
    excess: excess.toLocaleString("en-US"),
    unit: excess === 1 ? "character" : "characters",
    max: PROVIDER_SEND_TURN_MAX_INPUT_CHARS.toLocaleString("en-US"),
  });
}

export function getComposerPromptLengthValidationMessage(
  prompt: string,
  locale: ResolvedAppLocale = "en",
): string | null {
  const excess = getComposerPromptLengthViolation(prompt);
  return excess === null ? null : formatComposerPromptLengthViolation(excess, locale);
}

function getComposerSubmissionValidationMessage(options: ComposerSubmissionInput): string | null {
  return options.submissionTarget === "provider-turn"
    ? getComposerPromptLengthValidationMessage(
        options.providerInput ?? options.prompt,
        options.locale ?? "en",
      )
    : null;
}

export function submitComposerDraft(
  options: ComposerSubmissionInput & {
    event: ComposerSubmitEvent | undefined;
    onSend: (event?: ComposerSubmitEvent) => boolean | void;
  },
): { validationMessage: string | null; didDispatch: boolean } {
  const validationMessage = getComposerSubmissionValidationMessage(options);
  if (validationMessage) {
    options.event?.preventDefault();
    return { validationMessage, didDispatch: false };
  }

  if (options.onSend(options.event) === false) {
    options.event?.preventDefault();
    return { validationMessage: null, didDispatch: false };
  }
  return { validationMessage: null, didDispatch: true };
}

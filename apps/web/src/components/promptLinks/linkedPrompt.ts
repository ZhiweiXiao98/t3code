import { translateWebSource } from "~/i18n/messages";
import { readWebI18n } from "~/i18n/readWebI18n";
import type { LinkedPrompt } from "@t3tools/shared/promptLinks";

import { type ComposerThreadTarget, useComposerDraftStore } from "~/composerDraftStore";

import { toastManager } from "../ui/toast";

export function warnAboutHiddenCharacters(prompt: LinkedPrompt): void {
  const { locale, t } = readWebI18n();
  if (prompt.hiddenCharacters === 0) return;
  toastManager.add({
    type: "warning",
    title: translateWebSource(locale, "This prompt had hidden characters, it may be malicious"),
    description: t(
      prompt.hiddenCharacters === 1 ? "promptLink.hiddenOne" : "promptLink.hiddenMany",
      { count: prompt.hiddenCharacters },
    ),
    timeout: 0,
  });
}

export function placeLinkedPrompt(
  target: ComposerThreadTarget,
  prompt: LinkedPrompt,
  notes: ReadonlyArray<string> = [],
): void {
  const { locale } = readWebI18n();
  warnAboutHiddenCharacters(prompt);
  const place = () => {
    useComposerDraftStore.getState().setPrompt(target, prompt.text);
    toastManager.add({
      type: "info",
      title: translateWebSource(locale, "Prompt added from a link"),
      description: [translateWebSource(locale, "Read it before you send."), ...notes].join(" "),
    });
  };
  const existing = useComposerDraftStore.getState().getComposerDraft(target)?.prompt ?? "";
  if (existing.trim().length === 0 || existing === prompt.text) {
    place();
    return;
  }
  const id = toastManager.add({
    type: "info",
    title: translateWebSource(locale, "Linked prompt ready"),
    description: translateWebSource(
      locale,
      "This thread already has a draft. Replace it with the linked prompt?",
    ),
    timeout: 0,
    actionProps: {
      children: translateWebSource(locale, "Replace draft"),
      onClick: () => {
        toastManager.close(id);
        place();
      },
    },
  });
}

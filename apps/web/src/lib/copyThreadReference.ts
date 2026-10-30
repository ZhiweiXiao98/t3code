import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebSource } from "../i18n/messages";
import type { ThreadReferenceCopyTarget } from "@t3tools/client-runtime/thread-reference";
import {
  COMPOSER_CONTEXT_CLIPBOARD_MIME,
  encodeComposerContextFragment,
} from "@t3tools/shared/composerContextClipboard";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { writeTextToClipboard } from "../hooks/useCopyToClipboard";

export async function copyThreadReference(
  target: ThreadReferenceCopyTarget,
  locale: ResolvedAppLocale = "en",
): Promise<void> {
  const fragment = target.fragment ? encodeComposerContextFragment(target.fragment) : null;
  try {
    const didCopy = await writeTextToClipboard(
      target.value,
      target.clipboardTarget,
      fragment ? { [COMPOSER_CONTEXT_CLIPBOARD_MIME]: fragment } : undefined,
    );
    if (!didCopy) return;
    toastManager.add({
      type: "success",
      title: translateWebSource(locale, target.successTitle),
      description: target.description,
    });
  } catch (error) {
    console.error(error);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: translateWebSource(locale, target.failureTitle),
        description:
          error instanceof Error ? error.message : translateWebSource(locale, "An error occurred."),
      }),
    );
  }
}

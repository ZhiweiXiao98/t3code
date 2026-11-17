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
  locale: ResolvedAppLocale | (() => ResolvedAppLocale) = "en",
): Promise<void> {
  const fragment = target.fragment ? encodeComposerContextFragment(target.fragment) : null;
  try {
    await writeTextToClipboard(
      target.value,
      target.clipboardTarget,
      fragment ? { [COMPOSER_CONTEXT_CLIPBOARD_MIME]: fragment } : undefined,
    );
  } catch (error) {
    console.error(error);
    const settledLocale = typeof locale === "function" ? locale() : locale;
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: translateWebSource(settledLocale, target.failureTitle),
        description:
          error instanceof Error
            ? error.message
            : translateWebSource(settledLocale, "An error occurred."),
      }),
    );
  }
}

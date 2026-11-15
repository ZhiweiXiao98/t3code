import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebSource } from "~/i18n/messages";
import { resolveQueuedEditExit } from "@t3tools/client-runtime/queued-run-edit";
import type { ChatAttachment } from "@t3tools/contracts";
import {
  composerDraftHasUserContent,
  useComposerDraftStore,
  type ComposerFileAttachment,
  type ComposerImageAttachment,
  type ComposerThreadTarget,
} from "../../composerDraftStore";

const ownedUploadFailures = new WeakMap<Error, string>();

export function createQueuedEditUploadFailure(locale: ResolvedAppLocale = "en"): Error {
  const error = new Error(
    translateWebSource(locale, "Retry or remove failed uploads before saving."),
  );
  ownedUploadFailures.set(error, error.message);
  return error;
}

export function isOwnedQueuedEditUploadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = ownedUploadFailures.get(error);
  return message !== undefined && message === error.message;
}

export function recoverQueuedMessageEdit(input: {
  readonly editTarget: ComposerThreadTarget;
  readonly threadTarget: ComposerThreadTarget;
  readonly originalText: string;
  readonly removedExistingAttachment?: boolean;
}): "kept" | "discarded" | "clean" {
  const store = useComposerDraftStore.getState();
  const draft = store.getComposerDraft(input.editTarget);
  const recovery = resolveQueuedEditExit({
    editChanged:
      input.removedExistingAttachment === true ||
      (draft !== null &&
        (draft.prompt !== input.originalText || draft.images.length > 0 || draft.files.length > 0)),
    // A cleared edit has nothing to put back, so it can only be discarded.
    threadDraftEmpty:
      composerDraftHasUserContent(draft) &&
      !composerDraftHasUserContent(store.getComposerDraft(input.threadTarget)),
  });
  if (recovery === "kept") {
    store.moveComposerPromptAndImages(input.editTarget, input.threadTarget);
  } else {
    store.clearComposerContent(input.editTarget);
  }
  return recovery;
}

export async function prepareQueuedEditAttachments(input: {
  readonly existingAttachments: ReadonlyArray<ChatAttachment>;
  readonly images: ReadonlyArray<ComposerImageAttachment>;
  readonly files: ReadonlyArray<ComposerFileAttachment>;
  readonly uploadFiles: (
    files: ReadonlyArray<ComposerFileAttachment>,
  ) => Promise<ReadonlyArray<ChatAttachment>>;
  readonly readImage: (file: File) => Promise<string>;
}) {
  const files = input.files.length === 0 ? [] : await input.uploadFiles(input.files);
  if (files.length !== input.files.length) throw createQueuedEditUploadFailure();
  const images = await Promise.all(
    input.images.map(async (image) => ({
      type: "image" as const,
      id: image.id,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      dataUrl: await input.readImage(image.file),
      ...(image.source ? { source: image.source } : {}),
    })),
  );
  return [...input.existingAttachments, ...images, ...files];
}

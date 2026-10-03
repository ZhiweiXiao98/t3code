import {
  codexFeedbackNotice,
  type CodexFeedbackSubmission,
} from "@t3tools/client-runtime/state/threads";
import { MessageSquareIcon } from "lucide-react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";
import type { WebTranslate } from "../../i18n/WebI18nProvider";

export function feedbackBannerItem(
  submission: CodexFeedbackSubmission,
  onDismiss: () => void,
  t: WebTranslate,
): ComposerBannerStackItem | null {
  if (submission.status === "interrupted") return null;
  const notice = codexFeedbackNotice(submission);
  if (!notice) return null;
  const localizedNotice =
    submission.status === "uploading"
      ? { title: t("feedback.sending"), description: undefined }
      : submission.status === "sent"
        ? {
            title: t("feedback.sent"),
            description: t("feedback.threadId", { id: submission.feedbackId }),
          }
        : submission.status === "failed"
          ? { title: t("feedback.sendFailed"), description: submission.errorMessage }
          : { title: t("feedback.sending"), description: undefined };
  return {
    id: `feedback:${submission.id}`,
    variant:
      submission.status === "failed" ? "error" : submission.status === "sent" ? "success" : "info",
    priority: submission.status === "uploading" ? "activity" : "notice",
    icon: <MessageSquareIcon />,
    ...localizedNotice,
    actions:
      submission.status === "sent" ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            void writeTextToClipboard(submission.feedbackId, t("feedback.clipboardTarget")).catch(
              (error: unknown) => {
                toastManager.add({
                  type: "error",
                  title: t("feedback.copyFailed"),
                  description: error instanceof Error ? error.message : t("common.error"),
                });
              },
            );
          }}
        >
          {t("feedback.copyId")}
        </Button>
      ) : undefined,
    ...(submission.status !== "uploading"
      ? { dismissLabel: t("feedback.dismiss"), onDismiss }
      : {}),
  };
}

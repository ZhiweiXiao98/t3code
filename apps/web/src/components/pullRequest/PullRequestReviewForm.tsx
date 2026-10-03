import { translateWebSource } from "~/i18n/messages";
/**
 * The review half of the floating composer: the summary and the verdict that sends it, together
 * with whatever line comments the review is holding. The count of those lives on the composer's
 * trigger and mode toggle, and each pending card can be dropped from the diff, so neither is
 * repeated here. The popover around it belongs to PullRequestComposer.
 */
import type { EnvironmentId, PullRequestRef, PullRequestReviewVerdict } from "@t3tools/contracts";
import { CheckIcon, MessageSquareIcon, XCircleIcon } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";

import { useI18n } from "~/i18n/WebI18nProvider";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";

import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  pullRequestReviewKey,
  usePendingReviewComments,
  usePullRequestReviewStore,
} from "./pullRequestReviewStore";

const VERDICTS: ReadonlyArray<{
  readonly value: PullRequestReviewVerdict;
  readonly icon: ReactNode;
}> = [
  {
    value: "comment",
    icon: <MessageSquareIcon className="size-3" />,
  },
  {
    value: "approve",
    icon: <CheckIcon className="size-3" />,
  },
  {
    value: "request-changes",
    icon: <XCircleIcon className="size-3" />,
  },
];

export function PullRequestReviewForm({
  environmentId,
  reference,
  verdicts,
  requestChangesSummaryRequired,
  textareaRef,
  pending,
  onPendingChange,
  onSubmitted,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  verdicts: ReadonlyArray<PullRequestReviewVerdict>;
  requestChangesSummaryRequired: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSubmitted: () => void;
}) {
  const { locale: uiLocale } = useI18n();
  const { t } = useI18n();
  const verdictLabel = (value: PullRequestReviewVerdict) =>
    t(
      value === "approve"
        ? "pullRequests.review.approve"
        : value === "request-changes"
          ? "pullRequests.review.requestChanges"
          : "pullRequests.comments.comment",
    );
  const [requestedVerdict, setRequestedVerdict] = useState<PullRequestReviewVerdict>("comment");
  const comments = usePendingReviewComments(reference);
  const reviewKey = pullRequestReviewKey(reference);
  // The panel stays mounted while the selected pull request changes. Keeping summaries beside
  // the keyed line-comment drafts makes the selected pull request's body correct on the first
  // render, before an effect could reset state left behind by the previous one.
  const body = usePullRequestReviewStore((store) => store.summaries[reviewKey] ?? "");
  const removeComments = usePullRequestReviewStore((store) => store.removeComments);
  const setSummary = usePullRequestReviewStore((store) => store.setSummary);
  const clearSummary = usePullRequestReviewStore((store) => store.clearSummary);
  const submitReview = useAtomCommand(pullRequestEnvironment.submitReview, {
    reportFailure: false,
  });

  const offered = VERDICTS.filter((verdict) => verdicts.includes(verdict.value));
  const selectedVerdict =
    offered.find((verdict) => verdict.value === requestedVerdict) ?? offered[0];

  const submit = async (verdict: (typeof VERDICTS)[number]) => {
    if (pending) return;
    const submittedBody = body;
    const submittedComments = comments;
    onPendingChange(true);
    const result = await submitReview({
      environmentId,
      input: {
        ...reference,
        verdict: verdict.value,
        body: submittedBody,
        comments: submittedComments,
      },
    });
    onPendingChange(false);
    if (result._tag === "Failure") {
      // The draft is kept: whatever went wrong, retyping the review is not the answer.
      toastManager.add({ type: "error", title: t("pullRequests.review.submitFailed") });
      return;
    }
    // More remarks may have been added while the host was accepting this snapshot. Leave those,
    // and any summary revised in the meantime, ready for the next review.
    removeComments(
      reviewKey,
      submittedComments.map((comment) => comment.id),
    );
    clearSummary(reviewKey, submittedBody);
    toastManager.add({
      type: "success",
      title:
        verdict.value === "approve"
          ? t("pullRequests.review.approvedSuccess")
          : verdict.value === "request-changes"
            ? t("pullRequests.review.changesRequestedSuccess")
            : t("pullRequests.review.submittedSuccess"),
    });
    onSubmitted();
  };

  // Forgejo requires a summary when requesting changes, even with inline comments.
  const canSubmit = (verdict: PullRequestReviewVerdict) =>
    verdict === "request-changes" && requestChangesSummaryRequired
      ? body.trim().length > 0
      : verdict === "approve" || body.trim().length > 0 || comments.length > 0;

  return (
    <>
      <Textarea
        ref={textareaRef}
        rows={3}
        value={body}
        placeholder={
          requestChangesSummaryRequired && verdicts.includes("request-changes")
            ? translateWebSource(uiLocale, "Summarize your review (required to request changes)")
            : t("pullRequests.review.summaryPlaceholder")
        }
        aria-label={t("pullRequests.review.summaryAria")}
        onChange={(event) => setSummary(reviewKey, event.target.value)}
      />
      <div className="mt-2 flex justify-between gap-2">
        <Select
          value={selectedVerdict?.value ?? null}
          disabled={pending}
          onValueChange={(value) => {
            if (value !== null) setRequestedVerdict(value);
          }}
        >
          <SelectTrigger
            size="xs"
            className="w-auto min-w-0"
            aria-label={translateWebSource(uiLocale, "Review verdict")}
          >
            <span className="flex items-center gap-1.5">
              {selectedVerdict?.icon}
              {selectedVerdict ? verdictLabel(selectedVerdict.value) : null}
            </span>
          </SelectTrigger>
          <SelectPopup side="top" alignItemWithTrigger={false}>
            {offered.map((verdict) => (
              <SelectItem key={verdict.value} value={verdict.value}>
                <span className="flex items-center gap-1.5">
                  {verdict.icon}
                  {verdictLabel(verdict.value)}
                </span>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Button
          size="xs"
          disabled={pending || selectedVerdict === undefined || !canSubmit(selectedVerdict.value)}
          onClick={() => {
            if (selectedVerdict !== undefined) void submit(selectedVerdict);
          }}
        >
          {pending ? "Submitting..." : "Submit review"}
        </Button>
      </div>
    </>
  );
}

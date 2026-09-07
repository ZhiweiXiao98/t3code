/**
 * Asking someone to review, from the row that says who is already reviewing.
 *
 * The people who may be asked are read only once this menu opens: on a large repository that is
 * a list of everyone with access, which is worth a request when somebody wants it and worth
 * nothing on every pull request they merely open.
 */
import type {
  EnvironmentId,
  PullRequestRef,
  PullRequestReviewerCandidate,
} from "@t3tools/contracts";
import { CheckIcon, UserPlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { pullRequestEnvironment } from "~/state/pullRequests";
import { useI18n } from "../../i18n/WebI18nProvider";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { toastManager } from "../ui/toast";
import { PullRequestCandidatePicker } from "./PullRequestCandidatePicker";
import { PullRequestActorLabel } from "./pullRequestPresentation";
import { readableFailure } from "./pullRequestDetail.logic";

/** Long lists are common — an organisation repository lists everyone — so what arrived can be
 * narrowed here. It narrows only what arrived: the host is asked once, when the menu opens. */
function matches(candidate: PullRequestReviewerCandidate, query: string): boolean {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    candidate.login.toLowerCase().includes(needle) ||
    (candidate.name ?? "").toLowerCase().includes(needle)
  );
}

export function PullRequestReviewerPicker({
  environmentId,
  reference,
  allowed,
  onRequested,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  /** False where the host would refuse this account's request, which is worth saying rather than
   * hiding: the control disabled with a reason answers the question its absence would raise. */
  allowed: boolean;
  /** The detail carries who is requested, so it is re-read once the host has taken the change. */
  onRequested: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  // Mounted with the menu closed, so nothing is asked of the host until it opens.
  const candidatesQuery = useEnvironmentQuery(
    open ? pullRequestEnvironment.reviewerCandidates({ environmentId, input: reference }) : null,
  );
  const requestReviewers = useAtomCommand(pullRequestEnvironment.requestReviewers, {
    reportFailure: false,
  });

  const candidates = useMemo(
    () => (candidatesQuery.data?.candidates ?? []).filter((entry) => matches(entry, query)),
    [candidatesQuery.data, query],
  );

  const toggle = async (candidate: PullRequestReviewerCandidate) => {
    if (pending !== null) return;
    setPending(candidate.id);
    const result = await requestReviewers({
      environmentId,
      input: {
        ...reference,
        reviewers: [{ id: candidate.id, kind: candidate.kind }],
        requested: !candidate.isRequested,
      },
    });
    setPending(null);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: candidate.isRequested
          ? t("pullRequests.reviewers.withdrawFailed", { reviewer: candidate.login })
          : t("pullRequests.reviewers.requestFailed", { reviewer: candidate.login }),
        description: readableFailure(
          squashAtomCommandFailure(result),
          t("pullRequests.reviewers.permissionFailure"),
        ),
      });
      return;
    }
    toastManager.add({
      type: "success",
      title: candidate.isRequested
        ? t("pullRequests.reviewers.withdrawn", { reviewer: candidate.login })
        : t("pullRequests.reviewers.requested", { reviewer: candidate.login }),
    });
    onRequested();
    candidatesQuery.refresh();
  };

  return (
    <PullRequestCandidatePicker
      icon={<UserPlusIcon className="size-3.5" />}
      label={t("pullRequests.reviewers.request")}
      allowed={allowed}
      disabledReason={t("pullRequests.reviewers.needsWrite")}
      open={open}
      onOpenChange={setOpen}
      query={query}
      onQueryChange={setQuery}
      searchLabel={t("pullRequests.reviewers.search")}
      isPending={candidatesQuery.isPending}
      error={candidatesQuery.error}
      candidates={candidates}
      emptyLabel={t("pullRequests.reviewers.empty")}
      noMatchLabel={t("pullRequests.reviewers.noMatch")}
      errorLabel={t("pullRequests.reviewers.readFailed")}
      truncated={candidatesQuery.data?.truncated === true}
      truncatedLabel={t("pullRequests.reviewers.truncated")}
      candidateKey={(candidate) => `${candidate.kind}:${candidate.id}`}
      disabled={pending !== null}
      onSelect={(candidate) => void toggle(candidate)}
    >
      {(candidate) => (
        <>
          <PullRequestActorLabel actor={candidate} className="min-w-0 flex-1 truncate" />
          {candidate.kind === "team" ? (
            <span className="shrink-0 text-muted-foreground">
              {t("pullRequests.reviewers.team")}
            </span>
          ) : null}
          {candidate.isRequested ? (
            <CheckIcon
              aria-label={t("pullRequests.reviewers.alreadyAsked")}
              className="size-3.5 shrink-0"
            />
          ) : null}
        </>
      )}
    </PullRequestCandidatePicker>
  );
}

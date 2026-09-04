import { ExternalLinkIcon, GitPullRequestIcon, RefreshCwIcon } from "lucide-react";

import { useI18n } from "../../i18n/WebI18nProvider";
import { Button } from "../ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";

export function PullRequestsUnavailableState({
  title,
  error,
  onRetry,
  gitHubUrl,
}: {
  title?: string;
  error: string;
  onRetry?: () => void;
  gitHubUrl?: string;
}) {
  const { t } = useI18n();
  const displayTitle = title ?? t("pullRequests.unavailable.loadFailed");
  return (
    <Empty className="px-4 py-16 md:px-4">
      <EmptyMedia variant="icon">
        <GitPullRequestIcon />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{displayTitle}</EmptyTitle>
        {/* The caller names the fix — update the environment, install gh, sign in — so this
            shows its message rather than trying to infer one from the failure text. */}
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      {onRetry || gitHubUrl ? (
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCwIcon className="size-3.5" />
              {t("pullRequests.unavailable.retry")}
            </Button>
          ) : null}
          {gitHubUrl ? (
            <Button
              size="sm"
              variant="outline"
              render={<a href={gitHubUrl} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLinkIcon aria-hidden className="size-3.5" />
              {t("pullRequests.openOnGitHub")}
            </Button>
          ) : null}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

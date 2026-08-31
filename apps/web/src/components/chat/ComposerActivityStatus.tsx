import { LoaderCircleIcon } from "lucide-react";
import { useI18n } from "../../i18n/WebI18nProvider";
import type { ThreadSyncPhase } from "../../threadSync";
import { ComposerBanner } from "./ComposerBanner";

export function ComposerActivityRow({ phase }: { readonly phase: ThreadSyncPhase }) {
  const { t } = useI18n();
  return (
    <ComposerBanner.Row>
      <ComposerBanner.Icon>
        <LoaderCircleIcon className="motion-safe:animate-spin" />
      </ComposerBanner.Icon>
      <ComposerBanner.Content>
        <span
          className="shrink-0 whitespace-nowrap text-muted-foreground"
          data-composer-sync-status={phase}
          role="status"
        >
          {t(
            phase === "loading"
              ? "composer.state.messagesLoading"
              : "composer.state.messagesSyncing",
          )}
        </span>
      </ComposerBanner.Content>
    </ComposerBanner.Row>
  );
}

import { memo } from "react";
import { useI18n } from "../../i18n/WebI18nProvider";
import { Badge } from "../ui/badge";

export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  const { t } = useI18n();

  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="info"
          size="sm"
          className="rounded-md px-1.5 py-0 font-semibold tracking-wide uppercase"
        >
          {t("composer.planReady")}
        </Badge>
        {planTitle ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{planTitle}</span>
        ) : null}
      </div>
      {/* <div className="mt-2 text-xs text-muted-foreground">
        Review the plan
      </div> */}
    </div>
  );
});

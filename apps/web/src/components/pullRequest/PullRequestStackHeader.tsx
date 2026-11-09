import { translateWebSource } from "~/i18n/messages";
import { useI18n } from "~/i18n/WebI18nContext";
import { MenuGroupLabel } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function PullRequestStackHeader({
  number,
  notice,
  stale = false,
}: {
  number: number;
  notice?: string | null | undefined;
  stale?: boolean;
}) {
  const { locale, t } = useI18n();
  return (
    <MenuGroupLabel>
      <div className="flex items-center justify-between gap-2">
        <span>{t("pullRequests.stack.number", { number })}</span>
        {notice ? (
          <Tooltip>
            <TooltipTrigger render={<span role="status" className="text-xs font-normal" />}>
              {stale
                ? translateWebSource(locale, "May be stale")
                : translateWebSource(locale, "Refreshing…")}
            </TooltipTrigger>
            <TooltipPopup>{notice}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
    </MenuGroupLabel>
  );
}

import { translateWebSource } from "~/i18n/messages";
import { useI18n } from "~/i18n/WebI18nContext";
import { InfoIcon, RotateCwIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function DiffFileStatus({
  error,
  truncated,
  retry,
}: {
  error?: boolean | undefined;
  truncated?: boolean | undefined;
  retry: () => void;
}) {
  const { locale } = useI18n();
  if (!error && !truncated) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            aria-label={
              error
                ? translateWebSource(locale, "Retry loading diff")
                : translateWebSource(locale, "Partial diff preview")
            }
            onClick={(event) => {
              event.stopPropagation();
              if (error) retry();
            }}
          />
        }
      >
        {error ? <RotateCwIcon className="size-3" /> : <InfoIcon className="size-3" />}
      </TooltipTrigger>
      <TooltipPopup>
        {error
          ? translateWebSource(locale, "Retry loading diff")
          : translateWebSource(
              locale,
              "This file is too large to show in full. Counts include all changes.",
            )}
      </TooltipPopup>
    </Tooltip>
  );
}

import { CheckIcon, CopyIcon } from "lucide-react";
import { useRef } from "react";
import { useI18n } from "../i18n/WebI18nProvider";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import {
  ANCHORED_COPY_TOAST_TIMEOUT_MS,
  showAnchoredCopyErrorToast,
  showAnchoredCopySuccessToast,
} from "./ui/anchoredCopyToast";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

export function DiffFilePathCopyButton({ filePath }: { filePath: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLButtonElement>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard<void>({
    onCopy: () => showAnchoredCopySuccessToast(ref),
    onError: (error) => showAnchoredCopyErrorToast(ref, error),
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            ref={ref}
            size="icon-micro"
            variant="ghost"
            className="text-muted-foreground [:hover,[data-pressed]]:bg-transparent"
            aria-label={t("files.copyPath")}
            onClick={() => copyToClipboard(filePath, undefined)}
          />
        }
      >
        {isCopied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
      </TooltipTrigger>
      <TooltipPopup>
        <p>{isCopied ? t("common.copied") : t("files.copyPath")}</p>
      </TooltipPopup>
    </Tooltip>
  );
}

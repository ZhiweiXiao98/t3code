import { clipboardErrorMessage } from "../../i18n/clipboardErrorMessages";
import { readWebI18n } from "../../i18n/readWebI18n";
import { translateWebSource } from "../../i18n/messages";
import { useI18n } from "../../i18n/WebI18nContext";
import { useRef } from "react";

import { APP_VERSION } from "../../branding";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { InlineButton } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function AboutVersionTitle() {
  const { locale } = useI18n();
  const tx = (source: string) => translateWebSource(locale, source);

  const copyTarget = tx("version");
  const { copyToClipboard } = useCopyToClipboard<void>({
    target: copyTarget,
    onError: (error) => {
      const { locale } = readWebI18n();
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: translateWebSource(locale, "Could not copy version"),
          description:
            clipboardErrorMessage(error, locale, {
              target: copyTarget,
              displayTarget: translateWebSource(locale, "version"),
            }) ?? error.message,
        }),
      );
    },
  });

  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{tx("Version")}</span>
      <code className="text-2xs font-medium">
        <Tooltip>
          <TooltipTrigger
            render={
              <InlineButton
                tone="muted"
                aria-label={
                  locale === "zh-CN"
                    ? `复制版本号 ${APP_VERSION}`
                    : `Copy version ${APP_VERSION}`
                }
                onClick={() => copyToClipboard(APP_VERSION, undefined)}
              >
                {APP_VERSION}
              </InlineButton>
            }
          />
          <TooltipPopup>{tx("Copy version")}</TooltipPopup>
        </Tooltip>
      </code>
    </span>
  );
}

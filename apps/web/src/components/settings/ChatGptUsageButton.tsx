import { translateWebSource } from "../../i18n/messages";
import { useI18n } from "../../i18n/WebI18nContext";
import type { ComponentProps } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { CHATGPT_USAGE_URL } from "@t3tools/shared/usageLimits";
import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";

export function ChatGptUsageButton(props: Omit<ComponentProps<typeof Button>, "onClick">) {
  const { locale: translationLocale } = useI18n();
  return (
    <Button
      variant="ghost-muted"
      size="sm"
      {...props}
      onClick={() => void ensureLocalApi().shell.openExternal(CHATGPT_USAGE_URL)}
    >
      {translateWebSource(translationLocale, "Manage usage")}
      <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
    </Button>
  );
}

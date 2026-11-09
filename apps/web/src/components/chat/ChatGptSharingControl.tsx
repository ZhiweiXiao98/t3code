import { useI18n } from "~/i18n/WebI18nContext";
import { usesChatGptSharing } from "@t3tools/shared/usageLimits";
import type { ServerProvider } from "@t3tools/contracts";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";

export function ChatGptSharingControl({ provider }: { provider: ServerProvider | null }) {
  const { t: controlsT } = useI18n();
  if (!usesChatGptSharing(provider)) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-t px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <OpenAI className="size-3.5" aria-hidden="true" />
        {controlsT("chatControls.copy1")}
      </span>
      <ChatGptUsageButton size="xs" />
    </div>
  );
}

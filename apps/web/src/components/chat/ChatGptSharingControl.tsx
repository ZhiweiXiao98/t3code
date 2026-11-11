import { useI18n } from "~/i18n/WebI18nContext";
import { usesChatGptSharing } from "@t3tools/shared/usageLimits";
import type { ServerProvider } from "@t3tools/contracts";
import { useId } from "react";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const speedNotice =
  "Fast and Ultrafast are unavailable with this ChatGPT connection. Use an existing Codex CLI login for speed options your account supports.";

export function ChatGptSharingControl({ provider }: { provider: ServerProvider | null }) {
  const { t: controlsT, locale } = useI18n();
  const speedNoticeId = useId();
  if (!usesChatGptSharing(provider)) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-t px-3 py-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-describedby={speedNoticeId}
              tabIndex={0}
              className="flex items-center gap-2 rounded-sm text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          <OpenAI className="size-3.5" aria-hidden="true" />
          {controlsT("chatControls.copy1")}
        </TooltipTrigger>
        <span id={speedNoticeId} className="sr-only">
          {locale === "zh-CN"
            ? "此 ChatGPT 连接不支持 Fast 和 Ultrafast。请使用现有的 Codex CLI 登录以使用账户支持的速度选项。"
            : speedNotice}
        </span>
        <TooltipPopup side="top">
          {locale === "zh-CN"
            ? "此 ChatGPT 连接不支持 Fast 和 Ultrafast。请使用现有的 Codex CLI 登录以使用账户支持的速度选项。"
            : speedNotice}
        </TooltipPopup>
      </Tooltip>
      <ChatGptUsageButton size="xs" />
    </div>
  );
}

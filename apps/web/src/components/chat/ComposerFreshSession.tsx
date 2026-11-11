import { translateChatUpdate } from "./v018Messages";
import { readWebI18n } from "~/i18n/readWebI18n";
import { EraserIcon } from "lucide-react";

import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/** Shown while `/clear` is armed; dismissing it keeps the current conversation. */
export function freshSessionBannerItem(onUndo: () => void): ComposerBannerStackItem {
  const { locale } = readWebI18n();
  const tx = (source: string) => translateChatUpdate(locale, source);
  return {
    id: "fresh-session",
    variant: "info",
    icon: <EraserIcon />,
    title: tx("Your next message starts a fresh session"),
    description: tx("The agent won't see earlier messages in this thread."),
    dismissLabel: tx("Keep the current session"),
    onDismiss: onUndo,
  };
}

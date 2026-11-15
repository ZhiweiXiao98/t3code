import { useEffect, useEffectEvent } from "react";
import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { isCommandPaletteOpen } from "~/commandPaletteBus";
import { resolveShortcutCommand, type ShortcutMatchContext } from "~/keybindings";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readWebI18n } from "~/i18n/readWebI18n";
import { clipboardErrorMessage } from "~/i18n/clipboardErrorMessages";
import type { PullRequestSurface } from "~/rightPanelStore";
import { toastManager } from "../ui/toast";

const OWNED_LINK_TARGETS: Readonly<Record<string, string>> = {
  "pull request link": "拉取请求链接",
  "merge request link": "合并请求链接",
  "change request link": "变更请求链接",
};

export function usePullRequestsPageShortcuts({
  openPanelPullRequestUrl,
  keybindings,
  getShortcutContext,
  activePullRequestSurface,
  closeSurface,
  rightPanelAvailable,
  rightPanelOpen,
  toggleRightPanel,
  toggleRightPanelMaximized,
}: {
  openPanelPullRequestUrl: string | null | undefined;
  keybindings: ResolvedKeybindingsConfig;
  getShortcutContext: () => ShortcutMatchContext;
  activePullRequestSurface: PullRequestSurface | null;
  closeSurface: (surface: PullRequestSurface) => void;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  toggleRightPanelMaximized: () => void;
}) {
  const currentShortcutContext = useEffectEvent(getShortcutContext);
  const copyPullRequestFromShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!openPanelPullRequestUrl) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    const url = openPanelPullRequestUrl;
    const { shortLabel, singular } = (
      sourceControlClients.findByChangeRequestUrl(url) ?? sourceControlClients.get(undefined)
    ).changeRequest;
    const target = `${singular} link`;
    void writeTextToClipboard(url, target).then(
      (didCopy) => {
        if (didCopy)
          toastManager.add({
            type: "success",
            title: readWebI18n().t("audit6.prCopied", { kind: shortLabel }),
            description: url,
          });
      },
      (error) => {
        const { locale, t } = readWebI18n();
        const displayTarget = OWNED_LINK_TARGETS[target];
        toastManager.add({
          type: "error",
          title: t("audit6.prCopyFailed", { kind: shortLabel }),
          description:
            clipboardErrorMessage(
              error,
              locale,
              displayTarget === undefined ? undefined : { target, displayTarget },
            ) ?? t("common.error"),
        });
      },
    );
  });
  const closeActiveSurfaceFromShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (activePullRequestSurface === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) closeSurface(activePullRequestSurface);
  });
  const toggleRightPanelFromShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!rightPanelAvailable) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) toggleRightPanel();
  });
  const toggleRightPanelMaximizedFromShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!rightPanelOpen) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) toggleRightPanelMaximized();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- document keydown listener for the right panel and copy-reference shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isCommandPaletteOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: currentShortcutContext(),
      });
      if (command === "rightPanel.close") closeActiveSurfaceFromShortcut(event);
      if (command === "rightPanel.toggle") toggleRightPanelFromShortcut(event);
      if (command === "rightPanel.toggleMaximized") toggleRightPanelMaximizedFromShortcut(event);
      if (command === "thread.copyReference") copyPullRequestFromShortcut(event);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [keybindings]);
}

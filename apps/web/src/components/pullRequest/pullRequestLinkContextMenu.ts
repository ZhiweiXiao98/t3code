import { readWebI18n } from "~/i18n/readWebI18n";
import { translateWebSource } from "~/i18n/messages";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import type { ContextMenuItem } from "@t3tools/contracts";
import {
  type SourceControlDefinition,
  UNKNOWN_SOURCE_CONTROL_CLIENT,
} from "@t3tools/client-runtime/source-control-clients";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-external";

export const openOnHostLabel = (
  host: SourceControlDefinition,
  locale: ResolvedAppLocale = "en",
): string =>
  host === UNKNOWN_SOURCE_CONTROL_CLIENT
    ? translateWebSource(locale, "Open on host")
    : locale === "zh-CN"
      ? `在 ${host.label} 打开`
      : `Open on ${host.label}`;

function pullRequestLinkContextMenuItems(
  openLabel: string,
): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    { id: "copy-link", label: translateWebSource(readWebI18n().locale, "Copy link"), icon: "copy" },
    { id: "open-external", label: openLabel },
  ];
}

export async function showPullRequestLinkContextMenu({
  url,
  openLabel,
  position,
}: {
  readonly url: string;
  readonly openLabel: string;
  readonly position: { readonly x: number; readonly y: number };
}): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    action = await api.contextMenu.show(pullRequestLinkContextMenuItems(openLabel), position);
  } catch {
    return;
  }
  try {
    if (action === "copy-link") await writeTextToClipboard(url, "link");
    else if (action === "open-external") await api.shell.openExternal(url);
  } catch {
    toastManager.add({
      type: "error",
      title: translateWebSource(
        readWebI18n().locale,
        action === "copy-link" ? "Could not copy the link" : "Could not open the link",
      ),
    });
  }
}

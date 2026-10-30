import type { ContextMenuItem } from "@t3tools/contracts";

type ExternalLinkContextMenuAction =
  | "open-in-preview"
  | "open-external"
  | "copy-link"
  | "link-to-thread"
  | "unlink-from-thread";

type ExternalLinkContextMenuFailureOperation =
  | "show-link-context-menu"
  | "open-link-in-preview"
  | "open-link-external"
  | "copy-link"
  | "link-pull-request-to-thread"
  | "unlink-pull-request-from-thread";

const FAILURE_OPERATION_BY_ACTION = {
  "open-in-preview": "open-link-in-preview",
  "open-external": "open-link-external",
  "copy-link": "copy-link",
  "link-to-thread": "link-pull-request-to-thread",
  "unlink-from-thread": "unlink-pull-request-from-thread",
} as const satisfies Record<ExternalLinkContextMenuAction, ExternalLinkContextMenuFailureOperation>;

export interface ExternalLinkContextMenuLabels {
  readonly openInPreview: string;
  readonly openExternal: string;
  readonly copyLink: string;
  readonly linkToThread: string;
  readonly unlinkFromThread: string;
}

const DEFAULT_EXTERNAL_LINK_CONTEXT_MENU_LABELS: ExternalLinkContextMenuLabels = {
  openInPreview: "Open in integrated browser",
  openExternal: "Open in system browser",
  copyLink: "Copy Link",
  linkToThread: "Link to thread",
  unlinkFromThread: "Unlink from thread",
};

function externalLinkContextMenuItems(options: {
  readonly canOpenInPreview: boolean;
  readonly threadLinkAction?: "link-to-thread" | "unlink-from-thread" | undefined;
  readonly labels?: ExternalLinkContextMenuLabels | undefined;
}): readonly ContextMenuItem<ExternalLinkContextMenuAction>[] {
  const labels = options.labels ?? DEFAULT_EXTERNAL_LINK_CONTEXT_MENU_LABELS;
  const baseItems = [
    { id: "open-in-preview", label: labels.openInPreview },
    { id: "open-external", label: labels.openExternal },
    { id: "copy-link", label: labels.copyLink },
  ] as const satisfies readonly ContextMenuItem<ExternalLinkContextMenuAction>[];
  const items = options.canOpenInPreview
    ? baseItems
    : baseItems.filter((item) => item.id !== "open-in-preview");
  if (options.threadLinkAction === undefined) return items;
  return [
    {
      id: options.threadLinkAction,
      label:
        options.threadLinkAction === "link-to-thread"
          ? labels.linkToThread
          : labels.unlinkFromThread,
    },
    ...items,
  ];
}

interface ShowExternalLinkContextMenuOptions {
  readonly href: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly canOpenInPreview?: boolean;
  readonly threadLinkAction?: "link-to-thread" | "unlink-from-thread" | undefined;
  readonly labels?: ExternalLinkContextMenuLabels | undefined;
  readonly showContextMenu: (
    items: readonly ContextMenuItem<ExternalLinkContextMenuAction>[],
    position: { readonly x: number; readonly y: number },
  ) => Promise<ExternalLinkContextMenuAction | null>;
  readonly openInPreview: (href: string) => Promise<void>;
  readonly openExternal: (href: string) => Promise<void>;
  readonly copyLink: (href: string) => Promise<unknown>;
  readonly updateThreadLink?: (href: string, linked: boolean) => Promise<void>;
  readonly reportFailure: (
    operation: ExternalLinkContextMenuFailureOperation,
    cause: unknown,
  ) => void;
}

function resolveExternalWebLink(href: string | null | undefined): URL | null {
  if (!href) return null;
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveExternalWebLinkHref(href: string | null | undefined): string | null {
  return resolveExternalWebLink(href)?.href ?? null;
}

export function resolveExternalWebLinkHost(href: string | undefined): string | null {
  return resolveExternalWebLink(href)?.hostname || null;
}

export async function showExternalLinkContextMenu({
  href,
  position,
  canOpenInPreview = true,
  threadLinkAction,
  labels,
  showContextMenu,
  openInPreview,
  openExternal,
  copyLink,
  updateThreadLink,
  reportFailure,
}: ShowExternalLinkContextMenuOptions): Promise<void> {
  let action: ExternalLinkContextMenuAction | null;
  try {
    action = await showContextMenu(
      externalLinkContextMenuItems({ canOpenInPreview, threadLinkAction, labels }),
      position,
    );
  } catch (cause) {
    reportFailure("show-link-context-menu", cause);
    return;
  }

  try {
    if (action === "open-in-preview") {
      await openInPreview(href);
    } else if (action === "open-external") {
      await openExternal(href);
    } else if (action === "copy-link") {
      await copyLink(href);
    } else if (action === "link-to-thread" || action === "unlink-from-thread") {
      await updateThreadLink?.(href, action === "link-to-thread");
    }
  } catch (cause) {
    if (action) reportFailure(FAILURE_OPERATION_BY_ACTION[action], cause);
  }
}

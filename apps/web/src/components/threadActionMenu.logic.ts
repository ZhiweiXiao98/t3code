import type { ContextMenuItem } from "@t3tools/contracts";
import type { SnoozePreset } from "@t3tools/client-runtime/state/thread-settled";

import type { WebTranslate } from "../i18n/WebI18nProvider";

/**
 * Ids for the per-thread action menu. Snooze presets are dispatched as
 * `snooze:<presetId>` so the union stays closed while the preset list
 * remains data-driven.
 */
export type ThreadActionMenuId =
  | "new-thread-on-branch"
  | "project-settings"
  | "pin"
  | "unpin"
  | "settle"
  | "unsettle"
  | "snooze"
  | `snooze:${string}`
  | "unsnooze"
  | "rename"
  | "regenerate-title"
  | "mark-unread"
  | "copy"
  | "copy-path"
  | "copy-branch"
  | "copy-thread-id"
  | "archive"
  | "delete";

export interface ThreadActionMenuState {
  readonly branch: string | null;
  readonly isPinned: boolean;
  readonly isSettled: boolean;
  readonly isSnoozed: boolean;
  readonly canSnoozeNow: boolean;
  readonly isRegeneratingTitle: boolean;
  /** Archive rejects a thread with an active turn, so disable it here rather than let the action fail. */
  readonly isRunning: boolean;
  readonly supports: {
    readonly settlement: boolean;
    readonly snooze: boolean;
    readonly pinning: boolean;
    readonly titleRegeneration: boolean;
  };
  readonly snoozePresets: ReadonlyArray<SnoozePreset>;
}

export function localizeSnoozePresetLabel(preset: SnoozePreset, t: WebTranslate): string {
  switch (preset.id) {
    case "hour":
      return t("sidebar.snooze.hour");
    case "three-hours":
      return t("sidebar.snooze.threeHours");
    case "evening":
      return t("sidebar.snooze.evening");
    case "tomorrow":
      return t("sidebar.snooze.tomorrow");
    case "next-week":
      return t("sidebar.snooze.nextWeek");
    default:
      return preset.label;
  }
}

/**
 * Single source for the per-thread action menu: the sidebar row's right-click
 * menu and the chat header menu both render exactly this list, so labels,
 * ordering, and capability gating cannot drift between the two surfaces.
 */
export function buildThreadActionMenuItems(
  state: ThreadActionMenuState,
  translate?: WebTranslate,
): ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> {
  const label = (
    key: Parameters<WebTranslate>[0],
    fallback: string,
    values?: Parameters<WebTranslate>[1],
  ) => translate?.(key, values) ?? fallback;

  return [
    ...(state.branch
      ? [
          {
            id: "new-thread-on-branch" as const,
            label: label("sidebar.action.newThreadOnBranch", `New thread on ${state.branch}`, {
              branch: state.branch,
            }),
            icon: "message-square-plus",
          },
        ]
      : []),
    ...(state.supports.pinning
      ? [
          state.isPinned
            ? {
                id: "unpin" as const,
                label: label("sidebar.action.unpin", "Unpin thread"),
                icon: "pin-off",
              }
            : {
                id: "pin" as const,
                label: label("sidebar.action.pin", "Pin thread"),
                icon: "pin",
              },
        ]
      : []),
    // Both lifecycle actions stay available on pinned threads: settling
    // clears the pin ("done" beats "keep on top"), and snoozing hides the
    // card until wake with the pin intact.
    ...(state.supports.settlement
      ? [
          state.isSettled
            ? {
                id: "unsettle" as const,
                label: label("sidebar.action.unsettle", "Un-settle thread"),
                icon: "circle-check",
              }
            : {
                id: "settle" as const,
                label: label("sidebar.action.settle", "Settle thread"),
                icon: "circle-check",
              },
        ]
      : []),
    ...(state.supports.snooze
      ? [
          state.isSnoozed
            ? {
                id: "unsnooze" as const,
                label: label("sidebar.action.wake", "Wake thread"),
                icon: "clock",
              }
            : {
                id: "snooze" as const,
                label: label("sidebar.action.snooze", "Snooze"),
                icon: "clock",
                disabled: !state.canSnoozeNow,
                children: state.snoozePresets.map((preset) => ({
                  id: `snooze:${preset.id}` as const,
                  label: `${preset.label} (${preset.whenLabel})`,
                })),
              },
        ]
      : []),
    {
      id: "rename",
      label: label("sidebar.action.rename", "Rename thread"),
      icon: "pencil",
      separatorBefore: true,
    },
    ...(state.supports.titleRegeneration
      ? [
          {
            id: "regenerate-title" as const,
            label: state.isRegeneratingTitle
              ? label("sidebar.action.regenerating", "Regenerating…")
              : label("sidebar.action.regenerateTitle", "Regenerate title"),
            icon: "refresh-cw",
            disabled: state.isRegeneratingTitle,
          },
        ]
      : []),
    {
      id: "mark-unread",
      label: label("sidebar.action.markUnread", "Mark unread"),
      icon: "mail-open",
    },
    {
      id: "copy",
      label: label("sidebar.action.copy", "Copy"),
      icon: "copy",
      separatorBefore: true,
      children: [
        { id: "copy-path", label: label("sidebar.action.path", "Path"), icon: "folder" },
        ...(state.branch
          ? [
              {
                id: "copy-branch" as const,
                label: label("sidebar.action.branch", "Branch"),
                icon: "git-branch",
              },
            ]
          : []),
        {
          id: "copy-thread-id",
          label: label("sidebar.action.threadId", "Thread ID"),
          icon: "hash",
        },
      ],
    },
    { id: "project-settings", label: "Project settings", icon: "settings" },
    // Archive removes the thread from the sidebar while keeping its
    // conversation under Settings > Archived threads — distinct from Settle
    // (stays visible in the Settled shelf) and Delete (clears history for
    // good), so it sits beside Delete without borrowing its destructive
    // styling.
    {
      id: "archive",
      label: label("sidebar.action.archive", "Archive thread"),
      icon: "archive",
      disabled: state.isRunning,
      separatorBefore: true,
    },
    {
      id: "delete",
      label: label("common.delete", "Delete"),
      destructive: true,
      icon: "trash",
    },
  ];
}

import type { ContextMenuItem } from "@t3tools/contracts";
import type { SnoozePreset } from "@t3tools/client-runtime/state/thread-settled";

import type { WebTranslate } from "../i18n/WebI18nContext";

/**
 * Ids for the per-thread action menu. Snooze presets are dispatched as
 * `snooze:<presetId>` so the union stays closed while the preset list
 * remains data-driven.
 */
export type ThreadActionMenuId =
  | "new-thread-on-branch"
  | "filter-by-project"
  | "project-settings"
  | "pin"
  | "unpin"
  | "settle"
  | "unsettle"
  | "auto-settle"
  | "auto-settle:enabled"
  | "auto-settle:disabled"
  | "snooze"
  | `snooze:${string}`
  | "unsnooze"
  | "rename"
  | "regenerate-title"
  | "mark-unread"
  | "share-guest"
  | "copy"
  | "copy-path"
  | "copy-branch"
  | "copy-thread-id"
  | "archive"
  | "delete";

export type DraftActionMenuId =
  | "copy"
  | "copy-path"
  | "copy-branch"
  | "project-settings"
  | "discard";

export function buildDraftActionMenuItems(options: {
  readonly hasPath: boolean;
  readonly hasBranch: boolean;
  readonly hasProject: boolean;
}): ReadonlyArray<ContextMenuItem<DraftActionMenuId>> {
  return [
    {
      id: "copy",
      label: "Copy",
      icon: "copy",
      disabled: !options.hasPath && !options.hasBranch,
      children: [
        ...(options.hasPath ? [{ id: "copy-path" as const, label: "Path", icon: "folder" }] : []),
        ...(options.hasBranch
          ? [{ id: "copy-branch" as const, label: "Branch", icon: "git-branch" }]
          : []),
      ],
    },
    ...(options.hasProject
      ? [{ id: "project-settings" as const, label: "Project settings", icon: "settings" }]
      : []),
    {
      id: "discard",
      label: "Discard draft",
      icon: "trash",
      destructive: true,
      separatorBefore: true,
    },
  ];
}

export interface ThreadActionMenuState {
  readonly canOperate: boolean;
  readonly branch: string | null;
  readonly projectFilter: {
    readonly label: string;
    readonly isActive: boolean;
  } | null;
  readonly isPinned: boolean;
  readonly isSettled: boolean;
  readonly autoSettleEnabled: boolean;
  readonly isSnoozed: boolean;
  readonly canSnoozeNow: boolean;
  readonly isRegeneratingTitle: boolean;
  /** Archive rejects attached providers, so disable it while running. */
  readonly isRunning: boolean;
  readonly supports: {
    readonly settlement: boolean;
    readonly autoSettleOptOut: boolean;
    readonly snooze: boolean;
    readonly pinning: boolean;
    readonly titleRegeneration: boolean;
  };
  readonly snoozePresets: ReadonlyArray<SnoozePreset>;
  /** Guest links need their own grant, so the caller checks it instead of `canOperate`. */
  readonly canShareWithGuest?: boolean;
}

function localizeSnoozePresetLabel(preset: SnoozePreset, t: WebTranslate): string {
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

/** Local navigation, read markers, and copying remain available to read-only clients. */
export function threadActionRequiresOperate(action: ThreadActionMenuId): boolean {
  return ![
    "new-thread-on-branch",
    "project-settings",
    "mark-unread",
    "share-guest",
    "copy",
    "copy-path",
    "copy-branch",
    "copy-thread-id",
  ].includes(action);
}

export function buildThreadActionMenuItems(
  state: ThreadActionMenuState,
  translate?: WebTranslate,
): ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> {
  const label = (
    key: Parameters<WebTranslate>[0],
    fallback: string,
    values?: Parameters<WebTranslate>[1],
  ) => translate?.(key, values) ?? fallback;

  const items: ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> = [
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
                children: [
                  ...state.snoozePresets.map((preset) => ({
                    id: `snooze:${preset.id}` as const,
                    label: `${translate ? localizeSnoozePresetLabel(preset, translate) : preset.label} (${preset.whenLabel})`,
                  })),
                  { id: "snooze:custom" as const, label: "Custom…", separatorBefore: true },
                ],
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
    ...(state.canShareWithGuest
      ? [
          {
            id: "share-guest" as const,
            label: label("sidebar.action.shareGuest", "Share with guest"),
            icon: "user-plus",
          },
        ]
      : []),
    ...(state.projectFilter
      ? [
          {
            id: "filter-by-project" as const,
            label: state.projectFilter.isActive
              ? label("upstream.sidebar.allProjects", "Show all projects")
              : label("upstream.sidebar.projectFilter", `Filter by ${state.projectFilter.label}`, {
                  project: state.projectFilter.label,
                }),
            icon: "folder-tree",
          },
        ]
      : []),
    ...(state.supports.autoSettleOptOut
      ? [
          {
            id: "auto-settle" as const,
            label: label("upstream.sidebar.autoSettle", "Auto-settle behavior"),
            icon: "timer",
            children: [
              {
                id: "auto-settle:enabled" as const,
                label: label("upstream.sidebar.enabled", "Enabled"),
                checked: state.autoSettleEnabled,
              },
              {
                id: "auto-settle:disabled" as const,
                label: label("upstream.sidebar.disabled", "Disabled"),
                checked: !state.autoSettleEnabled,
              },
            ],
          },
        ]
      : []),
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
  return state.canOperate
    ? items
    : items.map((item) =>
        threadActionRequiresOperate(item.id)
          ? {
              ...item,
              disabled: true,
              ...(item.children
                ? { children: item.children.map((child) => ({ ...child, disabled: true })) }
                : {}),
            }
          : item,
      );
}

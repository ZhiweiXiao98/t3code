import type { ContextMenuItem } from "@t3tools/contracts";
import type { SnoozePreset } from "@t3tools/client-runtime/state/thread-settled";

import type { WebTranslate } from "../i18n/WebI18nContext";

/**
 * Ids for the per-thread action menu. Snooze presets are dispatched as
 * `snooze:<presetId>` so the union stays closed while the preset list
 * remains data-driven.
 */
export type ThreadActionMenuId =
  | "find"
  | "new-thread-on-branch"
  | "filter-by-project"
  | "turn-into-project"
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
  | "copy-thread"
  | "copy-thread-id"
  | "archive"
  | "delete";

export type DraftActionMenuId =
  | "copy"
  | "copy-path"
  | "copy-branch"
  | "project-settings"
  | "discard";

export function buildDraftActionMenuItems(
  options: {
    readonly hasPath: boolean;
    readonly hasBranch: boolean;
    readonly hasProject: boolean;
  },
  t: WebTranslate,
): ReadonlyArray<ContextMenuItem<DraftActionMenuId>> {
  return [
    {
      id: "copy",
      label: t("sidebar.action.copy"),
      icon: "copy",
      disabled: !options.hasPath && !options.hasBranch,
      children: [
        ...(options.hasPath
          ? [{ id: "copy-path" as const, label: t("sidebar.action.path"), icon: "folder" }]
          : []),
        ...(options.hasBranch
          ? [{ id: "copy-branch" as const, label: t("sidebar.action.branch"), icon: "git-branch" }]
          : []),
      ],
    },
    ...(options.hasProject
      ? [
          {
            id: "project-settings" as const,
            label: t("sidebar.action.projectSettings"),
            icon: "settings",
          },
        ]
      : []),
    {
      id: "discard",
      label: t("sidebar.discardDraft"),
      icon: "trash",
      destructive: true,
      separatorBefore: true,
    },
  ];
}

export interface ThreadActionMenuState {
  readonly canOperate: boolean;
  readonly canFind?: boolean;
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
  /** A No project thread with its own folder, on a server that can promote it. */
  readonly canTurnIntoProject?: boolean;
}

export function localizeSnoozePresetLabel(preset: SnoozePreset, t: WebTranslate): string {
  const duration = /^In (\d+) (minute|hour|day)s?$/.exec(preset.label);
  if (duration) {
    const count = Number(duration[1]);
    const unit = duration[2];
    if (unit === "minute")
      return t(count === 1 ? "sidebar.snooze.minuteOne" : "sidebar.snooze.minuteMany", { count });
    if (unit === "hour")
      return t(count === 1 ? "sidebar.snooze.hourOne" : "sidebar.snooze.hourMany", { count });
    return t(count === 1 ? "sidebar.snooze.dayOne" : "sidebar.snooze.dayMany", { count });
  }
  const labels = {
    "This morning": "sidebar.snooze.morning",
    "This afternoon": "sidebar.snooze.afternoon",
    "This evening": "sidebar.snooze.evening",
    Tomorrow: "sidebar.snooze.tomorrow",
    "Next week": "sidebar.snooze.nextWeek",
    Monday: "sidebar.snooze.monday",
    Tuesday: "sidebar.snooze.tuesday",
    Wednesday: "sidebar.snooze.wednesday",
    Thursday: "sidebar.snooze.thursday",
    Friday: "sidebar.snooze.friday",
    Saturday: "sidebar.snooze.saturday",
    Sunday: "sidebar.snooze.sunday",
  } as const;
  const next = preset.label.startsWith("Next ");
  const label = next ? preset.label.slice(5) : preset.label;
  const key = labels[preset.label as keyof typeof labels] ?? labels[label as keyof typeof labels];
  if (!key) return preset.label;
  const translated = t(key);
  return next && preset.label !== "Next week"
    ? t("sidebar.snooze.nextDay", { day: translated })
    : translated;
}

/** Local navigation, read markers, and copying remain available to read-only clients. */
export function threadActionRequiresOperate(action: ThreadActionMenuId): boolean {
  return ![
    "find",
    "new-thread-on-branch",
    "project-settings",
    "mark-unread",
    "share-guest",
    "copy",
    "copy-path",
    "copy-branch",
    "copy-thread",
    "copy-thread-id",
  ].includes(action);
}

export function buildThreadActionMenuItems(
  state: ThreadActionMenuState,
  t: WebTranslate,
): ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> {
  const items: ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> = [
    ...(state.canFind
      ? [
          {
            id: "find" as const,
            label: t("sidebar.action.findInThread"),
            icon: "text-search",
          },
        ]
      : []),
    ...(state.branch
      ? [
          {
            id: "new-thread-on-branch" as const,
            label: t("sidebar.action.newThreadOnBranch", {
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
                label: t("sidebar.action.unpin"),
                icon: "pin-off",
              }
            : {
                id: "pin" as const,
                label: t("sidebar.action.pin"),
                icon: "pin",
              },
        ]
      : []),
    ...(state.supports.settlement
      ? [
          state.isSettled
            ? {
                id: "unsettle" as const,
                label: t("sidebar.action.unsettle"),
                icon: "circle-check",
              }
            : {
                id: "settle" as const,
                label: t("sidebar.action.settle"),
                icon: "circle-check",
              },
        ]
      : []),
    ...(state.supports.snooze
      ? [
          state.isSnoozed
            ? {
                id: "unsnooze" as const,
                label: t("sidebar.action.wake"),
                icon: "clock",
              }
            : {
                id: "snooze" as const,
                label: t("sidebar.action.snooze"),
                icon: "clock",
                disabled: !state.canSnoozeNow,
                children: [
                  ...state.snoozePresets.map((preset) => ({
                    id: `snooze:${preset.id}` as const,
                    label: localizeSnoozePresetLabel(preset, t),
                    detail: preset.whenLabel,
                  })),
                  {
                    id: "snooze:custom" as const,
                    label: t("sidebar.snooze.custom"),
                    separatorBefore: state.snoozePresets.length > 0,
                  },
                ],
              },
        ]
      : []),
    {
      id: "rename",
      label: t("sidebar.action.rename"),
      icon: "pencil",
      separatorBefore: true,
    },
    ...(state.supports.titleRegeneration
      ? [
          {
            id: "regenerate-title" as const,
            label: state.isRegeneratingTitle
              ? t("sidebar.action.regenerating")
              : t("sidebar.action.regenerateTitle"),
            icon: "refresh-cw",
            disabled: state.isRegeneratingTitle,
          },
        ]
      : []),
    {
      id: "mark-unread",
      label: t("sidebar.action.markUnread"),
      icon: "mail-open",
    },
    ...(state.canShareWithGuest
      ? [
          {
            id: "share-guest" as const,
            label: t("sidebar.action.shareGuest"),
            icon: "user-plus",
          },
        ]
      : []),
    ...(state.projectFilter
      ? [
          {
            id: "filter-by-project" as const,
            label: state.projectFilter.isActive
              ? t("upstream.sidebar.allProjects")
              : t("upstream.sidebar.projectFilter", {
                  project: state.projectFilter.label,
                }),
            icon: "folder-tree",
          },
        ]
      : []),
    ...(state.canTurnIntoProject
      ? [
          {
            id: "turn-into-project" as const,
            label: t("sidebar.action.turnIntoProject"),
            icon: "folder-plus",
            disabled: state.isRunning,
          },
        ]
      : []),
    ...(state.supports.autoSettleOptOut
      ? [
          {
            id: "auto-settle" as const,
            label: t("upstream.sidebar.autoSettle"),
            icon: "timer",
            children: [
              {
                id: "auto-settle:enabled" as const,
                label: t("upstream.sidebar.followSettings"),
                checked: state.autoSettleEnabled,
              },
              {
                id: "auto-settle:disabled" as const,
                label: t("upstream.sidebar.never"),
                checked: !state.autoSettleEnabled,
              },
            ],
          },
        ]
      : []),
    {
      id: "copy",
      label: t("sidebar.action.copy"),
      icon: "copy",
      separatorBefore: true,
      children: [
        { id: "copy-path", label: t("sidebar.action.path"), icon: "folder" },
        ...(state.branch
          ? [
              {
                id: "copy-branch" as const,
                label: t("sidebar.action.branch"),
                icon: "git-branch",
              },
            ]
          : []),
        {
          id: "copy-thread",
          label: t("sidebar.action.thread"),
          icon: "message-square",
        },
        {
          id: "copy-thread-id",
          label: t("sidebar.action.threadId"),
          icon: "hash",
        },
      ],
    },
    { id: "project-settings", label: t("sidebar.action.projectSettings"), icon: "settings" },
    {
      id: "archive",
      label: t("sidebar.action.archive"),
      icon: "archive",
      disabled: state.isRunning,
      separatorBefore: true,
    },
    {
      id: "delete",
      label: t("common.delete"),
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

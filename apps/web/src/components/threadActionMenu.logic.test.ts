import { describe, expect, it } from "vite-plus/test";
import { translateWebMessage } from "../i18n/messages";

import {
  buildDraftActionMenuItems,
  buildThreadActionMenuItems,
  type ThreadActionMenuState,
} from "./threadActionMenu.logic";

const english: Parameters<typeof buildThreadActionMenuItems>[1] = (key, values) =>
  translateWebMessage("en", key, values);
const chinese: Parameters<typeof buildThreadActionMenuItems>[1] = (key, values) =>
  translateWebMessage("zh-CN", key, values);

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it("localizes guest sharing without changing its capability gate", () => {
    const translate = (
      key: Parameters<typeof translateWebMessage>[1],
      values?: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage("zh-CN", key, values);
    expect(
      buildThreadActionMenuItems(baseState, translate).some((item) => item.id === "share-guest"),
    ).toBe(false);
    const state = { ...baseState, canShareWithGuest: true };
    expect(
      buildThreadActionMenuItems(state, translate).find((item) => item.id === "share-guest")?.label,
    ).toBe("与访客共享");
    expect(
      buildThreadActionMenuItems(state, english).find((item) => item.id === "share-guest")?.label,
    ).toBe("Share with guest");
  });

  it("localizes snooze presets while preserving their formatted wake time", () => {
    const items = buildThreadActionMenuItems(baseState, (key, values) =>
      translateWebMessage("zh-CN", key, values),
    );
    const preset = items
      .find((item) => item.id === "snooze")
      ?.children?.find((item) => item.id === "snooze:hour");
    expect(preset).toMatchObject({ label: "1 小时后", detail: "3:00 PM" });
    const englishItems = buildThreadActionMenuItems(baseState, english);
    expect(
      englishItems
        .find((item) => item.id === "snooze")
        ?.children?.find((item) => item.id === "snooze:hour"),
    ).toMatchObject({ label: "In 1 hour", detail: "3:00 PM" });
  });

  it.each([
    ["after:25", "In 25 minutes", "25 分钟后"],
    ["after:180", "In 3 hours", "3 小时后"],
    ["at:today:18:00", "This evening", "今天晚上"],
    ["at:next-tuesday:09:00", "Next Tuesday", "下个星期二"],
    ["custom", "A custom label", "A custom label"],
  ])("localizes current snooze preset %s without changing its wake time", (id, label, chinese) => {
    const state = { ...baseState, snoozePresets: [{ ...baseState.snoozePresets[0]!, id, label }] };
    const translated = buildThreadActionMenuItems(state, (key, values) =>
      translateWebMessage("zh-CN", key, values),
    );
    expect(
      translated
        .find((item) => item.id === "snooze")
        ?.children?.find((item) => item.id === `snooze:${id}`),
    ).toMatchObject({ label: chinese, detail: "3:00 PM" });
    expect(
      buildThreadActionMenuItems(state, english)
        .find((item) => item.id === "snooze")
        ?.children?.find((item) => item.id === `snooze:${id}`),
    ).toMatchObject({ label, detail: "3:00 PM" });
  });

  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems(
        {
          ...baseState,
          canOperate: false,
          isPinned: reversed,
          isSettled: reversed,
          isSnoozed: reversed,
        },
        english,
      );
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems(
      {
        ...baseState,
        isRunning: true,
        canTurnIntoProject: true,
      },
      english,
    );
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });
});

it.each([false, true])(
  "localizes the complete menu without changing action state (reversed: %s)",
  (reversed) => {
    const state = {
      ...baseState,
      branch: "develop",
      projectFilter: { label: "example-team/example-project", isActive: reversed },
      isPinned: reversed,
      isSettled: reversed,
      isSnoozed: reversed,
      isRegeneratingTitle: reversed,
      autoSettleEnabled: !reversed,
    };
    const en = buildThreadActionMenuItems(state, english);
    const zh = buildThreadActionMenuItems(state, chinese);
    const withoutLabels = (items: typeof en): unknown =>
      items.map(({ label: _label, children, ...item }) => ({
        ...item,
        ...(children ? { children: withoutLabels(children) } : {}),
      }));
    expect(withoutLabels(zh)).toEqual(withoutLabels(en));
    expect(zh.find((item) => item.id === "new-thread-on-branch")?.label).toBe(
      "在 develop 分支新建任务",
    );
    expect(zh.find((item) => item.id === "project-settings")?.label).toBe("项目设置");
    expect(zh.find((item) => item.id === "filter-by-project")?.label).toBe(
      reversed ? "显示所有项目" : "按 example-team/example-project 筛选",
    );
    for (const item of zh) {
      expect(item.label).not.toBe(en.find((entry) => entry.id === item.id)?.label);
      for (const child of item.children ?? []) {
        expect(child.label).not.toBe(
          en.find((entry) => entry.id === item.id)?.children?.find((entry) => entry.id === child.id)
            ?.label,
        );
      }
    }
  },
);

it.each([false, true])(
  "localizes draft actions while keeping unavailable paths and projects hidden (%s)",
  (available) => {
    const options = { hasPath: available, hasBranch: available, hasProject: available };
    const en = buildDraftActionMenuItems(options, english);
    const zh = buildDraftActionMenuItems(options, chinese);
    expect(zh.map(({ id, disabled }) => ({ id, disabled }))).toEqual(
      en.map(({ id, disabled }) => ({ id, disabled })),
    );
    expect(zh.find((item) => item.id === "copy")?.label).toBe("复制");
    expect(zh.find((item) => item.id === "copy")?.children?.map((item) => item.label)).toEqual(
      available ? ["路径", "分支"] : [],
    );
    expect(zh.find((item) => item.id === "discard")?.label).toBe("丢弃草稿");
    expect(zh.find((item) => item.id === "project-settings")?.label).toBe(
      available ? "项目设置" : undefined,
    );
  },
);

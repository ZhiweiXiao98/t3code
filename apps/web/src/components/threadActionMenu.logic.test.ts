import { describe, expect, it } from "vite-plus/test";
import { translateWebMessage } from "../i18n/messages";

import { buildThreadActionMenuItems, type ThreadActionMenuState } from "./threadActionMenu.logic";

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
    expect(buildThreadActionMenuItems(state).find((item) => item.id === "share-guest")?.label).toBe(
      "Share with guest",
    );
  });

  it("localizes snooze presets while preserving their formatted wake time", () => {
    const items = buildThreadActionMenuItems(baseState, (key, values) =>
      translateWebMessage("zh-CN", key, values),
    );
    const preset = items
      .find((item) => item.id === "snooze")
      ?.children?.find((item) => item.id === "snooze:hour");
    expect(preset?.label).toBe("1 小时后 (3:00 PM)");
    const englishItems = buildThreadActionMenuItems(baseState);
    expect(
      englishItems
        .find((item) => item.id === "snooze")
        ?.children?.find((item) => item.id === "snooze:hour")?.label,
    ).toBe("In 1 hour (3:00 PM)");
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
        ?.children?.find((item) => item.id === `snooze:${id}`)?.label,
    ).toBe(`${chinese} (3:00 PM)`);
    expect(
      buildThreadActionMenuItems(state)
        .find((item) => item.id === "snooze")
        ?.children?.find((item) => item.id === `snooze:${id}`)?.label,
    ).toBe(`${label} (3:00 PM)`);
  });

  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
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
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });
});

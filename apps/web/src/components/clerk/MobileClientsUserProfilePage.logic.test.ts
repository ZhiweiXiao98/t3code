import type { RelayClientDeviceRecord } from "@t3tools/contracts/relay";
import { describe, expect, it } from "vite-plus/test";
import {
  mobileClientNotificationDetail,
  mobileClientPlatformLabel,
  mobileClientUpdatedAtLabel,
} from "./MobileClientsUserProfilePage.logic";

const device: RelayClientDeviceRecord = {
  deviceId: "my-device",
  label: "Review",
  platform: "ios",
  iosMajorVersion: 18,
  appVersion: "1.2.3",
  updatedAt: "2026-11-04T06:00:00.000Z",
  notifications: {
    enabled: true,
    notifyOnApproval: false,
    notifyOnInput: false,
    notifyOnCompletion: false,
    notifyOnFailure: false,
  },
  liveActivities: { enabled: true },
};

describe("mobile client localized details", () => {
  it("preserves every notification toggle combination while localizing display labels", () => {
    const preferences = [
      "notifyOnApproval",
      "notifyOnInput",
      "notifyOnCompletion",
      "notifyOnFailure",
    ] as const;
    const english = ["approvals", "input requests", "completions", "failures"];
    const chinese = ["审批", "输入请求", "完成", "失败"];
    for (const enabled of [true, false]) {
      for (let bits = 0; bits < 16; bits += 1) {
        const notifications = { ...device.notifications, enabled };
        for (let index = 0; index < preferences.length; index += 1)
          notifications[preferences[index]!] = Boolean(bits & (1 << index));
        const sample = { ...device, notifications };
        const enTypes = english.filter((_, index) => bits & (1 << index));
        const zhTypes = chinese.filter((_, index) => bits & (1 << index));
        const en = !enabled
          ? "Push notifications are disabled on this device."
          : bits
            ? `Alerts enabled for ${enTypes.join(", ")}.`
            : "Push notifications are enabled, but no alert types are selected.";
        const zh = !enabled
          ? "此设备已关闭推送通知。"
          : bits
            ? `已开启以下提醒：${zhTypes.join("、")}。`
            : "已开启推送通知，但尚未选择提醒类型。";
        expect(mobileClientNotificationDetail(sample)).toBe(en);
        expect(mobileClientNotificationDetail(sample, "en")).toBe(en);
        expect(mobileClientNotificationDetail(sample, "zh-CN")).toBe(zh);
      }
    }
  });
  it("preserves platforms and version strings", () => {
    expect(mobileClientPlatformLabel(device)).toBe("iOS 18 · T3 Code 1.2.3");
    expect(mobileClientPlatformLabel({ ...device, iosMajorVersion: null, appVersion: null })).toBe(
      "iOS",
    );
    expect(mobileClientPlatformLabel({ ...device, platform: "android" })).toBe(
      "Android · T3 Code 1.2.3",
    );
  });
  it("uses the app locale for valid dates and localizes unavailable dates", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      const date = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(device.updatedAt));
      expect(mobileClientUpdatedAtLabel(device.updatedAt, locale)).toBe(
        locale === "en" ? `Updated ${date}` : `更新于 ${date}`,
      );
    }
    const defaultDate = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(device.updatedAt));
    expect(mobileClientUpdatedAtLabel(device.updatedAt)).toBe(`Updated ${defaultDate}`);
    expect(mobileClientUpdatedAtLabel("invalid")).toBe("Update time unavailable");
    expect(mobileClientUpdatedAtLabel("invalid", "zh-CN")).toBe("更新时间不可用");
  });
});

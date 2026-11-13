import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  platform: { OS: "android" },
  channel: vi.fn(() => Promise.resolve()),
  existing: vi.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  request: vi.fn(() => Promise.resolve({ granted: true, canAskAgain: true })),
}));
vi.mock("react-native", () => ({ Platform: fixture.platform }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: fixture.channel,
  getPermissionsAsync: fixture.existing,
  requestPermissionsAsync: fixture.request,
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, fixture.locale),
  };
});

import { requestAgentNotificationPermission } from "./notificationPermissions";

function setup(locale: "en" | "zh-CN", platform: string) {
  fixture.locale = locale;
  fixture.platform.OS = platform;
  fixture.channel.mockReset().mockResolvedValue(undefined);
  fixture.existing.mockReset().mockResolvedValue({ granted: false, canAskAgain: true });
  fixture.request.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
}

it.effect(
  "localizes only the Android channel name and preserves permission gates and requested options",
  () =>
    Effect.gen(function* () {
      for (const locale of ["en", "zh-CN"] as const) {
        for (const platform of ["android", "ios", "web"]) {
          setup(locale, platform);
          expect(yield* requestAgentNotificationPermission).toEqual({
            type: platform === "web" ? "unsupported" : "granted",
          });
          if (platform === "android") {
            expect(fixture.channel).toHaveBeenCalledExactlyOnceWith("agent-alerts", {
              name: locale === "zh-CN" ? "智能体提醒" : "Agent alerts",
              importance: 4,
            });
          } else {
            expect(fixture.channel).not.toHaveBeenCalled();
          }
          if (platform === "web") {
            expect(fixture.existing).not.toHaveBeenCalled();
            expect(fixture.request).not.toHaveBeenCalled();
          } else {
            expect(fixture.request).toHaveBeenCalledExactlyOnceWith({
              ios: { allowAlert: true, allowBadge: true, allowSound: true },
            });
          }
        }
        for (const existing of [
          { granted: true, canAskAgain: true },
          { granted: false, canAskAgain: false },
        ]) {
          setup(locale, "android");
          fixture.existing.mockResolvedValue(existing);
          expect(yield* requestAgentNotificationPermission).toEqual(
            existing.granted ? { type: "granted" } : { type: "denied", canAskAgain: false },
          );
          expect(fixture.request).not.toHaveBeenCalled();
        }
        setup(locale, "android");
        fixture.request.mockResolvedValue({ granted: false, canAskAgain: true });
        expect(yield* requestAgentNotificationPermission).toEqual({
          type: "denied",
          canAskAgain: true,
        });
      }
    }),
);

it.effect(
  "localizes owned permission failures while preserving the external cause and stopping later steps",
  () =>
    Effect.gen(function* () {
      for (const locale of ["en", "zh-CN"] as const) {
        for (const step of ["channel", "existing", "request"] as const) {
          setup(locale, "android");
          const cause = new Error("Settings");
          fixture[step].mockRejectedValue(cause);
          const error = yield* Effect.flip(requestAgentNotificationPermission);
          expect(error._tag).toBe(
            step === "existing"
              ? "NotificationPermissionReadError"
              : "NotificationPermissionRequestError",
          );
          expect(error.message).toBe(
            step === "existing"
              ? locale === "zh-CN"
                ? "无法读取通知权限。"
                : "Failed to read notification permissions."
              : locale === "zh-CN"
                ? "无法请求通知权限。"
                : "Failed to request notification permissions.",
          );
          expect(error.cause).toBe(cause);
          expect(cause.message).toBe("Settings");
          if (step === "channel") expect(fixture.existing).not.toHaveBeenCalled();
          if (step !== "request") expect(fixture.request).not.toHaveBeenCalled();
        }
      }
    }),
);

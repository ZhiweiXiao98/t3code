import { translateWebMessage, translateWebSource } from "~/i18n/messages";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import type { RelayClientDeviceRecord } from "@t3tools/contracts/relay";

const mobileClientUpdatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const mobileClientLocaleFormatters = {
  en: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }),
  "zh-CN": new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }),
};

const NOTIFICATION_PREFERENCES = [
  ["notifyOnApproval", "approvals"],
  ["notifyOnInput", "input requests"],
  ["notifyOnCompletion", "completions"],
  ["notifyOnFailure", "failures"],
] as const satisfies ReadonlyArray<
  readonly [keyof RelayClientDeviceRecord["notifications"], string]
>;

export function mobileClientPlatformLabel(device: RelayClientDeviceRecord): string {
  const platform =
    device.platform === "android"
      ? "Android"
      : device.iosMajorVersion === null
        ? "iOS"
        : `iOS ${device.iosMajorVersion}`;
  return `${platform}${device.appVersion ? ` · T3 Code ${device.appVersion}` : ""}`;
}

export function mobileClientNotificationDetail(
  device: RelayClientDeviceRecord,
  locale: ResolvedAppLocale = "en",
): string {
  if (!device.notifications.enabled) {
    return translateWebSource(locale, "Push notifications are disabled on this device.");
  }

  const enabledPreferences = NOTIFICATION_PREFERENCES.flatMap(([preference, label]) =>
    device.notifications[preference] ? [translateWebSource(locale, label)] : [],
  );
  return enabledPreferences.length > 0
    ? translateWebMessage(locale, "mobileClients.alertTypes", {
        types: enabledPreferences.join(locale === "zh-CN" ? "、" : ", "),
      })
    : translateWebSource(
        locale,
        "Push notifications are enabled, but no alert types are selected.",
      );
}

export function mobileClientUpdatedAtLabel(updatedAt: string, locale?: ResolvedAppLocale): string {
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime())
    ? translateWebSource(locale ?? "en", "Update time unavailable")
    : translateWebMessage(locale ?? "en", "mobileClients.updated", {
        date: (locale === undefined
          ? mobileClientUpdatedAtFormatter
          : mobileClientLocaleFormatters[locale]
        ).format(date),
      });
}

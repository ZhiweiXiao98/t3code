import {
  DeviceAvailabilityReasonMessage,
  type DevicePlatformAvailability,
} from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";
import { translateWebMessage, type WebMessageKey } from "./messages";

const isReasonMessage = Schema.is(DeviceAvailabilityReasonMessage);
const keys = {
  "ios-requires-mac": "deviceAvailability.iosRequiresMac",
  "xcode-tools-missing": "deviceAvailability.xcodeToolsMissing",
  "android-sdk-missing": "deviceAvailability.androidSdkMissing",
  "android-platform-tools-missing": "deviceAvailability.androidPlatformToolsMissing",
  "android-emulator-missing": "deviceAvailability.androidEmulatorMissing",
  "android-command-line-tools-legacy": "deviceAvailability.androidCommandLineToolsLegacy",
  "android-command-line-tools-missing": "deviceAvailability.androidCommandLineToolsMissing",
  "ios-devices-missing": "deviceAvailability.simlockIosMissing",
  "android-devices-missing": "deviceAvailability.simlockAndroidMissing",
} as const satisfies Record<DeviceAvailabilityReasonMessage["code"], WebMessageKey>;

export function deviceAvailabilityReason(
  locale: ResolvedAppLocale,
  availability: DevicePlatformAvailability | undefined,
): string | undefined {
  const reason = availability?.reason;
  const message = availability?.reasonMessage;
  if (availability?.available || !isReasonMessage(message)) return reason;
  const platform = message.code.startsWith("android-") ? "android" : "ios";
  if (availability?.platform !== platform) return reason;
  const key = keys[message.code];
  const values = "sdkRoot" in message ? { sdkRoot: message.sdkRoot } : undefined;
  if (reason !== translateWebMessage("en", key, values)) return reason;
  return translateWebMessage(locale, key, values);
}

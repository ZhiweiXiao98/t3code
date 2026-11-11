import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateVoiceSettingsMessage } from "../i18n/voiceSettingsMessages";

export type BrowserMicrophone = Pick<MediaDeviceInfo, "deviceId" | "label"> & {
  readonly fallbackIndex?: number;
};

export function browserMicrophoneLabel(
  device: BrowserMicrophone,
  locale: ResolvedAppLocale,
): string {
  return device.fallbackIndex === undefined
    ? device.label
    : translateVoiceSettingsMessage(locale, "Microphone {number}", {
        number: device.fallbackIndex,
      });
}

export async function listBrowserMicrophones(): Promise<BrowserMicrophone[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map(({ deviceId, label }, index) => ({
      deviceId,
      label: label || `Microphone ${index + 1}`,
      ...(!label ? { fallbackIndex: index + 1 } : {}),
    }));
}

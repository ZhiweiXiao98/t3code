import {
  getClientSettings,
  isClientSettingsHydrated,
  updateClientSettings,
} from "../hooks/useSettings";
import {
  type MicrophoneEntry,
  microphoneOrder,
  preferredMicrophoneId,
  rememberMicrophones,
} from "./microphoneOrder";

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

/** Audio inputs as the browser reports them. Labels stay empty until microphone permission. */
export async function listAudioInputs(): Promise<BrowserMicrophone[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map(({ deviceId, label }) => ({ deviceId, label }));
}

export async function listBrowserMicrophones(): Promise<BrowserMicrophone[]> {
  return (await listAudioInputs()).map(({ deviceId, label }, index) => ({
    deviceId,
    label: label || `Microphone ${index + 1}`,
    ...(!label ? { fallbackIndex: index + 1 } : {}),
  }));
}

/** Applies a change to the saved order. Skipped before hydration so defaults never replace a saved order. */
export function updateMicrophoneOrder(
  change: (
    order: ReadonlyArray<MicrophoneEntry>,
  ) => ReadonlyArray<MicrophoneEntry>,
): ReadonlyArray<MicrophoneEntry> {
  const known = microphoneOrder(getClientSettings());
  if (!isClientSettingsHydrated()) return known;
  const next = change(known);
  if (next !== known)
    void updateClientSettings({ voiceMicrophones: [...next] });
  return next;
}

/** Remembers newly seen microphones and returns the device id to record from, empty for System default. */
export async function chooseRecordingMicrophone(): Promise<string> {
  // Rejects where the browser has no media devices, such as plain HTTP.
  const devices = await listAudioInputs().catch(() => []);
  return preferredMicrophoneId(
    updateMicrophoneOrder((order) => rememberMicrophones(order, devices)),
    devices,
  );
}

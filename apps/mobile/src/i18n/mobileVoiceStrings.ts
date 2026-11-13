import { CLOUD_SPEECH_PROVIDER_NAMES, type CloudSpeechProvider } from "@t3tools/contracts";
import { formatMobileMessage } from "./mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

const VOICE_ERROR_MESSAGES = new Set<string>([
  "The microphone could not start.",
  "The microphone returned incomplete audio.",
  "The microphone stopped supplying audio.",
  "The microphone audio queue did not drain.",
  "Speech recognition fell behind capture.",
  "Voice transcription does not support any of your languages.",
  "On-device voice transcription is not available for this device language.",
  "Not enough storage for on-device dictation. Free device storage and retry.",
  "On-device speech quota reached. Let the device rest or charge it, then retry.",
  "No speech was detected. Speak again and retry dictation.",
  "On-device speech is busy. Wait for it to finish, then retry dictation.",
  "Update Android and its on-device speech services, then retry dictation.",
  "Speech model download failed. Check your network connection and retry.",
  "The speech engine could not process the complete recording. No text was added. Retry dictation.",
  "Speech recognition could not process the complete recording. No text was added. Retry dictation.",
  "Voice transcription could not prepare this language. Check Google speech services and try again.",
  "Voice transcription failed.",
  "Voice transcription requires a supported device with iOS 26 or later.",
  "Voice transcription does not support this device language.",
  "Voice transcription could not prepare this language.",
  "Voice transcription is still finishing. Try again shortly.",
  "Voice transcription is not available for this language.",
  "Could not prepare voice transcription.",
  "Could not transcribe this recording.",
  "This draft is no longer available.",
  "Another voice recording is already active.",
  "Voice transcription is not available.",
  "Microphone access is required for voice input.",
  "Could not start voice recording.",
  "Voice recording was interrupted.",
  "Voice input stopped when the app moved to the background.",
  "Could not finish voice recording.",
  "The draft changed while voice input was running. The transcript was not added.",
  "No speech was detected.",
]);

/** Native errors are opaque; translate only the app-owned fallback messages. */
export function localizeMobileVoiceError(
  message: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return VOICE_ERROR_MESSAGES.has(message) ? localizeMobileString(message, locale) : message;
}

/** App-owned disclosure templates keep environment and provider names opaque. */
export function mobileCloudSpeechDisclosure(
  provider: CloudSpeechProvider,
  environment: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return provider === "openrouter"
    ? formatMobileMessage(
        "After you stop, {0} sends the recording to OpenRouter. OpenRouter chooses who runs your model. T3 requests zero data retention; your OpenRouter account may allow safety retention.",
        [environment],
        locale,
      )
    : formatMobileMessage(
        "After you stop, {0} sends your recording and vocabulary hints, including project names, to {1}.",
        [environment, CLOUD_SPEECH_PROVIDER_NAMES[provider]],
        locale,
      );
}

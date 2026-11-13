import { DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS, EnvironmentId } from "@t3tools/contracts";
import { PrimaryConnectionTarget } from "@t3tools/client-runtime/connection";
import { voiceInputErrorSource } from "@t3tools/client-runtime/voice-input";
import { VoiceTranscriptionError } from "@t3tools/client-runtime/voice-input";
import { afterEach, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock(import("./runEnvironmentSpeech"), () => ({ runEnvironmentSpeech: mocks.run }));
import { createBrowserVoiceInputPlatform } from "./browserVoiceInput";
const environmentId = EnvironmentId.make("voice-source");
const target = new PrimaryConnectionTarget({
  environmentId,
  label: "opaque/{label}",
  httpBaseUrl: "https://example.test",
  wsBaseUrl: "wss://example.test",
});
const base = {
  prepared: {
    environmentId,
    label: target.label,
    httpBaseUrl: target.httpBaseUrl,
    socketUrl: target.wsBaseUrl,
    httpAuthorization: null,
    target,
  },
  hasAudioConsent: () => false,
  getTranscriptionOptions: () => DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
  getMicrophoneId: () => "",
  onLevel: () => {},
  onDurationLimit: () => {},
  onText: () => {},
  onError: () => {},
};
afterEach(() => {
  vi.unstubAllGlobals();
  mocks.run.mockReset();
});
it("marks only the two actual browser transcription fallback constructors", async () => {
  const options = { signal: new AbortController().signal };
  const missing = await createBrowserVoiceInputPlatform({ ...base, cloudProvider: "openrouter" })
    .transcriber.prepare(options)
    .catch((error: unknown) => error);
  expect(missing).toHaveProperty("_tag", "VoiceTranscriptionError");
  if (!(missing instanceof Error)) throw new Error("Expected preparation failure");
  expect(voiceInputErrorSource(missing, missing.message)).toBe("browser-openrouter-model");
  expect(mocks.run).not.toHaveBeenCalled();
  mocks.run.mockResolvedValueOnce(undefined);
  const prepared = await createBrowserVoiceInputPlatform({
    ...base,
    cloudProvider: "openai",
  }).transcriber.prepare(options);
  const cause = new Error("external/{path}/$&");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
  const failed = await prepared.transcribe("blob:opaque", options).catch((error: unknown) => error);
  if (!(failed instanceof Error)) throw new Error("Expected transcription failure");
  expect(voiceInputErrorSource(failed, failed.message)).toBe("browser-transcription-destination");
  expect(failed.cause).toBe(cause);
  const raw = new VoiceTranscriptionError({ code: "unavailable", message: missing.message });
  expect(voiceInputErrorSource(raw, raw.message)).toBeUndefined();
  expect(voiceInputErrorSource(new Error(failed.message), failed.message)).toBeUndefined();
});

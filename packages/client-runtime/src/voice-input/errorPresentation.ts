/** Local-only metadata: copying an Error or receiving the same server text does not copy origin. */
export type VoiceInputErrorSource =
  | "browser-transcription-destination"
  | "browser-openrouter-model";
const sources = new WeakMap<Error, VoiceInputErrorSource>();
export function markVoiceInputError<E extends Error>(error: E, source: VoiceInputErrorSource): E {
  sources.set(error, source);
  return error;
}
export function voiceInputErrorSource(
  error: unknown,
  displayedMessage: string,
): VoiceInputErrorSource | undefined {
  return error instanceof Error && error.message === displayedMessage
    ? sources.get(error)
    : undefined;
}

import {
  VoiceInputController,
  VoiceTranscriptionError,
  markVoiceInputError,
  type VoiceInputErrorSource,
} from "@t3tools/client-runtime/voice-input";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { VoiceInputErrorPill } from "./VoiceInputErrorPill";

it.each([
  [
    "browser-openrouter-model",
    "Choose an OpenRouter model in Settings → Voice.",
    "请在设置 → 语音中选择 OpenRouter 模型。",
  ],
  [
    "browser-transcription-destination",
    "Voice transcription failed. Check the destination in Settings → Voice.",
    "语音转写失败。请在设置 → 语音中检查目标。",
  ],
] satisfies ReadonlyArray<readonly [VoiceInputErrorSource, string, string]>)(
  "renders cached %s controller errors in the current locale without retrying",
  async (source, english, chinese) => {
    const prepare = vi
      .fn()
      .mockRejectedValue(
        markVoiceInputError(
          new VoiceTranscriptionError({ code: "unavailable", message: english }),
          source,
        ),
      );
    const controller = new VoiceInputController({
      recorder: {
        uri: null,
        prepareToRecordAsync: async () => {},
        record: () => {},
        stop: async () => {},
      },
      getTranscriber: () => ({ prepare }),
      requestPermission: async () => ({ granted: true, canAskAgain: true }),
      configureRecording: async () => {},
      releaseRecording: async () => {},
      deleteRecording: () => {},
      readDraft: () => ({
        ownerKey: source,
        text: "opaque/{draft}/$&",
        selection: { start: 0, end: 0 },
        revision: 1,
      }),
      commitDraft: () => {},
      onStateChange: () => {},
    });
    await controller.start();
    const retry = vi.fn();
    const dismiss = vi.fn(() => controller.cancel());
    const surface = (locale: "en" | "zh-CN", raw = false) => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <VoiceInputErrorPill
          error={controller.currentState.error}
          errorAction="retry"
          {...(!raw && controller.currentState.errorSource
            ? { errorSource: controller.currentState.errorSource }
            : {})}
          onRetry={retry}
          onDismiss={dismiss}
        />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await expect.element(screen.getByRole("status")).toHaveAttribute("aria-label", english);
    await userEvent.hover(screen.getByRole("status"));
    await expectOpenTooltip(english);
    await screen.rerender(surface("zh-CN"));
    await expect.element(screen.getByRole("status")).toHaveAttribute("aria-label", chinese);
    await expectOpenTooltip(chinese);
    await screen.rerender(surface("zh-CN", true));
    await expect.element(screen.getByRole("status")).toHaveAttribute("aria-label", english);
    await screen.rerender(surface("en"));
    expect(prepare).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "Dismiss voice input error" }).click();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(controller.currentState.error).toBeNull();
    expect(controller.currentState.errorSource).toBeUndefined();
  },
);

async function expectOpenTooltip(text: string) {
  await expect
    .poll(() => document.querySelector('[data-slot="tooltip-popup"][data-open]')?.textContent)
    .toBe(text);
  const popup = document.querySelector<HTMLElement>('[data-slot="tooltip-popup"][data-open]');
  if (!popup) throw new Error("Expected the open tooltip popup");
  await expect.element(popup).toBeVisible();
}

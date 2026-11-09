import { DEFAULT_APP_LOCALE_PREFERENCE } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import { resolvePreviewPromptMessages } from "./PreviewPromptMessages.ts";

export const makePreviewPromptMessages = Effect.gen(function* () {
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const electronApp = yield* ElectronApp.ElectronApp;
  return Effect.gen(function* () {
    const settings = yield* clientSettings.get.pipe(Effect.orElseSucceed(() => Option.none()));
    const preference = Option.match(settings, {
      onNone: () => DEFAULT_APP_LOCALE_PREFERENCE,
      onSome: (value) => value.appLocale,
    });
    if (preference !== "system") return resolvePreviewPromptMessages(preference, []);
    const systemLocale = yield* electronApp.systemLocale.pipe(
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterrupts(cause),
        () => Effect.succeed("en"),
      ),
    );
    return resolvePreviewPromptMessages(preference, [systemLocale]);
  });
});

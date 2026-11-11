import * as Effect from "effect/Effect";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import { readDesktopLocale } from "../settings/DesktopLocale.ts";
import { resolvePreviewPromptMessages } from "./PreviewPromptMessages.ts";

export const makePreviewPromptMessages = Effect.gen(function* () {
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const electronApp = yield* ElectronApp.ElectronApp;
  return readDesktopLocale(clientSettings.get, electronApp.systemLocale).pipe(
    Effect.map((locale) => resolvePreviewPromptMessages(locale, [])),
  );
});

import { DEFAULT_APP_LOCALE_PREFERENCE } from "@t3tools/contracts";
import { resolveAppLocale } from "@t3tools/shared/appLocale";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { DesktopClientSettings } from "./DesktopClientSettings.ts";

export const readDesktopLocale = Effect.fn("desktop.locale.read")(function* (
  getSettings: DesktopClientSettings["Service"]["get"],
  systemLocale: Effect.Effect<string>,
) {
  const settings = yield* getSettings.pipe(
    Effect.orElseSucceed(() => Option.none()),
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      () => Effect.succeedNone,
    ),
  );
  const preference = Option.match(settings, {
    onNone: () => DEFAULT_APP_LOCALE_PREFERENCE,
    onSome: (value) => value.appLocale,
  });
  if (preference !== "system") return resolveAppLocale(preference, []);
  const locale = yield* systemLocale.pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      () => Effect.succeed("en"),
    ),
  );
  return resolveAppLocale(preference, [locale]);
});

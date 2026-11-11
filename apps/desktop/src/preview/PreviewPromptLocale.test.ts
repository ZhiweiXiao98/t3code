import { assert, describe, it } from "@effect/vitest";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { vi } from "vite-plus/test";

vi.mock("electron", () => ({ app: {} }));

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import { makePreviewPromptMessages } from "./PreviewPromptLocale.ts";

const withLocaleServices = (
  get: DesktopClientSettings.DesktopClientSettings["Service"]["get"],
  systemLocale: Effect.Effect<string>,
) =>
  Effect.provide(
    Layer.mergeAll(
      Layer.mock(DesktopClientSettings.DesktopClientSettings)({ get }),
      Layer.mock(ElectronApp.ElectronApp)({ systemLocale }),
    ),
  );

describe("PreviewPromptLocale", () => {
  it.effect(
    "reads updated preferences for each prompt without querying the OS for explicit languages",
    () =>
      Effect.gen(function* () {
        const settings = yield* Ref.make(DEFAULT_CLIENT_SETTINGS);
        const getMessages = yield* makePreviewPromptMessages.pipe(
          withLocaleServices(
            Ref.get(settings).pipe(Effect.asSome),
            Effect.die("Explicit languages must not read the OS locale"),
          ),
        );
        for (const [appLocale, cancel] of [
          ["zh-CN", "取消"],
          ["en", "Cancel"],
        ] as const) {
          yield* Ref.set(settings, { ...DEFAULT_CLIENT_SETTINGS, appLocale });
          assert.strictEqual((yield* getMessages).cancel, cancel);
        }
      }),
  );

  it.effect("uses the OS locale when settings are absent or cannot be read", () =>
    Effect.gen(function* () {
      const unavailable = new DesktopClientSettings.DesktopClientSettingsReadError({
        operation: "read-file",
        path: "/test/client-settings.json",
        cause: new Error("unavailable"),
      });
      for (const get of [
        Effect.succeedNone,
        Effect.fail(unavailable),
        Effect.die("settings unavailable"),
      ]) {
        const getMessages = yield* makePreviewPromptMessages.pipe(
          withLocaleServices(get, Effect.succeed("zh-SG")),
        );
        assert.strictEqual((yield* getMessages).cancel, "取消");
      }
    }),
  );

  it.effect("uses English if the system locale throws", () =>
    Effect.gen(function* () {
      const getMessages = yield* makePreviewPromptMessages.pipe(
        withLocaleServices(
          Effect.succeedSome({ ...DEFAULT_CLIENT_SETTINGS, appLocale: "system" }),
          Effect.sync(() => {
            throw new Error("OS locale unavailable");
          }),
        ),
      );
      assert.strictEqual((yield* getMessages).cancel, "Cancel");
    }),
  );

  it.effect("propagates interruption from either locale source", () =>
    Effect.gen(function* () {
      for (const [get, systemLocale] of [
        [Effect.interrupt, Effect.succeed("zh-CN")],
        [Effect.succeedNone, Effect.interrupt],
        [
          Effect.succeedNone,
          Effect.failCause(Cause.combine(Cause.die("OS locale failed"), Cause.interrupt())),
        ],
      ] as const) {
        const getMessages = yield* makePreviewPromptMessages.pipe(
          withLocaleServices(get, systemLocale),
        );
        const exit = yield* Effect.exit(getMessages);
        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) assert.isTrue(Cause.hasInterrupts(exit.cause));
      }
    }),
  );
});

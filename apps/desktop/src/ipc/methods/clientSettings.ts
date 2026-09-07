import { ClientSettingsSchema, DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as DesktopClientSettings from "../../settings/DesktopClientSettings.ts";
import * as DesktopApplicationMenu from "../../window/DesktopApplicationMenu.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const getClientSettings = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_CLIENT_SETTINGS_CHANNEL,
  payload: Schema.Void,
  result: Schema.NullOr(ClientSettingsSchema),
  handler: Effect.fn("desktop.ipc.clientSettings.get")(function* () {
    const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
    return Option.getOrNull(yield* clientSettings.get);
  }),
});

export const setClientSettings = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_CLIENT_SETTINGS_CHANNEL,
  payload: ClientSettingsSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.clientSettings.set")(function* (settings) {
    const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
    const previousSettings = yield* clientSettings.get;
    yield* clientSettings.set(settings);
    const previousAppLocale = Option.match(previousSettings, {
      onNone: () => DEFAULT_CLIENT_SETTINGS.appLocale,
      onSome: (value) => value.appLocale,
    });
    if (previousAppLocale !== settings.appLocale) {
      const applicationMenu = yield* DesktopApplicationMenu.DesktopApplicationMenu;
      yield* applicationMenu.configure;
    }
  }),
});

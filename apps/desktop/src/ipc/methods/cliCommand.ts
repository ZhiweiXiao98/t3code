import * as DesktopClientSettings from "../../settings/DesktopClientSettings.ts";
import * as ElectronApp from "../../electron/ElectronApp.ts";
import { readDesktopLocale } from "../../settings/DesktopLocale.ts";
import { DesktopCliCommandStateSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopCliCommand from "../../app/DesktopCliCommand.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const getCliCommandState = makeIpcMethod({
  channel: IpcChannels.CLI_COMMAND_GET_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopCliCommandStateSchema,
  handler: Effect.fn("desktop.ipc.cliCommand.getState")(function* () {
    return yield* (yield* DesktopCliCommand.DesktopCliCommand).state;
  }),
});

export const installCliCommand = makeIpcMethod({
  channel: IpcChannels.CLI_COMMAND_INSTALL_CHANNEL,
  payload: Schema.Void,
  result: DesktopCliCommandStateSchema,
  handler: Effect.fn("desktop.ipc.cliCommand.install")(function* () {
    return yield* (yield* DesktopCliCommand.DesktopCliCommand).install.pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          const settings = yield* DesktopClientSettings.DesktopClientSettings;
          const app = yield* ElectronApp.ElectronApp;
          const locale = yield* readDesktopLocale(settings.get, app.systemLocale);
          return yield* DesktopCliCommand.localizeDesktopCliCommandError(error, locale);
        }),
      ),
    );
  }),
});

export const uninstallCliCommand = makeIpcMethod({
  channel: IpcChannels.CLI_COMMAND_UNINSTALL_CHANNEL,
  payload: Schema.Void,
  result: DesktopCliCommandStateSchema,
  handler: Effect.fn("desktop.ipc.cliCommand.uninstall")(function* () {
    return yield* (yield* DesktopCliCommand.DesktopCliCommand).uninstall.pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          const settings = yield* DesktopClientSettings.DesktopClientSettings;
          const app = yield* ElectronApp.ElectronApp;
          const locale = yield* readDesktopLocale(settings.get, app.systemLocale);
          return yield* DesktopCliCommand.localizeDesktopCliCommandError(error, locale);
        }),
      ),
    );
  }),
});

export const addCliCommandToPath = makeIpcMethod({
  channel: IpcChannels.CLI_COMMAND_ADD_TO_PATH_CHANNEL,
  payload: Schema.Void,
  result: DesktopCliCommandStateSchema,
  handler: Effect.fn("desktop.ipc.cliCommand.addToPath")(function* () {
    return yield* (yield* DesktopCliCommand.DesktopCliCommand).addToPath.pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          const settings = yield* DesktopClientSettings.DesktopClientSettings;
          const app = yield* ElectronApp.ElectronApp;
          const locale = yield* readDesktopLocale(settings.get, app.systemLocale);
          return yield* DesktopCliCommand.localizeDesktopCliCommandError(error, locale);
        }),
      ),
    );
  }),
});

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as Electron from "electron";

import { DEFAULT_APP_LOCALE_PREFERENCE } from "@t3tools/contracts";

import * as DesktopAssets from "../app/DesktopAssets.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { makeComponentLogger } from "../app/DesktopObservability.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import { resolveDesktopApplicationMenuMessages } from "./DesktopApplicationMenuMessages.ts";

export interface DesktopTrayCallbacks {
  readonly open: () => void;
  readonly quit: () => void;
}

export class DesktopTray extends Context.Service<
  DesktopTray,
  {
    readonly ensure: (callbacks: DesktopTrayCallbacks) => Effect.Effect<boolean>;
    readonly markQuitRequested: () => void;
    readonly shouldHideOnClose: () => boolean;
  }
>()("@t3tools/desktop/window/DesktopTray") {}

const { logWarning: logTrayWarning } = makeComponentLogger("desktop-tray");

export const make = Effect.gen(function* () {
  const assets = yield* DesktopAssets.DesktopAssets;
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const electronApp = yield* ElectronApp.ElectronApp;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  let tray: Electron.Tray | undefined;
  let quitRequested = false;
  let currentCallbacks: DesktopTrayCallbacks | undefined;

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      tray?.destroy();
      tray = undefined;
    }),
  );

  const open = () => currentCallbacks?.open();
  const quit = () => currentCallbacks?.quit();

  return DesktopTray.of({
    ensure: (callbacks) =>
      Effect.gen(function* () {
        currentCallbacks = callbacks;
        if (environment.platform !== "win32" || !environment.isPackaged) {
          return false;
        }
        if (tray !== undefined) {
          return true;
        }

        const iconPaths = yield* assets.iconPaths;
        const iconPath =
          Option.getOrUndefined(iconPaths.ico) ?? Option.getOrUndefined(iconPaths.png);
        if (iconPath === undefined) {
          yield* logTrayWarning("Windows tray icon is unavailable");
          return false;
        }

        const settings = yield* clientSettings.get;
        const systemLocale = yield* electronApp.systemLocale;
        const appName = yield* electronApp.name;
        const appLocale = Option.match(settings, {
          onNone: () => DEFAULT_APP_LOCALE_PREFERENCE,
          onSome: (value) => value.appLocale,
        });
        const messages = resolveDesktopApplicationMenuMessages(appLocale, [systemLocale]);

        return yield* Effect.sync(() => {
          let nextTray: Electron.Tray | undefined;
          try {
            nextTray = new Electron.Tray(iconPath);
            nextTray.setToolTip(appName);
            nextTray.setContextMenu(
              Electron.Menu.buildFromTemplate([
                { label: messages.open(appName), click: open },
                { type: "separator" },
                { label: messages.quit(appName), click: quit },
              ]),
            );
            nextTray.on("click", open);
            nextTray.on("double-click", open);
            tray = nextTray;
            return true;
          } catch (cause) {
            nextTray?.destroy();
            throw cause;
          }
        }).pipe(
          Effect.catchCause((cause) =>
            logTrayWarning("failed to create Windows tray icon", { cause }).pipe(Effect.as(false)),
          ),
        );
      }).pipe(Effect.withSpan("desktop.tray.ensure")),
    markQuitRequested: () => {
      quitRequested = true;
    },
    shouldHideOnClose: () => tray !== undefined && !quitRequested,
  });
});

export const layer = Layer.effect(DesktopTray, make);

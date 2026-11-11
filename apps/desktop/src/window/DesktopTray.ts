import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Electron from "electron";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { makeComponentLogger } from "../app/DesktopObservability.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import { readDesktopLocale } from "../settings/DesktopLocale.ts";
import { resolveDesktopApplicationMenuMessages } from "./DesktopApplicationMenuMessages.ts";

export interface DesktopTrayCallbacks {
  readonly open: () => void;
  readonly quit: () => void;
}

export class DesktopTray extends Context.Service<
  DesktopTray,
  {
    readonly ensure: (callbacks: DesktopTrayCallbacks) => Effect.Effect<boolean>;
    readonly refresh: Effect.Effect<void>;
    readonly markQuitRequested: () => void;
    readonly shouldHideOnClose: () => boolean;
  }
>()("@t3tools/desktop/window/DesktopTray") {}

const { logWarning: logTrayWarning } = makeComponentLogger("desktop-tray");

export const make = Effect.gen(function* () {
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
  const contextMenu = readDesktopLocale(clientSettings.get, electronApp.systemLocale).pipe(
    Effect.map((locale) => {
      const messages = resolveDesktopApplicationMenuMessages(locale, []);
      return Electron.Menu.buildFromTemplate([
        { label: messages.open(environment.displayName), click: open },
        { type: "separator" },
        { label: messages.quit(environment.displayName), click: quit },
      ]);
    }),
  );
  const refresh = Effect.gen(function* () {
    if (tray === undefined) return;
    const menu = yield* contextMenu;
    tray?.setContextMenu(menu);
  }).pipe(
    Effect.catchCause((cause) => logTrayWarning("failed to refresh Windows tray menu", { cause })),
  );

  return DesktopTray.of({
    ensure: Effect.fn("desktop.tray.ensure")(function* (callbacks: DesktopTrayCallbacks) {
      currentCallbacks = callbacks;
      if (environment.platform !== "win32" || !environment.isPackaged) {
        return false;
      }
      if (tray !== undefined) {
        return true;
      }

      const iconPath = environment.path.join(environment.resourcesPath, "icon.ico");

      return yield* Effect.gen(function* () {
        const menu = yield* contextMenu;
        return yield* Effect.sync(() => {
          let nextTray: Electron.Tray | undefined;
          try {
            nextTray = new Electron.Tray(iconPath);
            nextTray.setToolTip(environment.displayName);
            nextTray.setContextMenu(menu);
            nextTray.on("click", open);
            nextTray.on("double-click", open);
            tray = nextTray;
            return true;
          } catch (cause) {
            nextTray?.destroy();
            throw cause;
          }
        });
      }).pipe(
        Effect.catchCause((cause) =>
          logTrayWarning("failed to create Windows tray icon", { cause }).pipe(Effect.as(false)),
        ),
      );
    }),
    refresh,
    markQuitRequested: () => {
      quitRequested = true;
    },
    shouldHideOnClose: () => tray !== undefined && !quitRequested,
  });
});

export const layer = Layer.effect(DesktopTray, make);

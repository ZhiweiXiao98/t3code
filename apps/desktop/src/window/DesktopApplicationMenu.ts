import { DEFAULT_APP_LOCALE_PREFERENCE } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type * as Electron from "electron";

import { makeComponentLogger } from "../app/DesktopObservability.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopUpdates from "../updates/DesktopUpdates.ts";
import {
  resolveDesktopApplicationMenuMessages,
  type DesktopApplicationMenuMessages,
} from "./DesktopApplicationMenuMessages.ts";
import * as DesktopWindow from "./DesktopWindow.ts";

export class DesktopApplicationMenuActionError extends Schema.TaggedErrorClass<DesktopApplicationMenuActionError>()(
  "DesktopApplicationMenuActionError",
  {
    action: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Desktop menu action "${this.action}" failed.`;
  }
}

export class DesktopApplicationMenu extends Context.Service<
  DesktopApplicationMenu,
  {
    readonly configure: Effect.Effect<void>;
  }
>()("@t3tools/desktop/window/DesktopApplicationMenu") {}

type DesktopApplicationMenuRuntimeServices =
  | DesktopUpdates.DesktopUpdates
  | DesktopWindow.DesktopWindow
  | ElectronDialog.ElectronDialog;

const { logInfo: logUpdaterInfo } = makeComponentLogger("desktop-updater");

const { logError: logMenuError } = makeComponentLogger("desktop-menu");

const dispatchMenuAction = Effect.fn("desktop.menu.dispatchMenuAction")(function* (
  action: string,
): Effect.fn.Return<void, DesktopWindow.DesktopWindowError, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.dispatchMenuAction(action);
});

const zoomMainWindow = Effect.fn("desktop.menu.zoomMainWindow")(function* (
  direction: DesktopWindow.MainWindowZoomDirection,
): Effect.fn.Return<void, never, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.zoomMain(direction);
});

const checkForUpdatesFromMenu = (messages: DesktopApplicationMenuMessages) =>
  Effect.gen(function* () {
    const updates = yield* DesktopUpdates.DesktopUpdates;
    const electronDialog = yield* ElectronDialog.ElectronDialog;
    const result = yield* updates.check("menu");
    const updateState = result.state;

    if (updateState.status === "up-to-date") {
      yield* electronDialog.showMessageBox({
        type: "info",
        title: messages.upToDateTitle,
        message: messages.upToDateMessage(updateState.currentVersion),
        buttons: [messages.ok],
      });
    } else if (updateState.status === "error") {
      yield* electronDialog.showMessageBox({
        type: "warning",
        title: messages.updateCheckFailedTitle,
        message: messages.updateCheckFailedMessage,
        detail: updateState.message ?? messages.unknownUpdateError,
        buttons: [messages.ok],
      });
    }
  }).pipe(Effect.withSpan("desktop.menu.checkForUpdates"));

const handleCheckForUpdatesMenuClick = (messages: DesktopApplicationMenuMessages) =>
  Effect.gen(function* () {
    const updates = yield* DesktopUpdates.DesktopUpdates;
    const electronDialog = yield* ElectronDialog.ElectronDialog;
    const disabledReason = yield* updates.disabledReason;
    if (Option.isSome(disabledReason)) {
      yield* logUpdaterInfo("manual update check requested, but updates are disabled", {
        disabledReason: disabledReason.value,
      });
      yield* electronDialog.showMessageBox({
        type: "info",
        title: messages.updatesUnavailableTitle,
        message: messages.updatesUnavailableMessage,
        detail: disabledReason.value,
        buttons: [messages.ok],
      });
      return;
    }

    const desktopWindow = yield* DesktopWindow.DesktopWindow;
    yield* desktopWindow.ensureMain;
    yield* checkForUpdatesFromMenu(messages);
  }).pipe(Effect.withSpan("desktop.menu.handleCheckForUpdatesClick"));

export const make = Effect.gen(function* () {
  const electronApp = yield* ElectronApp.ElectronApp;
  const electronMenu = yield* ElectronMenu.ElectronMenu;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const appName = yield* electronApp.name;
  const context = yield* Effect.context<DesktopApplicationMenuRuntimeServices>();
  const runPromise = Effect.runPromiseWith(context);

  const runMenuEffect = <E>(
    action: string,
    effect: Effect.Effect<void, E, DesktopApplicationMenuRuntimeServices>,
  ) => {
    void runPromise(
      effect.pipe(
        Effect.annotateLogs({ action }),
        Effect.withSpan("desktop.menu.action"),
        Effect.catchCause((cause) => {
          const error = new DesktopApplicationMenuActionError({ action, cause });
          return logMenuError(error.message, { error });
        }),
      ),
    );
  };

  const configure = Effect.gen(function* () {
    const settings = yield* clientSettings.get;
    const systemLocale = yield* electronApp.systemLocale;
    const appLocale = Option.match(settings, {
      onNone: () => DEFAULT_APP_LOCALE_PREFERENCE,
      onSome: (value) => value.appLocale,
    });
    const messages = resolveDesktopApplicationMenuMessages(appLocale, [systemLocale]);
    const checkForUpdatesClick = () => {
      runMenuEffect("check-for-updates", handleCheckForUpdatesMenuClick(messages));
    };
    const settingsClick = () => {
      runMenuEffect("open-settings", dispatchMenuAction("open-settings"));
    };
    const zoomClick = (direction: DesktopWindow.MainWindowZoomDirection) => () => {
      runMenuEffect(`zoom-${direction}`, zoomMainWindow(direction));
    };
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (environment.platform === "darwin") {
      template.push({
        label: appName,
        submenu: [
          { role: "about", label: messages.about(appName) },
          {
            label: messages.checkForUpdates,
            click: checkForUpdatesClick,
          },
          { type: "separator" },
          {
            label: messages.settings,
            accelerator: "CmdOrCtrl+,",
            click: settingsClick,
          },
          { type: "separator" },
          { role: "services", label: messages.services },
          { type: "separator" },
          { role: "hide", label: messages.hide(appName) },
          { role: "hideOthers", label: messages.hideOthers },
          { role: "unhide", label: messages.showAll },
          { type: "separator" },
          { role: "quit", label: messages.quit(appName) },
        ],
      });
    }

    template.push(
      {
        label: messages.file,
        submenu: [
          ...(environment.platform === "darwin"
            ? []
            : [
                {
                  label: messages.settings,
                  accelerator: "CmdOrCtrl+,",
                  click: settingsClick,
                },
                { type: "separator" as const },
              ]),
          {
            role: environment.platform === "darwin" ? "close" : "quit",
            label:
              environment.platform === "darwin" ? messages.closeWindow : messages.quit(appName),
          },
        ],
      },
      {
        role: "editMenu",
        label: messages.edit,
        submenu: [
          { role: "undo", label: messages.undo },
          { role: "redo", label: messages.redo },
          { type: "separator" },
          { role: "cut", label: messages.cut },
          { role: "copy", label: messages.copy },
          { role: "paste", label: messages.paste },
          { role: "pasteAndMatchStyle", label: messages.pasteAndMatchStyle },
          { role: "delete", label: messages.delete },
          { type: "separator" },
          { role: "selectAll", label: messages.selectAll },
        ],
      },
      {
        label: messages.view,
        submenu: [
          { role: "reload", label: messages.reload },
          { role: "forceReload", label: messages.forceReload },
          { role: "toggleDevTools", label: messages.toggleDeveloperTools },
          { type: "separator" },
          /*
            Not the zoom roles: those act on the focused webContents, so with
            an embedded preview WebContentsView focused they zoom the guest
            page and the app UI appears stuck. These always zoom the main
            window (see DesktopWindow.zoomMain).
          */
          { label: messages.actualSize, accelerator: "CmdOrCtrl+0", click: zoomClick("reset") },
          { label: messages.zoomIn, accelerator: "CmdOrCtrl+=", click: zoomClick("in") },
          {
            label: messages.zoomIn,
            accelerator: "CmdOrCtrl+Plus",
            visible: false,
            click: zoomClick("in"),
          },
          { label: messages.zoomOut, accelerator: "CmdOrCtrl+-", click: zoomClick("out") },
          { type: "separator" },
          { role: "togglefullscreen", label: messages.toggleFullScreen },
        ],
      },
      {
        role: "windowMenu",
        label: messages.window,
        submenu: [
          { role: "minimize", label: messages.minimize },
          ...(environment.platform === "darwin"
            ? [
                { role: "zoom" as const, label: messages.zoomWindow },
                { type: "separator" as const },
                { role: "front" as const, label: messages.bringAllToFront },
              ]
            : [{ role: "close" as const, label: messages.closeWindow }]),
        ],
      },
      {
        role: "help",
        label: messages.help,
        submenu: [
          {
            label: messages.checkForUpdates,
            click: checkForUpdatesClick,
          },
        ],
      },
    );

    yield* electronMenu.setApplicationMenu(template);
  }).pipe(Effect.withSpan("desktop.menu.configure"));

  return DesktopApplicationMenu.of({
    configure,
  });
});

export const layer = Layer.effect(DesktopApplicationMenu, make);

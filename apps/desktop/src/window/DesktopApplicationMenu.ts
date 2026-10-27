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

export class DesktopApplicationMenuActionError extends Schema.TaggedError<DesktopApplicationMenuActionError>()(
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
  yield* desktopWindow.dispatchMenuAction(action, {
    reveal: action !== "paste-as-text",
  });
});

const zoomMainWindow = Effect.fn("desktop.menu.zoomMainWindow")(function* (
  direction: DesktopWindow.MainWindowZoomDirection,
): Effect.fn.Return<void, never, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.zoomMain(direction);
});

const runMainContentsCommand = Effect.fn("desktop.menu.runMainContentsCommand")(function* (
  command: DesktopWindow.MainWindowContentsCommand,
): Effect.fn.Return<void, never, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.runMainContentsCommand(command);
});

const checkForUpdatesFromMenu = Effect.fn("desktop.menu.checkForUpdates")(function* (
  messages: DesktopApplicationMenuMessages,
) {
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
});

const handleCheckForUpdatesMenuClick = Effect.fn("desktop.menu.handleCheckForUpdatesClick")(
  function* (messages: DesktopApplicationMenuMessages) {
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

    // Activate only once the backend is ready; an early main window can get stuck in auth bootstrap.
    const desktopWindow = yield* DesktopWindow.DesktopWindow;
    yield* desktopWindow.activate;
    yield* checkForUpdatesFromMenu(messages);
  },
);

/** @public */
export const make = Effect.gen(function* () {
  const electronMenu = yield* ElectronMenu.ElectronMenu;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
  const electronApp = yield* ElectronApp.ElectronApp;
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
    const settings = yield* clientSettings.get.pipe(
      Effect.catch((error) =>
        logMenuError("Could not read the desktop language setting.", { error }).pipe(
          Effect.as(Option.none()),
        ),
      ),
    );
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
    // Chromium and the renderer already handle this chord; injecting another paste duplicates text.
    const pasteAsTextClick = (
      _item: Electron.MenuItem,
      _window: Electron.BaseWindow | undefined,
      event: Electron.KeyboardEvent,
    ) => {
      if (event.triggeredByAccelerator === true) return;
      runMenuEffect("paste-as-text", dispatchMenuAction("paste-as-text"));
    };
    const zoomClick = (direction: DesktopWindow.MainWindowZoomDirection) => () => {
      runMenuEffect(`zoom-${direction}`, zoomMainWindow(direction));
    };
    const mainContentsClick = (command: DesktopWindow.MainWindowContentsCommand) => () => {
      runMenuEffect(command, runMainContentsCommand(command));
    };
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (environment.platform === "darwin") {
      template.push({
        label: environment.displayName,
        submenu: [
          { role: "about", label: messages.about(environment.displayName) },
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
          { role: "hide", label: messages.hide(environment.displayName) },
          { role: "hideOthers", label: messages.hideOthers },
          { role: "unhide", label: messages.showAll },
          { type: "separator" },
          { role: "quit", label: messages.quit(environment.displayName) },
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
              environment.platform === "darwin"
                ? messages.closeWindow
                : messages.quit(environment.displayName),
          },
        ],
      },
      {
        label: messages.edit,
        submenu: [
          { role: "undo", label: messages.undo },
          { role: "redo", label: messages.redo },
          { type: "separator" },
          { role: "cut", label: messages.cut },
          { role: "copy", label: messages.copy },
          { role: "paste", label: messages.paste },
          {
            label: messages.pasteAsText,
            accelerator: "CmdOrCtrl+Shift+V",
            click: pasteAsTextClick,
          },
          { role: "delete", label: messages.delete },
          { type: "separator" },
          { role: "selectAll", label: messages.selectAll },
          ...(environment.platform === "darwin"
            ? [
                { type: "separator" as const },
                {
                  label: messages.speech,
                  submenu: [
                    { role: "startSpeaking" as const, label: messages.startSpeaking },
                    { role: "stopSpeaking" as const, label: messages.stopSpeaking },
                  ],
                },
              ]
            : []),
        ],
      },
      {
        label: messages.view,
        submenu: [
          /* Native reload/DevTools/zoom roles target focused guests; these commands must target the app. */
          {
            label: messages.reload,
            accelerator: "CmdOrCtrl+R",
            click: mainContentsClick("reload"),
          },
          {
            label: messages.forceReload,
            accelerator: "Shift+CmdOrCtrl+R",
            click: mainContentsClick("forceReload"),
          },
          {
            label: messages.toggleDeveloperTools,
            accelerator: environment.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
            click: mainContentsClick("toggleDevTools"),
          },
          { type: "separator" },
          { label: messages.actualSize, accelerator: "CmdOrCtrl+0", click: zoomClick("reset") },
          { label: messages.zoomIn, accelerator: "CmdOrCtrl+=", click: zoomClick("in") },
          {
            label: messages.zoomIn,
            accelerator: "CmdOrCtrl+Plus",
            visible: false,
            click: zoomClick("in"),
          },
          ...(environment.platform === "darwin"
            ? [
                {
                  label: messages.zoomIn,
                  accelerator: "CmdOrCtrl+Shift+=",
                  visible: false,
                  click: zoomClick("in"),
                },
              ]
            : []),
          { label: messages.zoomOut, accelerator: "CmdOrCtrl+-", click: zoomClick("out") },
          // Keypad codes do not match number-row accelerators.
          {
            label: messages.actualSize,
            accelerator: "CmdOrCtrl+num0",
            visible: false,
            click: zoomClick("reset"),
          },
          {
            label: messages.zoomIn,
            accelerator: "CmdOrCtrl+numadd",
            visible: false,
            click: zoomClick("in"),
          },
          {
            label: messages.zoomOut,
            accelerator: "CmdOrCtrl+numsub",
            visible: false,
            click: zoomClick("out"),
          },
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

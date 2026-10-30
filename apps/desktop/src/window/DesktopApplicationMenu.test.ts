import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  DEFAULT_CLIENT_SETTINGS,
  type AppLocalePreference,
  type DesktopUpdateState,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import type * as Electron from "electron";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import { setClientSettings } from "../ipc/methods/clientSettings.ts";
import * as DesktopApplicationMenu from "./DesktopApplicationMenu.ts";
import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopSnapShot from "../snapShot/DesktopSnapShot.ts";
import * as DesktopUpdates from "../updates/DesktopUpdates.ts";
import { resolveDesktopApplicationMenuMessages } from "./DesktopApplicationMenuMessages.ts";
import * as DesktopWindow from "./DesktopWindow.ts";

const environmentInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "linux",
  processArch: "arm64",
  appVersion: "1.2.3",
  appPath: "/repo",
  isPackaged: false,
  resourcesPath: "/repo/resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

const layerElectronApp = (systemLocale = "en-US") =>
  Layer.succeed(ElectronApp.ElectronApp, {
    metadata: Effect.die("unexpected metadata read"),
    name: Effect.succeed("T3 Code"),
    systemLocale: Effect.succeed(systemLocale),
    whenReady: Effect.void,
    requestSingleInstanceLock: Effect.succeed(true),
    quit: Effect.void,
    exit: () => Effect.void,
    relaunch: () => Effect.void,
    setPath: () => Effect.void,
    setName: () => Effect.void,
    setAboutPanelOptions: () => Effect.void,
    setAppUserModelId: () => Effect.void,
    getAppMetrics: Effect.succeed([]),
    setAsDefaultProtocolClient: () => Effect.succeed(true),
    setDesktopName: () => Effect.void,
    setDockIcon: () => Effect.void,
    appendCommandLineSwitch: () => Effect.void,
    onBeforeQuitForUpdate: () => Effect.void,
    removeCommandLineSwitch: () => Effect.void,
    on: () => Effect.void,
  } satisfies ElectronApp.ElectronApp["Service"]);

const electronDialog = {
  pickFolder: () => Effect.succeedNone,
  pickFiles: () => Effect.succeed([]),
  showMessageBox: () => Effect.succeed({ response: 0, checkboxChecked: false }),
  showErrorBox: () => Effect.void,
} satisfies ElectronDialog.ElectronDialog["Service"];

const desktopUpdates = {
  getState: Effect.die("unexpected getState"),
  isActionActive: Effect.succeed(false),
  isInstallActive: Effect.succeed(false),
  subscribe: Effect.die("unexpected subscribe"),
  emitState: Effect.void,
  disabledReason: Effect.succeedNone,
  configure: Effect.void,
  setChannel: () => Effect.die("unexpected setChannel"),
  check: () => Effect.die("unexpected check"),
  download: Effect.die("unexpected download"),
  install: Effect.die("unexpected install"),
  installPrepared: () => Effect.die("unexpected installPrepared"),
} satisfies DesktopUpdates.DesktopUpdates["Service"];

const layerDesktopWindow = (selectedAction: Deferred.Deferred<string>) =>
  Layer.succeed(DesktopWindow.DesktopWindow, {
    createMain: Effect.die("unexpected createMain"),
    ensureMain: Effect.die("unexpected ensureMain"),
    revealOrCreateMain: Effect.die("unexpected revealOrCreateMain"),
    activate: Effect.void,
    createMainIfBackendReady: Effect.void,
    showConnectingSplash: Effect.void,
    handleBackendReady: () => Effect.void,
    handleBackendNotReady: Effect.void,
    flushMainWindowBounds: Effect.void,
    prepareCaptureReveal: Effect.void,
    dispatchMenuAction: (action) => Deferred.succeed(selectedAction, action).pipe(Effect.asVoid),
    dispatchSnapShotEvent: () => Effect.void,
    zoomMain: (direction) =>
      Deferred.succeed(selectedAction, `zoom-${direction}`).pipe(Effect.asVoid),
    runMainContentsCommand: (command) =>
      Deferred.succeed(selectedAction, `main-${command}`).pipe(Effect.asVoid),
    syncAppearance: Effect.void,
  } satisfies DesktopWindow.DesktopWindow["Service"]);

const layerElectronMenu = (
  applicationMenuTemplate: Deferred.Deferred<readonly Electron.MenuItemConstructorOptions[]>,
) =>
  Layer.succeed(ElectronMenu.ElectronMenu, {
    setApplicationMenu: (template) =>
      Deferred.succeed(applicationMenuTemplate, template).pipe(Effect.asVoid),
    popupTemplate: () => Effect.void,
    showContextMenu: () => Effect.succeedNone,
  } satisfies ElectronMenu.ElectronMenu["Service"]);

const configureMenu = (
  selectedAction: Deferred.Deferred<string>,
  applicationMenuTemplate: Deferred.Deferred<readonly Electron.MenuItemConstructorOptions[]>,
  options: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> & {
    readonly appLocale?: AppLocalePreference;
    readonly systemLocale?: string;
    readonly electronDialog?: ElectronDialog.ElectronDialog["Service"];
    readonly desktopUpdates?: DesktopUpdates.DesktopUpdates["Service"];
  } = {},
) =>
  Effect.gen(function* () {
    const menu = yield* DesktopApplicationMenu.DesktopApplicationMenu;
    yield* menu.configure;
  }).pipe(
    Effect.provide(
      DesktopApplicationMenu.layer.pipe(
        Layer.provideMerge(layerElectronMenu(applicationMenuTemplate)),
        Layer.provideMerge(layerDesktopWindow(selectedAction)),
        Layer.provideMerge(
          Layer.succeed(DesktopUpdates.DesktopUpdates, options.desktopUpdates ?? desktopUpdates),
        ),
        Layer.provideMerge(
          Layer.succeed(ElectronDialog.ElectronDialog, options.electronDialog ?? electronDialog),
        ),
        Layer.provideMerge(layerElectronApp(options.systemLocale)),
        Layer.provideMerge(
          DesktopClientSettings.layerTest(
            Option.some({
              ...DEFAULT_CLIENT_SETTINGS,
              appLocale: options.appLocale ?? "en",
            }),
          ),
        ),
        Layer.provideMerge(
          DesktopEnvironment.layer({
            ...environmentInput,
            ...options,
          }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({})))),
        ),
      ),
    ),
  );

describe("DesktopApplicationMenu", () => {
  it.effect("keeps display branding in the macOS application menu", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, {
        platform: "darwin",
        appVersion: "0.0.43-nightly.20260929.2428",
      });

      const template = yield* Deferred.await(applicationMenuTemplate);
      const applicationMenu = template[0];
      assert.isDefined(applicationMenu);
      assert.equal(applicationMenu.label, "T3 Code (Nightly)");
      if (!Array.isArray(applicationMenu.submenu)) {
        throw new Error("Expected application menu submenu to be an array.");
      }
      assert.equal(
        applicationMenu.submenu.find((item) => item.role === "about")?.label,
        "About T3 Code (Nightly)",
      );
      assert.equal(
        applicationMenu.submenu.find((item) => item.role === "hide")?.label,
        "Hide T3 Code (Nightly)",
      );
      assert.equal(
        applicationMenu.submenu.find((item) => item.role === "quit")?.label,
        "Quit T3 Code (Nightly)",
      );
    }),
  );

  it("resolves system language from the runtime locale", () => {
    assert.equal(resolveDesktopApplicationMenuMessages("system", ["zh-Hans-CN"]).file, "文件");
    assert.equal(resolveDesktopApplicationMenuMessages("system", ["fr-FR"]).file, "File");
  });

  it.effect("uses Electron's OS locale when the menu follows the system language", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, {
        appLocale: "system",
        systemLocale: "zh-Hans-CN",
      });

      const template = yield* Deferred.await(applicationMenuTemplate);
      assert.isDefined(template.find((item) => item.label === "文件"));
    }),
  );

  it.effect("installs the native menu and routes Settings through DesktopWindow", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate);

      const template = yield* Deferred.await(applicationMenuTemplate);
      const fileMenu = template.find((item) => item.label === "File");
      assert.isDefined(fileMenu);
      if (!Array.isArray(fileMenu.submenu)) {
        throw new Error("Expected File menu submenu to be an array.");
      }
      const settingsItem = fileMenu.submenu.find((item) => item.label === "Settings...");
      assert.isDefined(settingsItem);
      const settingsClick = settingsItem.click;
      if (typeof settingsClick !== "function") {
        throw new Error("Expected Settings menu item to have a click handler.");
      }

      settingsClick({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as KeyboardEvent);
      assert.equal(yield* Deferred.await(selectedAction), "open-settings");
    }),
  );

  it.effect("owns Paste as Text and routes it through the renderer", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate);

      const template = yield* Deferred.await(applicationMenuTemplate);
      const editMenu = template.find((item) => item.label === "Edit");
      assert.isDefined(editMenu);
      if (!Array.isArray(editMenu.submenu)) {
        throw new Error("Expected Edit menu submenu to be an array.");
      }
      const pasteAsTextItem = editMenu.submenu.find((item) => item.label === "Paste as Text");
      assert.isDefined(pasteAsTextItem);
      assert.equal(pasteAsTextItem.accelerator, "CmdOrCtrl+Shift+V");
      if (typeof pasteAsTextItem.click !== "function") {
        throw new Error("Expected Paste as Text menu item to have a click handler.");
      }

      pasteAsTextItem.click(
        {} as Electron.MenuItem,
        {} as Electron.BrowserWindow,
        {} as KeyboardEvent,
      );
      assert.equal(yield* Deferred.await(selectedAction), "paste-as-text");
    }),
  );

  it.effect("leaves the accelerator to Chromium instead of injecting a paste", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate);

      const template = yield* Deferred.await(applicationMenuTemplate);
      const editMenu = template.find((item) => item.label === "Edit");
      if (!Array.isArray(editMenu?.submenu)) {
        throw new Error("Expected Edit menu submenu to be an array.");
      }
      const pasteAsTextItem = editMenu.submenu.find((item) => item.label === "Paste as Text");
      if (typeof pasteAsTextItem?.click !== "function") {
        throw new Error("Expected Paste as Text menu item to have a click handler.");
      }

      pasteAsTextItem.click(
        {} as Electron.MenuItem,
        {} as Electron.BrowserWindow,
        {
          triggeredByAccelerator: true,
        } as unknown as KeyboardEvent,
      );
      assert.isFalse(yield* Deferred.isDone(selectedAction));
    }),
  );

  it.effect("registers macOS command-plus once and routes it through main-window zoom", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, { platform: "darwin" });

      const template = yield* Deferred.await(applicationMenuTemplate);
      const viewMenu = template.find((item) => item.label === "View");
      assert.isDefined(viewMenu);
      if (!Array.isArray(viewMenu.submenu)) {
        throw new Error("Expected View menu submenu to be an array.");
      }

      assert.isUndefined(
        viewMenu.submenu.find((item) =>
          ["zoom", "reload", "devtools"].some((role) => item.role?.toLowerCase().includes(role)),
        ),
      );

      const shiftedEqual = viewMenu.submenu.filter(
        (item) => item.accelerator === "CmdOrCtrl+Shift+=",
      );
      assert.lengthOf(shiftedEqual, 1);
      assert.lengthOf(
        viewMenu.submenu.filter((item) => item.accelerator === "CmdOrCtrl+numadd"),
        1,
      );
      const zoomIn = shiftedEqual[0];
      assert.isDefined(zoomIn);
      assert.isFalse(zoomIn.visible);
      if (typeof zoomIn.click !== "function") {
        throw new Error("Expected Zoom In menu item to have a click handler.");
      }

      zoomIn.click({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as KeyboardEvent);
      assert.equal(yield* Deferred.await(selectedAction), "zoom-in");
    }),
  );

  it.effect("localizes role-backed menus and their visible items in Simplified Chinese", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, { appLocale: "zh-CN" });

      const template = yield* Deferred.await(applicationMenuTemplate);
      const fileMenu = template.find((item) => item.label === "文件");
      assert.isDefined(fileMenu);
      if (!Array.isArray(fileMenu.submenu)) {
        throw new Error("Expected localized File menu submenu to be an array.");
      }
      assert.isDefined(fileMenu.submenu.find((item) => item.label === "设置..."));
      assert.equal(
        fileMenu.submenu.find((item) => item.role === "quit")?.label,
        "退出 T3 Code (Beta)",
      );

      const editMenu = template.find((item) => item.label === "编辑");
      assert.equal(editMenu?.label, "编辑");
      if (!Array.isArray(editMenu?.submenu)) {
        throw new Error("Expected localized Edit menu submenu to be an array.");
      }
      assert.deepEqual(
        editMenu.submenu
          .filter((item) => item.role !== undefined)
          .map((item) => [item.role, item.label]),
        [
          ["undo", "撤销"],
          ["redo", "重做"],
          ["cut", "剪切"],
          ["copy", "复制"],
          ["paste", "粘贴"],
          ["delete", "删除"],
          ["selectAll", "全选"],
        ],
      );

      const viewMenu = template.find((item) => item.label === "视图");
      assert.isDefined(viewMenu);
      if (!Array.isArray(viewMenu.submenu)) {
        throw new Error("Expected localized View menu submenu to be an array.");
      }
      assert.isDefined(viewMenu.submenu.find((item) => item.label === "实际大小"));
      assert.isDefined(viewMenu.submenu.find((item) => item.label === "放大"));
      assert.isDefined(viewMenu.submenu.find((item) => item.label === "缩小"));
      assert.equal(
        viewMenu.submenu.find((item) => item.accelerator === "CmdOrCtrl+R")?.label,
        "重新加载",
      );
      assert.equal(
        viewMenu.submenu.find((item) => item.accelerator === "Shift+CmdOrCtrl+R")?.label,
        "强制重新加载",
      );
      assert.equal(
        viewMenu.submenu.find((item) => item.accelerator === "Ctrl+Shift+I")?.label,
        "切换开发者工具",
      );
      assert.equal(
        viewMenu.submenu.find((item) => item.role === "togglefullscreen")?.label,
        "切换全屏",
      );

      const windowMenu = template.find((item) => item.role === "windowMenu");
      assert.equal(windowMenu?.label, "窗口");
      if (!Array.isArray(windowMenu?.submenu)) {
        throw new Error("Expected localized Window menu submenu to be an array.");
      }
      assert.equal(windowMenu.submenu.find((item) => item.role === "minimize")?.label, "最小化");
      assert.equal(windowMenu.submenu.find((item) => item.role === "zoom")?.label, "缩放");

      const helpMenu = template.find((item) => item.role === "help");
      assert.isDefined(helpMenu);
      assert.equal(helpMenu.label, "帮助");
      if (!Array.isArray(helpMenu.submenu)) {
        throw new Error("Expected Help menu submenu to be an array.");
      }
      assert.isDefined(helpMenu.submenu.find((item) => item.label === "检查更新..."));
    }),
  );

  it.effect("keeps role-backed menus and their visible items in English", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, { appLocale: "en" });

      const template = yield* Deferred.await(applicationMenuTemplate);
      const editMenu = template.find((item) => item.label === "Edit");
      assert.equal(editMenu?.label, "Edit");
      if (!Array.isArray(editMenu?.submenu)) {
        throw new Error("Expected English Edit menu submenu to be an array.");
      }
      assert.equal(editMenu.submenu.find((item) => item.role === "undo")?.label, "Undo");
      assert.equal(editMenu.submenu.find((item) => item.role === "copy")?.label, "Copy");
      assert.equal(editMenu.submenu.find((item) => item.role === "selectAll")?.label, "Select All");

      const viewMenu = template.find((item) => item.label === "View");
      if (!Array.isArray(viewMenu?.submenu)) {
        throw new Error("Expected English View menu submenu to be an array.");
      }
      assert.equal(
        viewMenu.submenu.find((item) => item.accelerator === "CmdOrCtrl+R")?.label,
        "Reload",
      );
      assert.equal(
        viewMenu.submenu.find((item) => item.role === "togglefullscreen")?.label,
        "Toggle Full Screen",
      );

      const windowMenu = template.find((item) => item.role === "windowMenu");
      assert.equal(windowMenu?.label, "Window");
      if (!Array.isArray(windowMenu?.submenu)) {
        throw new Error("Expected English Window menu submenu to be an array.");
      }
      assert.equal(windowMenu.submenu.find((item) => item.role === "minimize")?.label, "Minimize");
      assert.equal(windowMenu.submenu.find((item) => item.role === "zoom")?.label, "Zoom");
      assert.equal(template.find((item) => item.role === "help")?.label, "Help");
    }),
  );

  it.effect("localizes the macOS application and Window role items", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, {
        appLocale: "zh-CN",
        platform: "darwin",
      });

      const template = yield* Deferred.await(applicationMenuTemplate);
      const appMenu = template[0];
      if (!Array.isArray(appMenu?.submenu)) {
        throw new Error("Expected macOS application menu submenu to be an array.");
      }
      assert.deepEqual(
        appMenu.submenu
          .filter((item) => item.role !== undefined)
          .map((item) => [item.role, item.label]),
        [
          ["about", "关于 T3 Code (Beta)"],
          ["services", "服务"],
          ["hide", "隐藏 T3 Code (Beta)"],
          ["hideOthers", "隐藏其他应用"],
          ["unhide", "全部显示"],
          ["quit", "退出 T3 Code (Beta)"],
        ],
      );

      const fileMenu = template.find((item) => item.label === "文件");
      if (!Array.isArray(fileMenu?.submenu)) {
        throw new Error("Expected macOS File menu submenu to be an array.");
      }
      const closeWindow = fileMenu.submenu.find((item) => item.label === "关闭窗口");
      assert.isDefined(closeWindow);
      assert.isUndefined(closeWindow.role);
      assert.isUndefined(closeWindow.accelerator);
      let closed = false;
      if (typeof closeWindow.click !== "function") {
        throw new Error("Expected localized Close Window click handler.");
      }
      closeWindow.click(
        {} as Electron.MenuItem,
        {
          close: () => {
            closed = true;
          },
        } as Electron.BrowserWindow,
        {} as KeyboardEvent,
      );
      assert.isTrue(closed);

      const windowMenu = template.find((item) => item.role === "windowMenu");
      if (!Array.isArray(windowMenu?.submenu)) {
        throw new Error("Expected macOS Window menu submenu to be an array.");
      }
      assert.equal(windowMenu.submenu.find((item) => item.role === "zoom")?.label, "缩放");
      assert.equal(windowMenu.submenu.find((item) => item.role === "front")?.label, "全部置于最前");
    }),
  );

  it.effect("uses the selected locale for update dialogs", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();
      const shownMessageBox = yield* Deferred.make<Electron.MessageBoxOptions>();
      const updateState = {
        enabled: true,
        status: "up-to-date",
        channel: "latest",
        currentVersion: "1.2.3",
        hostArch: "arm64",
        appArch: "arm64",
        runningUnderArm64Translation: false,
        availableVersion: null,
        downloadedVersion: null,
        releaseNotes: [],
        downloadPercent: null,
        checkedAt: "2026-08-14T00:00:00.000Z",
        message: null,
        errorContext: null,
        canRetry: false,
        omittedReleaseCount: 0,
      } satisfies DesktopUpdateState;

      yield* configureMenu(selectedAction, applicationMenuTemplate, {
        appLocale: "zh-CN",
        electronDialog: {
          ...electronDialog,
          showMessageBox: (options) =>
            Deferred.succeed(shownMessageBox, options).pipe(
              Effect.as({ response: 0, checkboxChecked: false }),
            ),
        },
        desktopUpdates: {
          ...desktopUpdates,
          check: () => Effect.succeed({ checked: true, state: updateState }),
        },
      });

      const template = yield* Deferred.await(applicationMenuTemplate);
      const helpMenu = template.find((item) => item.role === "help");
      assert.isDefined(helpMenu);
      if (!Array.isArray(helpMenu.submenu)) {
        throw new Error("Expected Help menu submenu to be an array.");
      }
      const checkForUpdates = helpMenu.submenu.find((item) => item.label === "检查更新...");
      assert.isDefined(checkForUpdates);
      if (typeof checkForUpdates.click !== "function") {
        throw new Error("Expected Check for Updates menu item to have a click handler.");
      }

      checkForUpdates.click(
        {} as Electron.MenuItem,
        {} as Electron.BrowserWindow,
        {} as KeyboardEvent,
      );

      const dialog = yield* Deferred.await(shownMessageBox);
      assert.equal(dialog.title, "已是最新版本");
      assert.equal(dialog.message, "T3 Code 1.2.3 当前已是最新版本。");
      assert.deepEqual(dialog.buttons, ["确定"]);
    }),
  );

  it.effect("reconfigures only when the persisted app locale changes", () =>
    Effect.gen(function* () {
      const configureCount = yield* Ref.make(0);
      const initialSettings = {
        ...DEFAULT_CLIENT_SETTINGS,
        appLocale: "en" as const,
      };
      const layer = Layer.mergeAll(
        DesktopClientSettings.layerTest(Option.some(initialSettings)),
        Layer.mock(DesktopSnapShot.DesktopSnapShot)({ configure: () => Effect.void }),
        Layer.succeed(DesktopApplicationMenu.DesktopApplicationMenu, {
          configure: Ref.update(configureCount, (count) => count + 1),
        }),
      );

      const chineseSettings = { ...initialSettings, appLocale: "zh-CN" as const };
      yield* Effect.gen(function* () {
        yield* setClientSettings.handler({ ...initialSettings, wordWrap: false });
        assert.equal(yield* Ref.get(configureCount), 0);

        yield* setClientSettings.handler(chineseSettings);
        assert.equal(yield* Ref.get(configureCount), 1);

        yield* setClientSettings.handler({ ...chineseSettings, wordWrap: true });
        assert.equal(yield* Ref.get(configureCount), 1);
      }).pipe(Effect.provide(layer));
    }),
  );
  it.effect.each([
    { appLocale: "en", viewLabel: "View", labels: ["Zoom In", "Zoom Out", "Actual Size"] },
    { appLocale: "zh-CN", viewLabel: "视图", labels: ["放大", "缩小", "实际大小"] },
  ] as const)(
    "zooms from the numeric keypad in $appLocale without duplicate visible commands",
    ({ appLocale, viewLabel, labels }) =>
      Effect.gen(function* () {
        for (const [accelerator, expected, label] of [
          ["CmdOrCtrl+numadd", "zoom-in", labels[0]],
          ["CmdOrCtrl+numsub", "zoom-out", labels[1]],
          ["CmdOrCtrl+num0", "zoom-reset", labels[2]],
        ] as const) {
          const selectedAction = yield* Deferred.make<string>();
          const applicationMenuTemplate =
            yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

          yield* configureMenu(selectedAction, applicationMenuTemplate, { appLocale });

          const template = yield* Deferred.await(applicationMenuTemplate);
          const viewMenu = template.find((item) => item.label === viewLabel);
          if (!viewMenu || !Array.isArray(viewMenu.submenu)) {
            throw new Error("Expected View menu submenu to be an array.");
          }
          const item = viewMenu.submenu.find((entry) => entry.accelerator === accelerator);
          assert.isDefined(item);
          assert.equal(item.label, label);
          assert.isFalse(item.visible);
          if (typeof item.click !== "function") {
            throw new Error(`Expected ${accelerator} menu item to have a click handler.`);
          }

          item.click({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as KeyboardEvent);
          assert.equal(yield* Deferred.await(selectedAction), expected);
        }
      }),
  );

  it.effect("never binds Cmd/Ctrl+W to closing the window", () =>
    Effect.gen(function* () {
      for (const platform of ["darwin", "linux", "win32"] as const) {
        const applicationMenuTemplate =
          yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();
        yield* configureMenu(yield* Deferred.make<string>(), applicationMenuTemplate, {
          platform,
        });

        const items: Electron.MenuItemConstructorOptions[] = [];
        const collect = (template: readonly Electron.MenuItemConstructorOptions[]) => {
          for (const item of template) {
            items.push(item);
            if (Array.isArray(item.submenu)) collect(item.submenu);
          }
        };
        collect(yield* Deferred.await(applicationMenuTemplate));

        assert.isUndefined(
          items.find((item) => item.role === "close"),
          platform,
        );
        // Electron's default windowMenu submenu includes a close role.
        assert.isUndefined(
          items.find((item) => item.role === "windowMenu" && item.submenu === undefined),
          platform,
        );
        assert.isUndefined(
          items.find((item) => item.accelerator?.toLowerCase().endsWith("+w")),
          platform,
        );
      }
    }),
  );

  it.effect("reloads the main window even while a browser page has focus", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate);

      const template = yield* Deferred.await(applicationMenuTemplate);
      const viewMenu = template.find((item) => item.label === "View");
      if (!Array.isArray(viewMenu?.submenu)) {
        throw new Error("Expected View menu submenu to be an array.");
      }
      const reload = viewMenu.submenu.find((item) => item.label === "Reload");
      assert.equal(reload?.accelerator, "CmdOrCtrl+R");
      if (typeof reload?.click !== "function") {
        throw new Error("Expected Reload menu item to have a click handler.");
      }

      reload.click({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as KeyboardEvent);
      assert.equal(yield* Deferred.await(selectedAction), "main-reload");
    }),
  );
  it.effect.each([
    { label: "重新加载", accelerator: "CmdOrCtrl+R", command: "reload" },
    { label: "强制重新加载", accelerator: "Shift+CmdOrCtrl+R", command: "forceReload" },
    { label: "切换开发者工具", accelerator: "Ctrl+Shift+I", command: "toggleDevTools" },
  ] as const)("routes localized $command to the main renderer", ({ label, accelerator, command }) =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate, { appLocale: "zh-CN" });

      const template = yield* Deferred.await(applicationMenuTemplate);
      const viewMenu = template.find((item) => item.label === "视图");
      if (!Array.isArray(viewMenu?.submenu)) {
        throw new Error("Expected localized View menu submenu to be an array.");
      }
      const item = viewMenu.submenu.find((item) => item.label === label);
      assert.equal(item?.accelerator, accelerator);
      assert.isUndefined(item?.role);
      if (typeof item?.click !== "function") {
        throw new Error("Expected localized main-renderer command to have a click handler.");
      }

      item.click({} as Electron.MenuItem, {} as Electron.BrowserWindow, {} as KeyboardEvent);
      assert.equal(yield* Deferred.await(selectedAction), `main-${command}`);
    }),
  );
});

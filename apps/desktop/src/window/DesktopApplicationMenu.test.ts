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

const makeElectronAppLayer = (systemLocale = "en-US") =>
  Layer.succeed(ElectronApp.ElectronApp, {
    metadata: Effect.die("unexpected metadata read"),
    name: Effect.succeed("T3 Code"),
    systemLocale: Effect.succeed(systemLocale),
    whenReady: Effect.void,
    quit: Effect.void,
    exit: () => Effect.void,
    relaunch: () => Effect.void,
    setPath: () => Effect.void,
    setName: () => Effect.void,
    setAboutPanelOptions: () => Effect.void,
    setAppUserModelId: () => Effect.void,
    getAppMetrics: Effect.succeed([]),
    isDefaultProtocolClient: () => Effect.succeed(false),
    setAsDefaultProtocolClient: () => Effect.succeed(true),
    setDesktopName: () => Effect.void,
    setDockIcon: () => Effect.void,
    appendCommandLineSwitch: () => Effect.void,
    onBeforeQuitForUpdate: () => Effect.void,
    removeCommandLineSwitch: () => Effect.void,
    on: () => Effect.void,
  } satisfies ElectronApp.ElectronApp["Service"]);

const electronDialog = {
  pickFolder: () => Effect.succeed(Option.none()),
  pickFiles: () => Effect.succeed([]),
  showMessageBox: () => Effect.succeed({ response: 0, checkboxChecked: false }),
  showErrorBox: () => Effect.void,
} satisfies ElectronDialog.ElectronDialog["Service"];

const desktopUpdates = {
  getState: Effect.die("unexpected getState"),
  emitState: Effect.void,
  disabledReason: Effect.succeed(Option.none()),
  configure: Effect.void,
  setChannel: () => Effect.die("unexpected setChannel"),
  check: () => Effect.die("unexpected check"),
  download: Effect.die("unexpected download"),
  install: Effect.die("unexpected install"),
} satisfies DesktopUpdates.DesktopUpdates["Service"];

const makeDesktopWindowLayer = (selectedAction: Deferred.Deferred<string>) =>
  Layer.succeed(DesktopWindow.DesktopWindow, {
    createMain: Effect.die("unexpected createMain"),
    ensureMain: Effect.succeed({} as Electron.BrowserWindow),
    revealOrCreateMain: Effect.die("unexpected revealOrCreateMain"),
    activate: Effect.void,
    createMainIfBackendReady: Effect.void,
    showConnectingSplash: Effect.void,
    handleBackendReady: () => Effect.void,
    handleBackendNotReady: Effect.void,
    flushMainWindowBounds: Effect.void,
    dispatchMenuAction: (action) => Deferred.succeed(selectedAction, action).pipe(Effect.asVoid),
    zoomMain: (direction) =>
      Deferred.succeed(selectedAction, `zoom-${direction}`).pipe(Effect.asVoid),
    syncAppearance: Effect.void,
  } satisfies DesktopWindow.DesktopWindow["Service"]);

const makeElectronMenuLayer = (
  applicationMenuTemplate: Deferred.Deferred<readonly Electron.MenuItemConstructorOptions[]>,
) =>
  Layer.succeed(ElectronMenu.ElectronMenu, {
    setApplicationMenu: (template) =>
      Deferred.succeed(applicationMenuTemplate, template).pipe(Effect.asVoid),
    popupTemplate: () => Effect.void,
    showContextMenu: () => Effect.succeed(Option.none()),
  } satisfies ElectronMenu.ElectronMenu["Service"]);

const configureMenu = (
  selectedAction: Deferred.Deferred<string>,
  applicationMenuTemplate: Deferred.Deferred<readonly Electron.MenuItemConstructorOptions[]>,
  options: {
    readonly appLocale?: AppLocalePreference;
    readonly systemLocale?: string;
    readonly platform?: DesktopEnvironment.MakeDesktopEnvironmentInput["platform"];
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
        Layer.provideMerge(makeElectronMenuLayer(applicationMenuTemplate)),
        Layer.provideMerge(makeDesktopWindowLayer(selectedAction)),
        Layer.provideMerge(
          Layer.succeed(DesktopUpdates.DesktopUpdates, options.desktopUpdates ?? desktopUpdates),
        ),
        Layer.provideMerge(
          Layer.succeed(ElectronDialog.ElectronDialog, options.electronDialog ?? electronDialog),
        ),
        Layer.provideMerge(makeElectronAppLayer(options.systemLocale)),
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
            platform: options.platform ?? environmentInput.platform,
          }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({})))),
        ),
      ),
    ),
  );

describe("DesktopApplicationMenu", () => {
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

  // Zoom must route through DesktopWindow.zoomMain instead of the Electron
  // zoom roles: the roles zoom whichever webContents has focus, which breaks
  // app zoom while an embedded preview WebContentsView holds focus.
  it.effect("routes View menu zoom to the main window instead of zoom roles", () =>
    Effect.gen(function* () {
      const selectedAction = yield* Deferred.make<string>();
      const applicationMenuTemplate =
        yield* Deferred.make<readonly Electron.MenuItemConstructorOptions[]>();

      yield* configureMenu(selectedAction, applicationMenuTemplate);

      const template = yield* Deferred.await(applicationMenuTemplate);
      const viewMenu = template.find((item) => item.label === "View");
      assert.isDefined(viewMenu);
      if (!Array.isArray(viewMenu.submenu)) {
        throw new Error("Expected View menu submenu to be an array.");
      }

      assert.isUndefined(
        viewMenu.submenu.find((item) => item.role?.toLowerCase().includes("zoom")),
      );

      const zoomIn = viewMenu.submenu.find((item) => item.label === "Zoom In");
      assert.isDefined(zoomIn);
      assert.equal(zoomIn.accelerator, "CmdOrCtrl+=");
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
      assert.equal(fileMenu.submenu.find((item) => item.role === "quit")?.label, "退出 T3 Code");

      const editMenu = template.find((item) => item.role === "editMenu");
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
          ["pasteAndMatchStyle", "粘贴并匹配样式"],
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
      assert.equal(viewMenu.submenu.find((item) => item.role === "reload")?.label, "重新加载");
      assert.equal(
        viewMenu.submenu.find((item) => item.role === "forceReload")?.label,
        "强制重新加载",
      );
      assert.equal(
        viewMenu.submenu.find((item) => item.role === "toggleDevTools")?.label,
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
      assert.equal(windowMenu.submenu.find((item) => item.role === "close")?.label, "关闭窗口");

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
      const editMenu = template.find((item) => item.role === "editMenu");
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
      assert.equal(viewMenu.submenu.find((item) => item.role === "reload")?.label, "Reload");
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
      assert.equal(windowMenu.submenu.find((item) => item.role === "close")?.label, "Close Window");
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
          ["about", "关于 T3 Code"],
          ["services", "服务"],
          ["hide", "隐藏 T3 Code"],
          ["hideOthers", "隐藏其他应用"],
          ["unhide", "全部显示"],
          ["quit", "退出 T3 Code"],
        ],
      );

      const fileMenu = template.find((item) => item.label === "文件");
      if (!Array.isArray(fileMenu?.submenu)) {
        throw new Error("Expected macOS File menu submenu to be an array.");
      }
      assert.equal(fileMenu.submenu.find((item) => item.role === "close")?.label, "关闭窗口");

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
});

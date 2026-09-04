import { assert, describe, it } from "@effect/vitest";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type * as Electron from "electron";
import { vi } from "vite-plus/test";

const electronMocks = vi.hoisted(() => ({
  menuTemplates: [] as Array<readonly Electron.MenuItemConstructorOptions[]>,
  trayInstances: [] as Array<{
    readonly iconPath: string;
    readonly listeners: Map<string, () => void>;
    contextMenu: unknown;
    destroyed: boolean;
    tooltip: string;
  }>,
}));

vi.mock("electron", () => {
  class Tray {
    readonly iconPath: string;
    readonly listeners = new Map<string, () => void>();
    contextMenu: unknown;
    destroyed = false;
    tooltip = "";

    constructor(iconPath: string) {
      this.iconPath = iconPath;
      electronMocks.trayInstances.push(this);
    }

    setToolTip(tooltip: string) {
      this.tooltip = tooltip;
    }

    setContextMenu(menu: unknown) {
      this.contextMenu = menu;
    }

    on(eventName: string, listener: () => void) {
      this.listeners.set(eventName, listener);
      return this;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  return {
    Menu: {
      buildFromTemplate: vi.fn((template: readonly Electron.MenuItemConstructorOptions[]) => {
        electronMocks.menuTemplates.push(template);
        return template;
      }),
    },
    Tray,
  };
});

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopTray from "./DesktopTray.ts";

const dependencies = Layer.mergeAll(
  Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
    platform: "win32",
    isPackaged: true,
    resourcesPath: "C:\\Program Files\\T3 Code\\resources",
    path: {
      join: (...parts: readonly string[]) => parts.join("\\"),
    },
  } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
  Layer.mock(ElectronApp.ElectronApp)({
    name: Effect.succeed("T3 Code"),
    systemLocale: Effect.succeed("zh-CN"),
  }),
  DesktopClientSettings.layerTest(
    Option.some({
      ...DEFAULT_CLIENT_SETTINGS,
      appLocale: "zh-CN",
    }),
  ),
);

describe("DesktopTray", () => {
  it.effect("keeps packaged Windows close events alive until the tray requests quit", () =>
    Effect.gen(function* () {
      electronMocks.menuTemplates.length = 0;
      electronMocks.trayInstances.length = 0;
      let openCount = 0;
      let quitCount = 0;

      yield* Effect.scoped(
        Effect.gen(function* () {
          const tray = yield* DesktopTray.make;
          const created = yield* tray.ensure({
            open: () => {
              openCount += 1;
            },
            quit: () => {
              quitCount += 1;
            },
          });

          assert.isTrue(created);
          assert.isTrue(tray.shouldHideOnClose());
          assert.equal(electronMocks.trayInstances.length, 1);

          const trayInstance = electronMocks.trayInstances[0];
          assert.isDefined(trayInstance);
          assert.equal(trayInstance.iconPath, "C:\\Program Files\\T3 Code\\resources\\icon.ico");
          assert.equal(trayInstance.tooltip, "T3 Code");

          const template = electronMocks.menuTemplates[0];
          assert.isDefined(template);
          assert.equal(template[0]?.label, "打开 T3 Code");
          assert.equal(template[2]?.label, "退出 T3 Code");

          trayInstance.listeners.get("click")?.();
          template[0]?.click?.(
            {} as Electron.MenuItem,
            {} as Electron.BrowserWindow,
            {} as KeyboardEvent,
          );
          template[2]?.click?.(
            {} as Electron.MenuItem,
            {} as Electron.BrowserWindow,
            {} as KeyboardEvent,
          );

          assert.equal(openCount, 2);
          assert.equal(quitCount, 1);

          tray.markQuitRequested();
          assert.isFalse(tray.shouldHideOnClose());
          assert.isFalse(trayInstance.destroyed);
        }).pipe(Effect.provide(dependencies)),
      );

      assert.isTrue(electronMocks.trayInstances[0]?.destroyed);
    }),
  );
});

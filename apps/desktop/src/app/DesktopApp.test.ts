import { assert, it } from "@effect/vitest";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HttpClient from "effect/http/HttpClient";
import { ChildProcessSpawner } from "effect/process";
import * as NetService from "@t3tools/shared/Net";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { vi } from "vite-plus/test";

vi.mock("electron", () => ({}));
vi.mock("@clerk/electron", () => ({ createClerkBridge: vi.fn() }));
vi.mock("@clerk/electron/storage", () => ({ storage: vi.fn() }));
vi.mock("../ipc/DesktopIpcHandlers.ts", () => ({
  installDesktopIpcHandlers: () => Effect.void,
}));
vi.mock("../updates/DesktopRemoteUpdates.ts", () => ({ listen: Effect.void }));
vi.mock("./DesktopStartupRecovery.ts", () => ({ listen: Effect.void }));

import * as DesktopApp from "./DesktopApp.ts";
import * as DesktopAppActivation from "./DesktopAppActivation.ts";
import * as DesktopAppIdentity from "./DesktopAppIdentity.ts";
import * as DesktopClerk from "./DesktopClerk.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLegacyLocalStorage from "./DesktopLegacyLocalStorage.ts";
import * as DesktopLifecycle from "./DesktopLifecycle.ts";
import * as DesktopLinuxUrlHandler from "./DesktopLinuxUrlHandler.ts";
import * as DesktopPreReadyPlatform from "./DesktopPreReadyPlatform.ts";
import * as DesktopShutdown from "./DesktopShutdown.ts";
import * as DesktopState from "./DesktopState.ts";
import * as DesktopBackendPool from "../backend/DesktopBackendPool.ts";
import * as DesktopServerExposure from "../backend/DesktopServerExposure.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronProtocol from "../electron/ElectronProtocol.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as PreviewPasskeys from "../preview/Passkeys.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopShellEnvironment from "../shell/DesktopShellEnvironment.ts";
import * as DesktopSnapShot from "../snapShot/DesktopSnapShot.ts";
import * as DesktopRendererHistory from "../telemetry/DesktopRendererHistory.ts";
import * as DesktopUpdates from "../updates/DesktopUpdates.ts";
import * as DesktopApplicationMenu from "../window/DesktopApplicationMenu.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopTray from "../window/DesktopTray.ts";
import * as DesktopWslBackend from "../wsl/DesktopWslBackend.ts";

import * as BrowserImport from "../preview/BrowserImport/BrowserImport.ts";
import * as DesktopBackendConfiguration from "../backend/DesktopBackendConfiguration.ts";
import * as DesktopCliCommand from "./DesktopCliCommand.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as DesktopConnectionCatalogStore from "./DesktopConnectionCatalogStore.ts";
import * as DesktopIpc from "../ipc/DesktopIpc.ts";
import * as DesktopLocalEnvironmentAuth from "../backend/DesktopLocalEnvironmentAuth.ts";
import * as DesktopManagedPolicy from "./DesktopManagedPolicy.ts";
import * as DesktopSshEnvironment from "../ssh/DesktopSshEnvironment.ts";
import * as DesktopSshPasswordPrompts from "../ssh/DesktopSshPasswordPrompts.ts";
import * as DesktopTelemetryPublisher from "../telemetry/DesktopTelemetryPublisher.ts";
import * as DesktopWebLinks from "./DesktopWebLinks.ts";
import * as DesktopWslEnvironment from "../wsl/DesktopWslEnvironment.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import * as ElectronShell from "../electron/ElectronShell.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as MacPermissions from "../permissions/MacPermissions.ts";
import * as PreviewManager from "../preview/Manager.ts";

it.effect.each([false, true])(
  "stops backends together before flushing history and cancels Linux registration, stop defect=%s",
  (stopDefect) =>
    Effect.gen(function* () {
      const registrationStarted = yield* Deferred.make<void>();
      const releaseRegistration = yield* Deferred.make<void>();
      const registrationStopped = yield* Deferred.make<void>();
      const windowStarted = yield* Deferred.make<void>();
      const firstStopStarted = yield* Deferred.make<void>();
      const secondStopStarted = yield* Deferred.make<void>();
      const releaseStops = yield* Deferred.make<void>();
      const historyStarted = yield* Deferred.make<void>();
      const releaseHistory = yield* Deferred.make<void>();
      const quitting = yield* Ref.make(false);
      const events: string[] = [];
      const record = (event: string) =>
        Effect.sync(() => {
          events.push(event);
        });
      const runApp = DesktopApp.program
        .pipe(
          Effect.provide(NodeCrypto.layer),
          Effect.provideService(DesktopAppIdentity.DesktopAppIdentity, {
            resolveUserDataPath: Effect.succeed("/isolated/userdata"),
            configure: record("identity"),
          } as DesktopAppIdentity.DesktopAppIdentity["Service"]),
          Effect.provideService(ElectronApp.ElectronApp, {
            setPath: () => Effect.void,
            whenReady: record("ready"),
          } as unknown as ElectronApp.ElectronApp["Service"]),
          Effect.provideService(ElectronDialog.ElectronDialog, {
            showErrorBox: () => Effect.die("unexpected fatal startup error"),
          } as unknown as ElectronDialog.ElectronDialog["Service"]),
          Effect.provideService(DesktopEnvironment.DesktopEnvironment, {
            platform: "linux",
            isDevelopment: false,
            isPackaged: true,
            configuredBackendPort: Option.some(3773),
            defaultDesktopSettings: { serverExposureMode: "local-only" },
          } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]),
          Effect.provideService(DesktopPreReadyPlatform.DesktopPreReadyElectronOptions, {
            linux: null,
            linuxPasswordStoreCommandLine: "basic",
          }),
          Effect.provideService(DesktopShellEnvironment.DesktopShellEnvironment, {
            installIntoProcess: Effect.succeed(true),
            awaitDiscovery: Effect.succeed(true),
            awaitUserShellDiscovery: Effect.succeed(true),
            updates: Stream.empty,
          }),
          Effect.provideService(DesktopAppSettings.DesktopAppSettings, {
            load: Effect.void,
            get: Effect.succeed({
              localEnvironmentEnabled: true,
              serverExposureMode: "local-only",
            }),
          } as unknown as DesktopAppSettings.DesktopAppSettings["Service"]),
          Effect.provideService(DesktopLifecycle.DesktopLifecycle, {
            register: Effect.void,
            relaunch: () => Effect.void,
          }),
          Effect.provideService(DesktopClerk.DesktopClerk, {
            configure: Effect.void,
          } as DesktopClerk.DesktopClerk["Service"]),
          Effect.provideService(ElectronSafeStorage.ElectronSafeStorage, {
            selectedStorageBackend: Effect.succeedNone,
          } as unknown as ElectronSafeStorage.ElectronSafeStorage["Service"]),
          Effect.provideService(PreviewPasskeys.PreviewPasskeys, {
            configure: Effect.void,
          } as PreviewPasskeys.PreviewPasskeys["Service"]),
          Effect.provideService(DesktopApplicationMenu.DesktopApplicationMenu, {
            configure: Effect.void,
          }),
          Effect.provideService(DesktopUpdates.DesktopUpdates, {
            configure: Effect.void,
          } as unknown as DesktopUpdates.DesktopUpdates["Service"]),
          Effect.provideService(DesktopLinuxUrlHandler.DesktopLinuxUrlHandler, {
            register: Deferred.succeed(registrationStarted, undefined).pipe(
              Effect.andThen(Deferred.await(releaseRegistration)),
              Effect.ensuring(Deferred.succeed(registrationStopped, undefined)),
            ),
          }),
        )
        .pipe(
          Effect.provideService(ElectronProtocol.ElectronProtocol, {
            registerDesktopProtocol: () => Effect.void,
          } as unknown as ElectronProtocol.ElectronProtocol["Service"]),
          Effect.provideService(DesktopLegacyLocalStorage.DesktopLegacyLocalStorage, {
            load: () => Effect.void,
          } as unknown as DesktopLegacyLocalStorage.DesktopLegacyLocalStorage["Service"]),
          Effect.provideService(DesktopSnapShot.DesktopSnapShot, {
            initialize: Effect.void,
          } as DesktopSnapShot.DesktopSnapShot["Service"]),
          Effect.provideService(DesktopState.DesktopState, {
            quitting,
          } as DesktopState.DesktopState["Service"]),
          Effect.provideService(DesktopWindow.DesktopWindow, {
            ensureMain: record("window").pipe(
              Effect.andThen(Deferred.succeed(windowStarted, undefined)),
            ),
          } as unknown as DesktopWindow.DesktopWindow["Service"]),
          Effect.provideService(DesktopBackendPool.DesktopBackendPool, {
            primary: Effect.succeed({
              start: record("backend"),
              currentConfig: Effect.succeedSome({ preflightFailure: Option.none() }),
            }),
            list: Effect.succeed([
              {
                stop: () =>
                  Deferred.succeed(firstStopStarted, undefined).pipe(
                    Effect.andThen(Deferred.await(releaseStops)),
                    Effect.andThen(stopDefect ? Effect.die("stop defect") : Effect.void),
                  ),
              },
              {
                stop: () =>
                  Deferred.succeed(secondStopStarted, undefined).pipe(
                    Effect.andThen(Deferred.await(releaseStops)),
                  ),
              },
            ]),
          } as unknown as DesktopBackendPool.DesktopBackendPool["Service"]),
          Effect.provideService(DesktopServerExposure.DesktopServerExposure, {
            configureFromSettings: () => Effect.succeed({ mode: "local-only" }),
            backendConfig: Effect.succeed({ httpBaseUrl: new URL("http://127.0.0.1:3773") }),
          } as unknown as DesktopServerExposure.DesktopServerExposure["Service"]),
          Effect.provideService(DesktopWslBackend.DesktopWslBackend, {
            reconcile: Effect.void,
          } as DesktopWslBackend.DesktopWslBackend["Service"]),
          Effect.provideService(DesktopAppActivation.DesktopAppActivation, {
            start: Effect.void,
          } as unknown as DesktopAppActivation.DesktopAppActivation["Service"]),
          Effect.provideService(DesktopRendererHistory.DesktopRendererHistory, {
            shutdown: Deferred.succeed(historyStarted, undefined).pipe(
              Effect.andThen(Deferred.await(releaseHistory)),
              Effect.asVoid,
            ),
          } as DesktopRendererHistory.DesktopRendererHistory["Service"]),
        );
      const app = yield* runApp.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(BrowserImport.BrowserImport, {}),
            Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {}),
            Layer.mock(DesktopBackendConfiguration.DesktopBackendConfiguration, {}),
            Layer.mock(DesktopCliCommand.DesktopCliCommand, {}),
            Layer.mock(DesktopClientSettings.DesktopClientSettings, {}),
            Layer.mock(DesktopConnectionCatalogStore.DesktopConnectionCatalogStore, {}),
            Layer.mock(DesktopIpc.DesktopIpc, {}),
            Layer.mock(DesktopLocalEnvironmentAuth.DesktopLocalEnvironmentAuth, {}),
            Layer.mock(DesktopManagedPolicy.DesktopManagedPolicy, {}),
            Layer.mock(DesktopSshEnvironment.DesktopSshEnvironment, {}),
            Layer.mock(DesktopSshPasswordPrompts.DesktopSshPasswordPrompts, {}),
            Layer.mock(DesktopTelemetryPublisher.DesktopTelemetryPublisher, {}),
            Layer.mock(DesktopTray.DesktopTray, {
              markQuitRequested: () => {
                throw new Error("unexpected tray quit request");
              },
              shouldHideOnClose: () => {
                throw new Error("unexpected tray close policy lookup");
              },
            }),
            Layer.mock(DesktopWebLinks.DesktopWebLinks, {}),
            Layer.mock(DesktopWslEnvironment.DesktopWslEnvironment, {}),
            Layer.mock(ElectronMenu.ElectronMenu, {}),
            Layer.mock(ElectronShell.ElectronShell, {}),
            Layer.mock(ElectronTheme.ElectronTheme, {}),
            Layer.mock(ElectronWindow.ElectronWindow, {}),
            Layer.mock(MacPermissions.MacPermissions, {}),
            Layer.mock(PreviewManager.PreviewManager, {
              isBrowserPartition: () => {
                throw new Error("unexpected browser partition lookup");
              },
            }),
            FileSystem.layerNoop({}),
            Layer.mock(NetService.NetService, {}),
            Path.layer,
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make(() => Effect.die("unexpected HTTP request")),
            ),
          ),
        ),
        Effect.forkScoped,
      );
      yield* Deferred.await(registrationStarted);
      yield* Deferred.await(windowStarted);
      assert.deepEqual(events, ["identity", "ready", "identity", "backend", "window"]);
      assert.isFalse(yield* Deferred.isDone(registrationStopped));
      const shutdown = yield* DesktopShutdown.DesktopShutdown;
      yield* shutdown.request;
      yield* Deferred.await(firstStopStarted);
      yield* Deferred.await(secondStopStarted);
      assert.isFalse(yield* Deferred.isDone(historyStarted));
      assert.isFalse(yield* shutdown.isComplete);
      yield* Deferred.succeed(releaseStops, undefined);
      yield* Deferred.await(historyStarted);
      assert.isFalse(yield* shutdown.isComplete);
      yield* Deferred.succeed(releaseHistory, undefined);
      const result = yield* Fiber.await(app);
      assert.equal(Exit.isFailure(result), stopDefect);
      assert.isTrue(yield* shutdown.isComplete);
      assert.isTrue(yield* Deferred.isDone(registrationStopped));
    }).pipe(Effect.provide(DesktopShutdown.layer)),
);

it.effect.each([
  { appLocale: "zh-CN", source: "saved", osLocale: "en-US", chinese: true },
  { appLocale: "en", source: "saved", osLocale: "zh-CN", chinese: false },
  { appLocale: "system", source: "saved", osLocale: "zh-SG", chinese: true },
  { appLocale: "system", source: "absent", osLocale: "zh-CN", chinese: true },
  { appLocale: "system", source: "failed", osLocale: "zh-CN", chinese: true },
  { appLocale: "system", source: "defect", osLocale: "zh-CN", chinese: true },
  { appLocale: "system", source: "absent", osLocale: "unavailable", chinese: false },
] as const)(
  "reports fatal startup failures safely with $source settings and $osLocale",
  ({ appLocale, source, osLocale, chinese }) =>
    Effect.gen(function* () {
      const events: string[] = [];
      const boxes: Array<{ title: string; content: string }> = [];
      const error = new Error("ENOENT /tmp/t3/state.json");
      error.stack = "Error: ENOENT /tmp/t3/state.json\n    at bootstrap (main.cjs:1:2)";
      const run = Effect.gen(function* () {
        yield* DesktopApp.handleFatalStartupError("bootstrap", error);
        yield* DesktopApp.handleFatalStartupError("whenReady", error);
        assert.equal(boxes.length, 1);
        assert.equal(boxes[0]?.title, chinese ? "T3 Code 启动失败" : "T3 Code failed to start");
        assert.equal(
          boxes[0]?.content,
          `${chinese ? "阶段：" : "Stage: "}bootstrap\n${error.message}\n${error.stack}`,
        );
        assert.deepEqual(events, ["dialog", "shutdown", "quit", "shutdown", "quit"]);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            DesktopState.layer,
            Layer.mock(DesktopShutdown.DesktopShutdown)({
              request: Effect.sync(() => {
                events.push("shutdown");
              }),
            }),
            Layer.mock(ElectronApp.ElectronApp)({
              systemLocale:
                osLocale === "unavailable"
                  ? Effect.die("OS locale unavailable")
                  : Effect.succeed(osLocale),
              quit: Effect.sync(() => {
                events.push("quit");
              }),
            }),
            Layer.mock(ElectronDialog.ElectronDialog)({
              showErrorBox: (title, content) =>
                Effect.sync(() => {
                  boxes.push({ title, content });
                  events.push("dialog");
                }),
            }),
          ),
        ),
      );
      if (source === "absent") yield* run;
      else
        yield* run.pipe(
          Effect.provide(
            Layer.mock(DesktopClientSettings.DesktopClientSettings)({
              get:
                source === "failed"
                  ? Effect.fail(
                      new DesktopClientSettings.DesktopClientSettingsReadError({
                        operation: "read-file",
                        path: "/tmp/client-settings.json",
                        cause: "unavailable",
                      }),
                    )
                  : source === "defect"
                    ? Effect.die("settings unavailable")
                    : Effect.succeedSome({ ...DEFAULT_CLIENT_SETTINGS, appLocale }),
            }),
          ),
        );
    }),
);

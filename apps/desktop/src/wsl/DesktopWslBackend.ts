import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import * as NetService from "@t3tools/shared/Net";

import * as DesktopObservability from "../app/DesktopObservability.ts";
import * as DesktopBackendConfiguration from "../backend/DesktopBackendConfiguration.ts";
import * as DesktopBackendPool from "../backend/DesktopBackendPool.ts";
import * as DesktopServerExposure from "../backend/DesktopServerExposure.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopWslEnvironment from "./DesktopWslEnvironment.ts";
import * as DesktopClientSettings from "../settings/DesktopClientSettings.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import { readDesktopLocale } from "../settings/DesktopLocale.ts";
import {
  localizeWslFailureReason,
  wslFailureReason,
  type WslFailureReason,
} from "./WslPreflightMessages.ts";

export const WSL_INSTANCE_ID_PREFIX = "wsl:";
const WSL_DEFAULT_DISTRO_ID = `${WSL_INSTANCE_ID_PREFIX}default`;
const MAX_TCP_PORT = 65_535;

export class DesktopWslBackend extends Context.Service<
  DesktopWslBackend,
  {
    readonly reconcile: Effect.Effect<void>;
    readonly lastPreflightError: Effect.Effect<Option.Option<string>>;
  }
>()("@t3tools/desktop/wsl/DesktopWslBackend") {}

const { logInfo: logWslBackendInfo, logWarning: logWslBackendWarning } =
  DesktopObservability.makeComponentLogger("desktop-wsl-backend");

const resolveTargetInstanceId = (distro: string | null): DesktopBackendPool.BackendInstanceId =>
  DesktopBackendPool.BackendInstanceId(
    distro === null ? WSL_DEFAULT_DISTRO_ID : `${WSL_INSTANCE_ID_PREFIX}${distro}`,
  );

const isWslInstanceId = (id: DesktopBackendPool.BackendInstanceId): boolean =>
  id.startsWith(WSL_INSTANCE_ID_PREFIX);

const buildLabel = (distro: string | null): string =>
  distro === null ? "WSL (default distro)" : `WSL (${distro})`;

// WSL auto-forwards loopback ports, so only IPv4 loopback availability matters.
const scanForWslPort = Effect.fn("desktop.wslBackend.scanForWslPort")(function* (
  startPort: number,
): Effect.fn.Return<number, NetService.NetError, NetService.NetService> {
  const net = yield* NetService.NetService;
  for (let port = startPort; port <= MAX_TCP_PORT; port += 1) {
    if (yield* net.canListenOnHost(port, "127.0.0.1")) {
      return port;
    }
  }
  return yield* new NetService.NetError({
    message: `No loopback port available for WSL backend between ${startPort} and ${MAX_TCP_PORT}.`,
  });
});

export const layer = Layer.effect(
  DesktopWslBackend,
  Effect.gen(function* () {
    const pool = yield* DesktopBackendPool.DesktopBackendPool;
    const configuration = yield* DesktopBackendConfiguration.DesktopBackendConfiguration;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const wslEnvironment = yield* DesktopWslEnvironment.DesktopWslEnvironment;
    const appSettings = yield* DesktopAppSettings.DesktopAppSettings;
    const net = yield* NetService.NetService;
    const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
    const electronApp = yield* ElectronApp.ElectronApp;
    const getLocale = readDesktopLocale(clientSettings.get, electronApp.systemLocale);
    // Serialize bootstrap and IPC reconciles so concurrent reads cannot register competing WSL instances.
    const reconcileMutex = yield* Semaphore.make(1);

    const preflightErrorRef = yield* Ref.make(Option.none<WslFailureReason>());
    const ownershipRefusedRef = yield* Ref.make(
      Option.none<DesktopBackendPool.BackendInstanceId>(),
    );

    const findExistingWslInstance = pool.list.pipe(
      Effect.map((instances) => instances.find((instance) => isWslInstanceId(instance.id))),
      Effect.map(Option.fromNullishOr),
    );

    const stopExisting = (id: DesktopBackendPool.BackendInstanceId) =>
      pool.unregister(id).pipe(
        Effect.catchTags({
          DesktopBackendPoolCannotUnregisterPrimaryError: (cause) =>
            logWslBackendWarning("refusing to unregister primary as wsl instance", {
              id,
              error: cause.message,
            }),
        }),
      );

    const startNew = Effect.fn("desktop.wslBackend.startNew")(function* (input: {
      readonly distro: string | null;
    }) {
      const primaryConfig = yield* serverExposure.backendConfig;
      const port = yield* scanForWslPort(primaryConfig.port + 1).pipe(
        Effect.provideService(NetService.NetService, net),
        Effect.asSome,
        Effect.catch((error) =>
          logWslBackendWarning("could not allocate port for WSL backend", {
            error: error.message,
          }).pipe(Effect.as(Option.none<number>())),
        ),
      );

      if (Option.isNone(port)) {
        return;
      }
      const allocatedPort = port.value;

      const targetId = resolveTargetInstanceId(input.distro);
      yield* logWslBackendInfo("registering WSL backend with pool", {
        id: targetId,
        port: allocatedPort,
        distro: input.distro ?? null,
      });

      const instance = yield* pool
        .register({
          id: targetId,
          label: Effect.succeed(buildLabel(input.distro)),
          configResolve: configuration.resolveWsl({ port: allocatedPort, distro: input.distro }),
          onPreflightFailed: (failure) =>
            Ref.set(preflightErrorRef, Option.some(failure)).pipe(Effect.as(false)),
          onStateDirOwned: () =>
            Ref.set(ownershipRefusedRef, Option.some(targetId)).pipe(
              Effect.andThen(
                Ref.set(
                  preflightErrorRef,
                  Option.some(
                    wslFailureReason(
                      "Another T3 Code server is using this distro's T3 home, or an older background service is set up for it. Stop that server or pair with it, or try `t3 update` in the distro. If the older launcher cannot update, run `t3 service uninstall` and optionally reinstall with `t3 service install` from a current CLI in the distro. Use `npx t3@latest` if `t3` is missing or outdated, and pass `--base-dir` with the service's T3 home to each command.",
                      "其他 T3 Code 服务器正在使用此发行版的 T3 主目录，或此目录已配置旧版后台服务。请停止该服务器或与其配对，或在发行版中尝试运行 `t3 update`。如果旧版启动器无法更新，请运行 `t3 service uninstall`，并按需使用发行版中当前版本的 CLI 运行 `t3 service install` 重新安装。如果 `t3` 不存在或版本过旧，请使用 `npx t3@latest`，并为每条命令添加 `--base-dir` 参数，指定该服务的 T3 主目录。",
                    ),
                  ),
                ),
              ),
            ),
          onReady: () =>
            Ref.set(ownershipRefusedRef, Option.none()).pipe(
              Effect.andThen(Ref.set(preflightErrorRef, Option.none())),
            ),
        })
        .pipe(
          Effect.asSome,
          Effect.catch((error) =>
            logWslBackendWarning("WSL backend already registered, skipping start", {
              id: targetId,
              error: error.message,
            }).pipe(Effect.as(Option.none<DesktopBackendPool.DesktopBackendInstance>())),
          ),
        );

      yield* Option.match(instance, {
        onNone: () => Effect.void,
        onSome: (registered) => registered.start,
      });
    });

    const reconcileBody = Effect.gen(function* () {
      const settings = yield* appSettings.get;
      if (!settings.localEnvironmentEnabled) return;
      const available = yield* wslEnvironment.isAvailable;
      const existing = yield* findExistingWslInstance;
      const existingId = Option.map(existing, (instance) => instance.id);

      // In wsl-only mode WSL is already primary; do not start a second backend on the same distro.
      const shouldRun = settings.wslBackendEnabled && available && !settings.wslOnly;
      const targetId = shouldRun
        ? Option.some(resolveTargetInstanceId(settings.wslDistro))
        : Option.none<DesktopBackendPool.BackendInstanceId>();

      if (Option.isNone(targetId) && Option.isNone(existingId)) {
        return;
      }
      if (
        Option.isSome(targetId) &&
        Option.isSome(existing) &&
        targetId.value === existing.value.id
      ) {
        const existingInstance = existing.value;
        const snapshot = yield* existingInstance.snapshot;
        const isIdle =
          !snapshot.ready && Option.isNone(snapshot.activePid) && !snapshot.restartScheduled;
        if (isIdle) {
          const refused = yield* Ref.get(ownershipRefusedRef);
          if (Option.isSome(refused) && refused.value === existingInstance.id) return;
          yield* logWslBackendInfo("retrying idle WSL backend", { id: existingInstance.id });
          yield* Ref.set(preflightErrorRef, Option.none());
          yield* existingInstance.start;
        }
        return;
      }

      yield* Ref.set(preflightErrorRef, Option.none());
      yield* Ref.set(ownershipRefusedRef, Option.none());

      if (Option.isSome(existingId)) {
        yield* logWslBackendInfo("tearing down WSL backend", { id: existingId.value });
        yield* stopExisting(existingId.value);
      }

      if (Option.isSome(targetId)) {
        // Pre-warm WSL so readiness cannot race its cold start.
        yield* wslEnvironment.preWarm(settings.wslDistro);
        yield* startNew({ distro: settings.wslDistro });
      }
    });

    const reconcile = reconcileMutex
      .withPermits(1)(reconcileBody)
      .pipe(
        Effect.catchCause((cause) =>
          logWslBackendWarning("reconcile failed", { cause: Cause.pretty(cause) }),
        ),
        Effect.withSpan("desktop.wslBackend.reconcile"),
      );

    return DesktopWslBackend.of({
      reconcile,
      lastPreflightError: Effect.gen(function* () {
        const failure = yield* Ref.get(preflightErrorRef);
        if (Option.isNone(failure)) return Option.none<string>();
        const locale = yield* getLocale;
        return Option.some(localizeWslFailureReason(failure.value, locale));
      }),
    });
  }),
);

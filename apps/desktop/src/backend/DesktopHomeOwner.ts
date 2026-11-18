// @effect-diagnostics nodeBuiltinImport:off - Probes the server's native SQLite ownership lock.
import * as NodeSqlite from "node:sqlite";

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { BACKEND_QUIT_STOP_TIMEOUT } from "./DesktopBackendManager.ts";

// The fields of the server's `server-runtime.json` that identify the owner of a T3 home.
const HomeOwnerRuntimeState = Schema.Struct({
  pid: Schema.Int,
  port: Schema.Int,
  serviceManaged: Schema.optional(Schema.Boolean),
  serverVersion: Schema.optional(Schema.String),
});
export type HomeOwner = typeof HomeOwnerRuntimeState.Type;

const decodeHomeOwner = Schema.decodeUnknownOption(Schema.fromJsonString(HomeOwnerRuntimeState));

/** Signal 0 only probes existence; EPERM still means alive. */
const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

/**
 * Whether a server holds the T3 home's ownership lock (an exclusive transaction on
 * `server-owner.sqlite`). A read-only read is refused with SQLITE_BUSY only while it is held.
 */
const isHomeOwnershipLocked = Effect.fn("DesktopHomeOwner.isHomeOwnershipLocked")(function* () {
  const path = yield* Path.Path;
  const { stateDir } = yield* DesktopEnvironment.DesktopEnvironment;
  const lockPath = path.join(stateDir, "server-owner.sqlite");
  return yield* Effect.sync(() => {
    try {
      const db = new NodeSqlite.DatabaseSync(lockPath, { readOnly: true });
      try {
        db.exec("PRAGMA busy_timeout = 0");
        db.prepare("SELECT count(*) FROM sqlite_master").get();
        return false;
      } finally {
        db.close();
      }
    } catch (cause) {
      // Anything but SQLITE_BUSY (a missing file included) leaves the decision to the backend.
      return cause instanceof Error && "errcode" in cause && cause.errcode === 5;
    }
  });
});

// A quitting app's backend holds the lock until it exits, which can outlast the relaunch of an update.
const HOME_OWNERSHIP_RELEASE_GRACE = Duration.sum(BACKEND_QUIT_STOP_TIMEOUT, Duration.seconds(3));
const HOME_OWNERSHIP_RELEASE_POLL_INTERVAL = Duration.millis(250);

/** Whether the ownership lock is free, or frees within the grace a shutting-down server needs. */
export const awaitHomeOwnershipRelease = Effect.fn("DesktopHomeOwner.awaitHomeOwnershipRelease")(
  function* () {
    while (yield* isHomeOwnershipLocked()) {
      yield* Effect.sleep(HOME_OWNERSHIP_RELEASE_POLL_INTERVAL);
    }
    return true;
  },
  Effect.timeoutOrElse({
    duration: HOME_OWNERSHIP_RELEASE_GRACE,
    orElse: () => Effect.succeed(false),
  }),
);

/** The live server recorded as owning the desktop's T3 home. Only call once the ownership lock is known held: a live PID alone may be reused. */
export const readLiveHomeOwner = Effect.fn("DesktopHomeOwner.readLiveHomeOwner")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { stateDir } = yield* DesktopEnvironment.DesktopEnvironment;
  const raw = yield* fs
    .readFileString(path.join(stateDir, "server-runtime.json"))
    .pipe(Effect.option);
  return Option.flatMap(raw, decodeHomeOwner).pipe(
    Option.filter((owner) => isProcessAlive(owner.pid)),
  );
});

export const homeOwnedMessage = (
  owner: Option.Option<HomeOwner>,
  locale: "en" | "zh-CN" = "en",
): string =>
  Option.match(owner, {
    onNone: () =>
      locale === "zh-CN"
        ? "另一个 T3 Code 服务（例如后台服务）正在使用此数据目录，或旧版后台服务仍关联该目录。请停止该服务或尝试 `t3 update`。若旧启动器无法更新，请运行 `t3 service uninstall`，必要时通过新版 CLI 的 `t3 service install` 重新安装。如果 `t3` 缺失或过旧，可使用 `npx t3@latest`，并为每条命令传入指向该服务 T3 主目录的 `--base-dir`。然后重新打开 T3 Code。也可以设置独立的 T3CODE_HOME，再与运行中的服务配对。"
        : "Another T3 Code server, such as the background service, is using this data directory, or an older background service is set up for it. Stop that server or try `t3 update`. If the older launcher cannot update, run `t3 service uninstall` and optionally reinstall with `t3 service install` from a current CLI. Use `npx t3@latest` if `t3` is missing or outdated, and pass `--base-dir` with the service's T3 home to each command. Then reopen T3 Code. You can also set a separate T3CODE_HOME and pair with the running server.",
    onSome: (owner) => {
      if (locale === "zh-CN") {
        const kind = owner.serviceManaged
          ? "T3 Code 后台服务"
          : "另一个 T3 Code 服务（例如 `t3 serve` 或通过 SSH 启动的服务）";
        const version = owner.serverVersion ? `，版本 ${owner.serverVersion}` : "";
        const stop = owner.serviceManaged
          ? "请运行 `t3 service uninstall`，并通过 `--base-dir` 指定此 T3 主目录来停止它"
          : "如果其他机器上的 T3 Code 应用通过 SSH 启动了它，该应用会重新启动服务：请先在该应用中移除或断开此 SSH 环境，或退出该应用，然后停止服务";
        return `${kind}正在使用此 T3 主目录（PID ${owner.pid}，端口 ${owner.port}${version}）。${stop}，然后重新打开 T3 Code。也可以设置独立的 T3CODE_HOME，再与运行中的服务配对。`;
      }

      const kind = owner.serviceManaged
        ? "The T3 Code background service"
        : "Another T3 Code server (for example `t3 serve`, or one started over SSH)";
      const version = owner.serverVersion ? `, version ${owner.serverVersion}` : "";
      const stop = owner.serviceManaged
        ? "Stop it with `t3 service uninstall`, passing `--base-dir` with this T3 home"
        : "If a T3 Code app on another machine started it over SSH, that app restarts it: remove or disconnect that SSH environment there, or quit that app. Then stop the server";
      return `${kind} is using this T3 home (PID ${owner.pid}, port ${owner.port}${version}). ${stop}, and reopen T3 Code. You can also set a separate T3CODE_HOME and pair with the running server.`;
    },
  });

import {
  ServerSelfUpdateError,
  type UpdateFailureReasonMessage,
  type DesktopUpdateState,
  type DesktopUpdateStatusReport,
  type ServerSelfUpdateProgressStage,
  type ServerSelfUpdateResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as DesktopTelemetryReceiver from "../resourceTelemetry/DesktopTelemetryReceiver.ts";

const DESKTOP_UPDATE_TIMEOUT = Duration.minutes(20);
const DESKTOP_INSTALL_TIMEOUT = Duration.minutes(2);

function desktopUpdateProgressStage(
  state: DesktopUpdateState,
): ServerSelfUpdateProgressStage | null {
  switch (state.status) {
    case "checking":
    case "available":
    case "downloading":
      return "downloading";
    case "downloaded":
      return "installing";
    default:
      return null;
  }
}

export class DesktopAppUpdate extends Context.Service<
  DesktopAppUpdate,
  {
    readonly available: boolean;
    readonly run: (
      reportProgress: (
        stage: ServerSelfUpdateProgressStage,
      ) => Effect.Effect<void, ServerSelfUpdateError>,
      trackSwitch?: DesktopTelemetryReceiver.DesktopTrackSwitch,
    ) => Effect.Effect<ServerSelfUpdateResult, ServerSelfUpdateError>;
    /** Success stops the server; returns only on installation failure or timeout. */
    readonly commit: (
      requestId: string,
      onHandoffAccepted?: () => Effect.Effect<void>,
    ) => Effect.Effect<never, ServerSelfUpdateError>;
  }
>()("t3/desktopUpdate/DesktopAppUpdate") {}

export const make = Effect.fn("desktopUpdate.desktopAppUpdate.make")(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const random = yield* SecureRandom.SecureRandom;
  const receiver = yield* DesktopTelemetryReceiver.DesktopTelemetryReceiver;
  const inFlight = yield* Ref.make(false);

  const available = config.mode === "desktop" && config.desktopTelemetryControlFd !== undefined;
  const failWith = (reason: string, reasonMessage?: UpdateFailureReasonMessage, cause?: unknown) =>
    new ServerSelfUpdateError({
      reason,
      ...(reasonMessage === undefined ? {} : { reasonMessage }),
      ...(cause === undefined ? {} : { cause }),
    });

  const consumeReports = Effect.fn("DesktopAppUpdate.consumeReports")(function* (
    requestId: string,
    changes: Stream.Stream<DesktopUpdateStatusReport>,
    reportProgress: (
      stage: ServerSelfUpdateProgressStage,
    ) => Effect.Effect<void, ServerSelfUpdateError>,
    trackSwitch: boolean,
  ) {
    const lastStage = yield* Ref.make<ServerSelfUpdateProgressStage | null>(null);
    const emitStage = (
      stage: ServerSelfUpdateProgressStage | null,
    ): Effect.Effect<void, ServerSelfUpdateError> =>
      stage === null
        ? Effect.void
        : Ref.get(lastStage).pipe(
            Effect.flatMap((previous) =>
              previous === stage
                ? Effect.void
                : Ref.set(lastStage, stage).pipe(Effect.andThen(reportProgress(stage))),
            ),
          );

    const terminal = yield* changes.pipe(
      Stream.filter((report) => report.requestId === requestId),
      Stream.mapEffect(
        (report): Effect.Effect<Option.Option<DesktopUpdateStatusReport>, ServerSelfUpdateError> =>
          report.outcome === undefined
            ? emitStage(desktopUpdateProgressStage(report.state)).pipe(
                Effect.as(Option.none<DesktopUpdateStatusReport>()),
              )
            : Effect.succeedSome(report),
      ),
      Stream.filterMap(
        Option.match({
          onNone: () => Result.failVoid,
          onSome: Result.succeed,
        }),
      ),
      Stream.runHead,
    );
    if (Option.isNone(terminal)) {
      return yield* failWith("The desktop app stopped reporting its update.", {
        code: "update-report-stopped",
      });
    }

    const report = terminal.value;
    if (report.outcome === "ready-to-install") {
      yield* emitStage("installing");
      const targetVersion =
        report.state.downloadedVersion ??
        report.state.availableVersion ??
        report.state.currentVersion;
      yield* Effect.logInfo("Desktop app update prepared for install.", {
        targetVersion,
      });
      yield* Ref.set(inFlight, false);
      return { targetVersion, method: "desktop-app" as const, desktopUpdateToken: requestId };
    }
    if (report.outcome === "up-to-date") {
      // A switch's host already on the newest build of its track only saved the track.
      if (trackSwitch) {
        yield* Ref.set(inFlight, false);
        return { targetVersion: report.state.currentVersion, method: "desktop-app" as const };
      }
      return yield* failWith(
        `The T3 Code desktop app on this machine is already up to date on ${report.state.currentVersion}.`,
        { code: "already-current", version: report.state.currentVersion },
      );
    }
    return yield* failWith(
      report.reason ?? report.state.message ?? "The desktop app update failed.",
      report.reason !== undefined
        ? report.reasonMessage
        : report.state.message == null
          ? { code: "update-failed" }
          : undefined,
    );
  });

  const run: DesktopAppUpdate["Service"]["run"] = Effect.fn("desktopUpdate.desktopAppUpdate.run")(
    function* (reportProgress, trackSwitch) {
      if (!available) {
        return yield* failWith(
          "This server was not started by the T3 Code desktop app, so it cannot drive a desktop update.",
          { code: "not-desktop-launched" },
        );
      }
      if (yield* Ref.getAndSet(inFlight, true)) {
        return yield* failWith("A desktop app update is already in progress.", {
          code: "update-in-progress",
        });
      }

      return yield* Effect.scoped(
        Effect.gen(function* () {
          const requestId = yield* random
            .uuidV4()
            .pipe(
              Effect.mapError((error) =>
                failWith(
                  "Could not generate a desktop update request id.",
                  { code: "request-id-failed" },
                  error,
                ),
              ),
            );
          // Subscribe before requesting to catch fast reports.
          const { changes } = yield* receiver.desktopUpdates;
          yield* receiver
            .requestDesktopUpdate(requestId, trackSwitch)
            .pipe(
              Effect.mapError((error) =>
                failWith(
                  "Could not reach the T3 Code desktop app on this machine.",
                  { code: "app-unreachable-on-machine" },
                  error,
                ),
              ),
            );
          return yield* consumeReports(
            requestId,
            changes,
            reportProgress,
            trackSwitch !== undefined,
          ).pipe(
            Effect.onInterrupt(() => receiver.cancelDesktopUpdate(requestId).pipe(Effect.ignore)),
          );
        }),
      ).pipe(
        Effect.timeout(DESKTOP_UPDATE_TIMEOUT),
        Effect.catchTags({
          TimeoutError: () =>
            failWith("The desktop app did not finish the update in time.", {
              code: "update-timeout",
            }),
        }),
        Effect.onError(() => Ref.set(inFlight, false)),
      );
    },
  );

  const commit: DesktopAppUpdate["Service"]["commit"] = Effect.fn(
    "desktopUpdate.desktopAppUpdate.commit",
  )(function* (requestId, onHandoffAccepted = () => Effect.void) {
    if (!available) {
      return yield* failWith("This server cannot commit a desktop app update.", {
        code: "commit-unavailable",
      });
    }
    const terminal = yield* Effect.scoped(
      Effect.gen(function* () {
        const { latest, changes } = yield* receiver.desktopUpdates;
        const reports = Option.match(latest, {
          onNone: () => changes,
          onSome: (report) => Stream.concat(Stream.make(report), changes),
        });
        yield* Effect.uninterruptible(
          receiver.commitDesktopUpdate(requestId).pipe(
            Effect.mapError((error) =>
              failWith(
                "Could not reach the T3 Code desktop app.",
                { code: "app-unreachable" },
                error,
              ),
            ),
            Effect.tap(() => onHandoffAccepted()),
          ),
        );
        return yield* reports.pipe(
          Stream.filter((report) => report.requestId === requestId && report.outcome === "failed"),
          Stream.runHead,
          Effect.timeout(DESKTOP_INSTALL_TIMEOUT),
          Effect.catchTags({
            TimeoutError: () =>
              failWith("The desktop app did not report an install result in time.", {
                code: "install-result-timeout",
              }),
          }),
        );
      }),
    );
    if (Option.isNone(terminal)) {
      return yield* failWith("The desktop app stopped reporting the install.", {
        code: "install-report-stopped",
      });
    }
    return yield* failWith(
      terminal.value.reason ??
        terminal.value.state.message ??
        "The desktop app failed to install the update.",
      terminal.value.reason !== undefined
        ? terminal.value.reasonMessage
        : terminal.value.state.message == null
          ? { code: "install-failed" }
          : undefined,
    );
  });

  return DesktopAppUpdate.of({ available, run, commit });
});

export const layer = Layer.effect(DesktopAppUpdate, make());

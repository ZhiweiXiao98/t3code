import {
  providerAuthMessage,
  providerAuthErrorFields,
  providerAuthErrorMessage,
  type ProviderAuthMessage,
  type ProviderAuthMessageCode,
} from "@t3tools/contracts";
import {
  ProviderSetupError,
  type ProviderAuthState,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as AcpErrors from "effect-acp/errors";

import type * as AcpSessionRuntime from "@t3tools/provider-acp/server/AcpSessionRuntime";
import {
  parseAntigravityAuthorizationUrl,
  type AntigravityAuthorizationUrl,
} from "./antigravityAuthSupport.ts";
import {
  forwardAntigravityCallback,
  validateAntigravityCallbackUrl,
} from "./antigravityCallback.ts";
import type { ProviderAuthController } from "./ProviderAuthService.ts";

const AUTH_TIMEOUT_MS = 300_000;
// Once initialized, a healthy agent shows the Google link or finishes within seconds. Its bundled
// Python has no IPv4 fallback race, so a host with broken IPv6 waits about two minutes per Google
// request. The hint is timed from initialize, not spawn: the one-file runtime unpacks itself on
// every launch, which can take about a minute on Windows before it answers at all.
const NO_RESPONSE_HINT_MS = 30_000;
const isSetupError = Schema.is(ProviderSetupError);
const isAcpRequestError = Schema.is(AcpErrors.AcpRequestError);

interface AuthSnapshot {
  readonly ownerSessionId: string | null;
  readonly state: ProviderAuthState;
}

interface AuthFlow {
  readonly id: string;
  readonly ownerSessionId: string;
  readonly expiresAtMillis: number;
  state: ProviderAuthState;
  pending: AntigravityAuthorizationUrl | undefined;
  callbackSent: boolean;
  fiber: Fiber.Fiber<void> | undefined;
  forwarding: Fiber.Fiber<void, ProviderSetupError> | undefined;
}

interface OwnedProcess {
  readonly stop: Effect.Effect<void>;
  startup: Fiber.Fiber<unknown, unknown> | undefined;
}

export interface AntigravityAuth {
  readonly controller: ProviderAuthController;
  readonly withProcess: <A, E, R>(
    stop: Effect.Effect<void>,
    task: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | ProviderSetupError, R | Scope.Scope>;
}

export type AntigravityAuthRuntime = Pick<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  "initialize" | "start" | "request"
>;

export interface AntigravityAuthOptions<
  Runtime extends AntigravityAuthRuntime = AcpSessionRuntime.AcpSessionRuntime["Service"],
> {
  readonly instanceId: ProviderInstanceId;
  readonly makeRuntime: (input: {
    readonly onAuthorizationUrl?: (url: string) => Effect.Effect<void, AcpErrors.AcpError>;
  }) => Effect.Effect<Runtime, AcpErrors.AcpError | ProviderSetupError, Scope.Scope>;
  readonly onAuthenticated: (
    result: AcpSessionRuntime.AcpSessionRuntimeStartResult,
    runtime: Runtime,
  ) => Effect.Effect<void>;
  readonly onSignedOut: Effect.Effect<void>;
  readonly forwardCallback?: (callback: URL) => Effect.Effect<void, ProviderSetupError>;
  readonly usesBrowser?: boolean;
}

function visibleSnapshot(snapshot: AuthSnapshot, ownerSessionId: string): ProviderAuthState {
  if (snapshot.ownerSessionId === null || snapshot.ownerSessionId === ownerSessionId) {
    return snapshot.state;
  }
  const busy = ["starting", "waiting", "verifying"].includes(snapshot.state.phase);
  return {
    ...snapshot.state,
    flowId: null,
    authorizationUrl: null,
    interaction: null,
    expiresAt: null,
    ...(busy ? providerAuthMessage("auth.otherClient") : {}),
  };
}

function safeAuthFailure(cause: Cause.Cause<unknown>, usesBrowser: boolean): ProviderAuthMessage {
  const error = Cause.findErrorOption(cause);
  if (Option.isSome(error)) {
    if (isSetupError(error.value)) {
      return providerAuthErrorMessage(error.value);
    }
    if (isAcpRequestError(error.value)) {
      if (error.value.errorMessage.includes("SUBSCRIPTION_REQUIRED")) {
        return providerAuthMessage("antigravity.subscriptionRequired");
      }
      if (/access_denied|denied access|cancelled/i.test(error.value.errorMessage)) {
        return providerAuthMessage("antigravity.notApproved");
      }
      if (error.value.method === "session/new" && error.value.code === -32603) {
        return providerAuthMessage("antigravity.sessionFailed");
      }
      if (!usesBrowser && error.value.code === -32602) {
        return providerAuthMessage("antigravity.credentialsRejected");
      }
    }
  }
  return providerAuthMessage(usesBrowser ? "antigravity.failed" : "antigravity.credentialsFailed");
}

export const makeAntigravityAuth = Effect.fn("makeAntigravityAuth")(function* <
  Runtime extends AntigravityAuthRuntime,
>(
  options: AntigravityAuthOptions<Runtime>,
): Effect.fn.Return<AntigravityAuth, never, SecureRandom.SecureRandom | Scope.Scope> {
  const random = yield* SecureRandom.SecureRandom;
  const instanceScope = yield* Scope.Scope;
  const usesBrowser = options.usesBrowser ?? true;
  const lock = yield* Semaphore.make(1);
  const closed = yield* Deferred.make<void>();
  const emptyState: ProviderAuthState = {
    instanceId: options.instanceId,
    phase: "idle",
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    message: null,
  };
  const snapshot = yield* SubscriptionRef.make<AuthSnapshot>({
    ownerSessionId: null,
    state: emptyState,
  });
  const processes = new Set<OwnedProcess>();
  let activeFlow: AuthFlow | undefined;
  let operation: "idle" | "auth" | "logout" | "cancel" | "closed" = "idle";

  const setupError = (name: string, code: ProviderAuthMessageCode) =>
    new ProviderSetupError({
      instanceId: options.instanceId,
      operation: name,
      ...providerAuthErrorFields(code),
    });
  const currentState = (ownerSessionId: string) =>
    SubscriptionRef.get(snapshot).pipe(
      Effect.map((value) => visibleSnapshot(value, ownerSessionId)),
    );
  const publishFlow = (flow: AuthFlow, state: ProviderAuthState) => {
    flow.state = state;
    return SubscriptionRef.set(snapshot, { ownerSessionId: flow.ownerSessionId, state });
  };
  const stopOwnedProcesses = Effect.suspend(() =>
    Effect.forEach(
      Array.from(processes),
      (owned) =>
        Effect.gen(function* () {
          if (owned.startup) {
            yield* Fiber.interrupt(owned.startup);
          }
          yield* owned.stop;
        }),
      { discard: true, concurrency: "unbounded" },
    ),
  );

  const withProcess: AntigravityAuth["withProcess"] = (stop, task) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const scope = yield* Scope.Scope;
        const owned: OwnedProcess = { stop, startup: undefined };
        const fiber = yield* lock.withPermits(1)(
          Effect.gen(function* () {
            if (operation !== "idle") {
              return yield* setupError("startProcess", "antigravity.changing");
            }
            processes.add(owned);
            yield* Scope.addFinalizer(
              scope,
              Effect.sync(() => {
                processes.delete(owned);
              }),
            );
            const child = yield* restore(task).pipe(Effect.forkIn(scope));
            owned.startup = child;
            return child;
          }),
        );
        // Propagate interruption after the exit wait so concurrent stop waiters stay attached.
        return yield* restore(Fiber.await(fiber)).pipe(
          Effect.flatten,
          Effect.ensuring(Fiber.interrupt(fiber)),
          Effect.ensuring(
            Effect.sync(() => {
              owned.startup = undefined;
            }),
          ),
        );
      }),
    );

  const finishFlow = (flow: AuthFlow, result: Exit.Exit<void, unknown>) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        if (activeFlow !== flow) return;
        activeFlow = undefined;
        operation = "idle";
        flow.pending = undefined;
        yield* publishFlow(flow, {
          ...flow.state,
          phase: Exit.isSuccess(result) ? "succeeded" : "failed",
          authorizationUrl: null,
          expiresAt: null,
          ...(Exit.isSuccess(result)
            ? providerAuthMessage(usesBrowser ? "antigravity.signedIn" : "antigravity.connected")
            : safeAuthFailure(result.cause, usesBrowser)),
        });
      }),
    );

  const receiveAuthorizationUrl = (flow: AuthFlow, url: string) =>
    parseAntigravityAuthorizationUrl(url).pipe(
      Effect.flatMap((authorization) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            if (activeFlow !== flow || operation !== "auth") return;
            if (flow.pending) {
              if (flow.pending.authorizationUrl === authorization.authorizationUrl) return;
              return yield* new AcpErrors.AcpTransportError({
                detail: "Antigravity started more than one Google sign-in request.",
                cause: undefined,
              });
            }
            flow.pending = authorization;
            yield* publishFlow(flow, {
              ...flow.state,
              phase: "waiting",
              authorizationUrl: authorization.authorizationUrl,
              message:
                "Open the Google sign-in link. If you are remote, paste the redirect URL here.",
              messageDescriptor: { code: "antigravity.waiting" },
            });
          }),
        ),
      ),
    );

  const runSignIn = Effect.fn("AntigravityAuth.runSignIn")(
    function* (flow: AuthFlow, stopSessions: Effect.Effect<void, ProviderSetupError>) {
      yield* stopSessions.pipe(Effect.ensuring(stopOwnedProcesses));
      const runtime = yield* options.makeRuntime({
        onAuthorizationUrl: (url) => receiveAuthorizationUrl(flow, url),
      });
      // `start` reuses this memoized handshake.
      yield* runtime.initialize();
      yield* Effect.sleep(NO_RESPONSE_HINT_MS).pipe(
        Effect.andThen(
          lock.withPermits(1)(
            Effect.gen(function* () {
              if (activeFlow !== flow || flow.state.phase !== "starting") return;
              yield* publishFlow(flow, {
                ...flow.state,
                ...providerAuthMessage("antigravity.noResponse"),
              });
            }),
          ),
        ),
        Effect.forkScoped,
      );
      const started = yield* runtime.start();
      yield* lock.withPermits(1)(
        Effect.gen(function* () {
          if (activeFlow !== flow) return;
          flow.pending = undefined;
          yield* publishFlow(flow, {
            ...flow.state,
            phase: "verifying",
            authorizationUrl: null,
            message: "Checking Antigravity access and models.",
            messageDescriptor: { code: "antigravity.checkingAccess" },
          });
        }),
      );
      yield* options.onAuthenticated(started, runtime);
    },
    (effect, flow, _stopSessions) =>
      effect.pipe(
        Effect.scoped,
        Effect.timeoutOrElse({
          duration: AUTH_TIMEOUT_MS,
          orElse: () =>
            Effect.fail(
              setupError(
                "start",
                flow.state.phase === "starting" ? "antigravity.unreachable" : "antigravity.expired",
              ),
            ),
        }),
        Effect.exit,
        Effect.flatMap((result) => finishFlow(flow, result)),
      ),
  );

  const stopFlow = (flow: AuthFlow, phase: "cancelled" | "failed", code: ProviderAuthMessageCode) =>
    Effect.uninterruptible(
      Effect.gen(function* () {
        const detached = yield* lock.withPermits(1)(
          Effect.gen(function* () {
            if (activeFlow !== flow) return false;
            activeFlow = undefined;
            operation = "cancel";
            flow.pending = undefined;
            yield* publishFlow(flow, {
              ...flow.state,
              phase,
              authorizationUrl: null,
              expiresAt: null,
              ...providerAuthMessage(code),
            });
            return true;
          }),
        );
        if (!detached) return;
        if (flow.forwarding) yield* Fiber.interrupt(flow.forwarding);
        if (flow.fiber) yield* Fiber.interrupt(flow.fiber);
        yield* lock.withPermits(1)(
          Effect.sync(() => {
            if (operation === "cancel") operation = "idle";
          }),
        );
      }),
    );

  const requireFlow = Effect.fn("AntigravityAuth.requireFlow")(function* (
    ownerSessionId: string,
    flowId: string,
    name: string,
  ) {
    const flow = activeFlow;
    if (!flow || flow.id !== flowId || flow.ownerSessionId !== ownerSessionId) {
      return yield* setupError(name, "auth.inactive");
    }
    const now = yield* Clock.currentTimeMillis;
    if (now >= flow.expiresAtMillis) {
      return yield* setupError(name, "antigravity.expired");
    }
    return flow;
  });

  const controller: ProviderAuthController = {
    start: (ownerSessionId, stopSessions = Effect.void) =>
      lock.withPermits(1)(
        Effect.uninterruptible(
          Effect.gen(function* () {
            if (activeFlow?.ownerSessionId === ownerSessionId && operation === "auth") {
              return activeFlow.state;
            }
            if (operation !== "idle") {
              return yield* setupError("start", "antigravity.busy");
            }
            const flowId = yield* random
              .uuidV4()
              .pipe(Effect.mapError(() => setupError("start", "antigravity.startFailed")));
            const expiresAtMillis = (yield* Clock.currentTimeMillis) + AUTH_TIMEOUT_MS;
            const state: ProviderAuthState = {
              ...emptyState,
              phase: "starting",
              flowId,
              expiresAt: DateTime.formatIso(DateTime.makeUnsafe(expiresAtMillis)),
              ...providerAuthMessage(
                usesBrowser ? "antigravity.starting" : "antigravity.checkingCredentials",
              ),
            };
            const flow: AuthFlow = {
              id: flowId,
              ownerSessionId,
              expiresAtMillis,
              state,
              pending: undefined,
              callbackSent: false,
              fiber: undefined,
              forwarding: undefined,
            };
            activeFlow = flow;
            operation = "auth";
            yield* publishFlow(flow, state);
            flow.fiber = yield* runSignIn(flow, stopSessions).pipe(
              Effect.interruptible,
              Effect.forkIn(instanceScope),
            );
            return state;
          }),
        ),
      ),
    complete: Effect.fn("AntigravityAuth.complete")(function* (ownerSessionId, input) {
      const pending = yield* lock.withPermits(1)(
        Effect.gen(function* () {
          const flow = yield* requireFlow(ownerSessionId, input.flowId, "complete");
          if (!flow.pending || flow.callbackSent) {
            return yield* setupError(
              "complete",
              flow.callbackSent ? "antigravity.responseSent" : "antigravity.waitForLink",
            );
          }
          const callback = yield* validateAntigravityCallbackUrl(
            options.instanceId,
            flow.pending,
            input.callbackUrl,
          );
          flow.callbackSent = true;
          yield* publishFlow(flow, {
            ...flow.state,
            phase: "verifying",
            authorizationUrl: null,
            message: "Waiting for Google to finish sign-in.",
            messageDescriptor: { code: "antigravity.waitingForGoogle" },
          });
          const forwarding = yield* (
            options.forwardCallback?.(callback) ??
            forwardAntigravityCallback(options.instanceId, callback)
          ).pipe(
            // stopFlow interrupts this fiber, so it runs from a sibling fiber.
            Effect.tapError(() =>
              stopFlow(flow, "failed", "antigravity.forwardFailed").pipe(
                Effect.forkIn(instanceScope),
              ),
            ),
            Effect.interruptible,
            Effect.forkIn(instanceScope),
          );
          flow.forwarding = forwarding;
          return { flow, forwarding };
        }),
      );
      const forwarded = yield* Fiber.await(pending.forwarding);
      if (Exit.isFailure(forwarded)) {
        return yield* setupError("complete", "antigravity.forwardFailed");
      }
      return pending.flow.state;
    }),
    cancel: Effect.fn("AntigravityAuth.cancel")(function* (ownerSessionId, flowId) {
      const flow = yield* lock.withPermits(1)(requireFlow(ownerSessionId, flowId, "cancel"));
      yield* stopFlow(flow, "cancelled", "antigravity.cancelled");
      return flow.state;
    }),
    logout: Effect.fn("AntigravityAuth.logout")(function* (stopSessions) {
      const task = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const flow = yield* lock.withPermits(1)(
            Effect.gen(function* () {
              if (operation !== "idle" && operation !== "auth") {
                return yield* setupError("logout", "antigravity.stopping");
              }
              operation = "logout";
              const currentFlow = activeFlow;
              activeFlow = undefined;
              if (currentFlow) {
                currentFlow.pending = undefined;
                yield* publishFlow(currentFlow, {
                  ...currentFlow.state,
                  phase: "cancelled",
                  authorizationUrl: null,
                  expiresAt: null,
                  message: "Google sign-in was cancelled by sign-out.",
                  messageDescriptor: { code: "antigravity.cancelledBySignOut" },
                });
              }
              return currentFlow;
            }),
          );
          const stopRemaining = Effect.gen(function* () {
            if (flow?.forwarding) yield* Fiber.interrupt(flow.forwarding);
            if (flow?.fiber) yield* Fiber.interrupt(flow.fiber);
            yield* stopOwnedProcesses;
          });
          const result = yield* restore(
            Effect.gen(function* () {
              yield* stopSessions.pipe(Effect.ensuring(stopRemaining));
              const runtime = yield* options.makeRuntime({});
              const initialized = yield* runtime.initialize();
              if (!initialized.agentCapabilities?.auth?.logout) {
                return yield* setupError("logout", "antigravity.signOutUnsupported");
              }
              yield* runtime.request("logout", {});
              yield* options.onSignedOut;
            }).pipe(
              Effect.scoped,
              Effect.timeoutOrElse({
                duration: "90 seconds",
                orElse: () => Effect.fail(setupError("logout", "antigravity.signOutTimedOut")),
              }),
            ),
          ).pipe(Effect.exit);
          yield* lock.withPermits(1)(
            Effect.gen(function* () {
              operation = "idle";
              yield* SubscriptionRef.set(snapshot, {
                ownerSessionId: null,
                state: {
                  ...emptyState,
                  phase: Exit.isSuccess(result) ? "idle" : "failed",
                  ...providerAuthMessage(
                    Exit.isSuccess(result) ? "antigravity.signedOut" : "antigravity.signOutFailed",
                  ),
                },
              });
            }),
          );
          if (Exit.isFailure(result)) {
            const failure = Cause.findErrorOption(result.cause);
            return yield* Option.isSome(failure) && isSetupError(failure.value)
              ? failure.value
              : setupError("logout", "antigravity.signOutFailed");
          }
          return yield* currentState("");
        }),
      );
      const worker = yield* task.pipe(Effect.forkIn(instanceScope));
      return yield* Fiber.await(worker).pipe(Effect.flatten);
    }),
    subscribe: (ownerSessionId) =>
      SubscriptionRef.changes(snapshot).pipe(
        Stream.map((value) => {
          const state = visibleSnapshot(value, ownerSessionId);
          return {
            ...state,
            credentialOwner: "provider" as const,
            interaction:
              state.phase === "waiting" && state.authorizationUrl && state.flowId
                ? {
                    type: "browser" as const,
                    id: state.flowId,
                    url: state.authorizationUrl,
                    requiresConsent: false,
                    acceptsCallback: true,
                  }
                : null,
          };
        }),
        Stream.interruptWhen(Deferred.await(closed)),
      ),
    isLogoutPrompt: (text, hasAttachments) => !hasAttachments && text.trim() === "/logout",
  };

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      operation = "closed";
      const flow = activeFlow;
      activeFlow = undefined;
      if (flow) {
        flow.pending = undefined;
        if (flow.forwarding) yield* Fiber.interrupt(flow.forwarding);
        if (flow.fiber) yield* Fiber.interrupt(flow.fiber);
      }
      yield* stopOwnedProcesses;
      yield* Deferred.succeed(closed, undefined);
    }),
  );

  return { controller, withProcess };
});

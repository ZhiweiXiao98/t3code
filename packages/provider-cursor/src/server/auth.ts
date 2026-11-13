import { providerAuthMessage, providerAuthErrorMessage } from "@t3tools/contracts";
import type { SdkCredentialStore, SdkLoginOptions, SdkLoginResult } from "@cursor/sdk";
import {
  ProviderSetupError,
  type ProviderAuthState,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import { loadCursorSdk } from "./sdk.ts";
import type { ProviderAuthController } from "@t3tools/provider-core/server/auth";

const AUTH_TIMEOUT_MS = 300_000;

interface AuthFlow {
  readonly id: string;
  readonly owner: string;
  fiber?: Fiber.Fiber<void>;
}

export interface CursorAuth {
  readonly controller: ProviderAuthController;
  readonly readApiKey: Effect.Effect<string | undefined, ProviderSetupError>;
  readonly requireApiKey: Effect.Effect<string, ProviderSetupError>;
  readonly usesApiKey: boolean;
  readonly withAccess: <A, E, R>(
    task: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | ProviderSetupError, R | Scope.Scope>;
}

export interface CursorAuthOptions {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly apiKey?: string;
  readonly store: SdkCredentialStore;
  readonly credentialBinding?: NonNullable<ProviderAuthController["credentialBinding"]>;
  readonly onChanged: (signedIn: boolean) => Effect.Effect<void, ProviderSetupError>;
  readonly login?: (options: SdkLoginOptions) => Promise<SdkLoginResult>;
}

export const makeCursorAuth = Effect.fn("makeCursorAuth")(function* (options: CursorAuthOptions) {
  const scope = yield* Scope.Scope;
  const random = yield* SecureRandom.SecureRandom;
  const lock = yield* Semaphore.make(1);
  const configuredKey = options.apiKey?.trim() || undefined;
  const emptyState: ProviderAuthState = {
    instanceId: options.instanceId,
    phase: "idle",
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    message: null,
  };
  const snapshot = yield* SubscriptionRef.make({ owner: null as string | null, state: emptyState });
  let active: AuthFlow | undefined;
  let operation: "idle" | "login" | "stopping" | "closed" = "idle";
  const sessions = new Set<Scope.Closeable>();

  const publish = (flow: AuthFlow, patch: Partial<ProviderAuthState>) =>
    SubscriptionRef.update(snapshot, (current) => ({
      owner: flow.owner,
      state: { ...current.state, ...patch },
    }));

  const readApiKey = Effect.gen(function* () {
    if (configuredKey) return configuredKey;
    const credentials = yield* Effect.tryPromise({
      try: () => options.store.load(),
      catch: (cause) =>
        new ProviderSetupError({
          instanceId: options.instanceId,
          operation: "credentials",
          detail: "Could not read the Cursor sign-in. Try signing in again.",
          messageDescriptor: { code: "cursor.readFailed" },
          cause,
        }),
    });
    const now = yield* Clock.currentTimeMillis;
    return credentials &&
      (credentials.apiKeyExpiresAtMs === undefined || credentials.apiKeyExpiresAtMs > now)
      ? credentials.apiKey
      : undefined;
  });

  const requireApiKey = Effect.gen(function* () {
    if (operation !== "idle") {
      return yield* new ProviderSetupError({
        instanceId: options.instanceId,
        operation: "credentials",
        detail: "Cursor sign-in or sign-out is in progress. Try again after it finishes.",
        messageDescriptor: { code: "cursor.changing" },
      });
    }
    const apiKey = yield* readApiKey;
    if (!apiKey) {
      return yield* new ProviderSetupError({
        instanceId: options.instanceId,
        operation: "credentials",
        detail: "Sign in with Cursor or add CURSOR_API_KEY in provider settings.",
        messageDescriptor: { code: "cursor.credentialsRequired" },
      });
    }
    return apiKey;
  });

  // Closing admission before draining these scopes prevents cached credentials surviving sign-out.
  const withAccess: CursorAuth["withAccess"] = (task) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const parent = yield* Scope.Scope;
        const child = yield* lock.withPermits(1)(
          Effect.gen(function* () {
            if (operation !== "idle")
              return yield* new ProviderSetupError({
                instanceId: options.instanceId,
                operation: "session",
                detail: "Cursor sign-in or sign-out is in progress. Try again after it finishes.",
                messageDescriptor: { code: "cursor.changing" },
              });
            const child = yield* Scope.make();
            sessions.add(child);
            yield* Scope.addFinalizer(
              child,
              Effect.sync(() => {
                sessions.delete(child);
              }),
            );
            yield* Scope.addFinalizer(parent, Scope.close(child, Exit.void));
            return child;
          }),
        );
        const fiber = yield* restore(task).pipe(
          Effect.provideService(Scope.Scope, child),
          Effect.forkIn(child),
        );
        return yield* restore(Fiber.await(fiber)).pipe(
          Effect.flatten,
          Effect.onExit((result) =>
            Exit.isFailure(result) ? Scope.close(child, Exit.void) : Effect.void,
          ),
        );
      }),
    );
  const stopSessionsWithCredentials = Effect.suspend(() =>
    Effect.forEach(Array.from(sessions), (session) => Scope.close(session, Exit.void), {
      discard: true,
      concurrency: "unbounded",
    }),
  );

  const runLogin = Effect.fn("CursorAuth.runLogin")(
    function* (flow: AuthFlow, stopSessions: Effect.Effect<void, ProviderSetupError>) {
      yield* stopSessions.pipe(Effect.ensuring(stopSessionsWithCredentials));
      // The SDK first writes into memory. Cancellation must not save a late login result.
      const { Cursor, InMemoryCredentialStore } = yield* Effect.try({
        try: loadCursorSdk,
        catch: (cause) =>
          new ProviderSetupError({
            instanceId: options.instanceId,
            operation: "start",
            detail: "Could not load the Cursor SDK. Try signing in again.",
            messageDescriptor: { code: "cursor.sdkUnavailable" },
            cause,
          }),
      });
      const pendingStore = new InMemoryCredentialStore();
      const urls = yield* Queue.unbounded<string>();
      yield* Queue.take(urls).pipe(
        Effect.flatMap((authorizationUrl) =>
          lock.withPermits(1)(
            Effect.gen(function* () {
              if (active !== flow) return;
              yield* publish(flow, {
                phase: "waiting",
                authorizationUrl,
                message:
                  "Open the Cursor sign-in page and finish signing in. This page updates automatically.",
                messageDescriptor: { code: "cursor.waiting" },
              });
            }),
          ),
        ),
        Effect.forever,
        Effect.forkScoped,
      );
      yield* Effect.tryPromise({
        try: (signal) =>
          (options.login ?? Cursor.auth.login)({
            openBrowser: false,
            store: pendingStore,
            signal,
            apiKeyName: `T3 Code - ${options.displayName}`,
            onLoginUrl: (authorizationUrl) => {
              if (active === flow) Queue.offerUnsafe(urls, authorizationUrl);
            },
          }),
        catch: (cause) =>
          new ProviderSetupError({
            instanceId: options.instanceId,
            operation: "start",
            detail: "Cursor sign-in failed. Start sign-in again.",
            messageDescriptor: { code: "cursor.failed" },
            cause,
          }),
      });
      // Commit and publish together; interrupting a store Promise cannot stop a late write.
      yield* lock.withPermits(1)(
        Effect.gen(function* () {
          if (active !== flow) return;
          yield* publish(flow, {
            phase: "verifying",
            authorizationUrl: null,
            message: "Checking Cursor sign-in.",
            messageDescriptor: { code: "cursor.checking" },
          });
          yield* Effect.tryPromise({
            try: async () => {
              const credentials = await pendingStore.load();
              if (!credentials) throw new Error("Cursor login did not return credentials");
              await options.store.save(credentials);
            },
            catch: (cause) =>
              new ProviderSetupError({
                instanceId: options.instanceId,
                operation: "start",
                detail: "Could not save the Cursor sign-in. Try again.",
                messageDescriptor: { code: "cursor.saveFailed" },
                cause,
              }),
          });
          const verified = yield* options.onChanged(true).pipe(Effect.exit);
          if (Exit.isFailure(verified)) {
            yield* Effect.tryPromise({
              try: () => options.store.clear(),
              catch: (cause) =>
                new ProviderSetupError({
                  instanceId: options.instanceId,
                  operation: "start",
                  detail: "Could not clear the rejected Cursor sign-in. Try signing out.",
                  messageDescriptor: { code: "cursor.clearRejectedFailed" },
                  cause,
                }),
            });
            return yield* Effect.failCause(verified.cause);
          }
          active = undefined;
          operation = "idle";
          yield* publish(flow, {
            phase: "succeeded",
            authorizationUrl: null,
            expiresAt: null,
            message: "Signed in with Cursor.",
            messageDescriptor: { code: "cursor.succeeded" },
          });
        }).pipe(Effect.uninterruptible),
      );
    },
    (effect, flow, _stopSessions) =>
      effect.pipe(
        Effect.scoped,
        Effect.timeoutOrElse({
          duration: AUTH_TIMEOUT_MS,
          orElse: () =>
            Effect.fail(
              new ProviderSetupError({
                instanceId: options.instanceId,
                operation: "start",
                detail: "Cursor sign-in expired. Start sign-in again.",
                messageDescriptor: { code: "cursor.expired" },
              }),
            ),
        }),
        Effect.exit,
        Effect.flatMap((result) =>
          lock.withPermits(1)(
            Effect.gen(function* () {
              if (active !== flow) return;
              active = undefined;
              operation = "idle";
              yield* publish(flow, {
                phase: Exit.isSuccess(result) ? "succeeded" : "failed",
                authorizationUrl: null,
                expiresAt: null,
                ...(Exit.isSuccess(result)
                  ? providerAuthMessage("cursor.succeeded")
                  : Option.match(Cause.findErrorOption(result.cause), {
                      onNone: () => providerAuthMessage("cursor.failedOrExpired"),
                      onSome: providerAuthErrorMessage,
                    })),
              });
            }),
          ),
        ),
      ),
  );

  const requireFlow = Effect.fn("CursorAuth.requireFlow")(function* (
    owner: string,
    id: string,
    name: string,
  ) {
    if (!active || active.owner !== owner || active.id !== id) {
      return yield* new ProviderSetupError({
        instanceId: options.instanceId,
        operation: name,
        detail: "This sign-in is no longer active in this client.",
        messageDescriptor: { code: "auth.inactive" },
      });
    }
    return active;
  });

  const controller: ProviderAuthController = {
    credentialBinding: options.credentialBinding ?? {
      owner: "t3",
      key: `cursor:${options.instanceId}`,
    },
    isChangingCredentials: Effect.sync(() => operation !== "idle"),
    start: (owner, stopSessions = Effect.void) =>
      lock.withPermits(1)(
        Effect.uninterruptible(
          Effect.gen(function* () {
            if (!options.enabled)
              return yield* new ProviderSetupError({
                instanceId: options.instanceId,
                operation: "start",
                detail: "Enable Cursor before signing in.",
                messageDescriptor: { code: "cursor.enableFirst" },
              });
            if (configuredKey)
              return yield* new ProviderSetupError({
                instanceId: options.instanceId,
                operation: "start",
                detail:
                  "Remove CURSOR_API_KEY from this provider's environment before using browser sign-in.",
                messageDescriptor: { code: "cursor.removeKeyForLogin" },
              });
            if (active?.owner === owner && operation === "login") return snapshot.value.state;
            if (operation !== "idle")
              return yield* new ProviderSetupError({
                instanceId: options.instanceId,
                operation: "start",
                detail: "Cursor setup is already in progress.",
                messageDescriptor: { code: "cursor.busy" },
              });
            const id = yield* random.uuidV4().pipe(
              Effect.mapError(
                (cause) =>
                  new ProviderSetupError({
                    instanceId: options.instanceId,
                    operation: "start",
                    detail: "Could not start Cursor sign-in. Try again.",
                    messageDescriptor: { code: "cursor.startFailed" },
                    cause,
                  }),
              ),
            );
            const expiresAt = DateTime.formatIso(
              DateTime.makeUnsafe((yield* Clock.currentTimeMillis) + AUTH_TIMEOUT_MS),
            );
            const flow: AuthFlow = { id, owner };
            active = flow;
            operation = "login";
            const state: ProviderAuthState = {
              ...emptyState,
              phase: "starting",
              flowId: id,
              expiresAt,
              message: "Starting Cursor sign-in.",
              messageDescriptor: { code: "cursor.starting" },
            };
            yield* SubscriptionRef.set(snapshot, { owner, state });
            flow.fiber = yield* runLogin(flow, stopSessions).pipe(
              Effect.interruptible,
              Effect.forkIn(scope),
            );
            return state;
          }),
        ),
      ),
    complete: () =>
      Effect.fail(
        new ProviderSetupError({
          instanceId: options.instanceId,
          operation: "complete",
          detail: "Finish signing in on the Cursor website. No redirect URL is needed.",
          messageDescriptor: { code: "cursor.noRedirectNeeded" },
        }),
      ),
    cancel: (owner, id) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const flow = yield* lock.withPermits(1)(
            Effect.gen(function* () {
              const flow = yield* requireFlow(owner, id, "cancel");
              active = undefined;
              operation = "stopping";
              yield* publish(flow, {
                phase: "cancelled",
                authorizationUrl: null,
                expiresAt: null,
                message: "Cursor sign-in was cancelled.",
                messageDescriptor: { code: "cursor.cancelled" },
              });
              return flow;
            }),
          );
          if (flow.fiber) yield* Fiber.interrupt(flow.fiber);
          operation = "idle";
          return snapshot.value.state;
        }),
      ),
    logout: (stopSessions) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const flow = yield* lock.withPermits(1)(
            Effect.gen(function* () {
              if (configuredKey)
                return yield* new ProviderSetupError({
                  instanceId: options.instanceId,
                  operation: "logout",
                  detail:
                    "Remove CURSOR_API_KEY from this provider's environment to disconnect it.",
                  messageDescriptor: { code: "cursor.removeKeyToDisconnect" },
                });
              if (operation !== "idle" && operation !== "login")
                return yield* new ProviderSetupError({
                  instanceId: options.instanceId,
                  operation: "logout",
                  detail: "Cursor setup is already stopping.",
                  messageDescriptor: { code: "cursor.stopping" },
                });
              operation = "stopping";
              const flow = active;
              active = undefined;
              return flow;
            }),
          );
          const result = yield* Effect.gen(function* () {
            if (flow?.fiber) yield* Fiber.interrupt(flow.fiber);
            yield* stopSessions.pipe(Effect.ensuring(stopSessionsWithCredentials));
            yield* Effect.tryPromise({
              try: () => options.store.clear(),
              catch: (cause) =>
                new ProviderSetupError({
                  instanceId: options.instanceId,
                  operation: "logout",
                  detail: "Could not clear the Cursor sign-in. Try again.",
                  messageDescriptor: { code: "cursor.clearFailed" },
                  cause,
                }),
            });
            yield* options.onChanged(false);
          }).pipe(Effect.exit);
          operation = "idle";
          const state: ProviderAuthState = {
            ...emptyState,
            phase: Exit.isSuccess(result) ? "idle" : "failed",
            ...providerAuthMessage(
              Exit.isSuccess(result) ? "cursor.signedOut" : "cursor.signOutFailed",
            ),
          };
          yield* SubscriptionRef.set(snapshot, { owner: null, state });
          if (Exit.isFailure(result)) return yield* Effect.failCause(result.cause);
          return state;
        }),
      ),
    subscribe: (owner) =>
      SubscriptionRef.changes(snapshot).pipe(
        Stream.map((current) => {
          const state = {
            ...current.state,
            credentialOwner: "t3" as const,
            methods: [
              {
                id: "browser",
                name: "Sign in with Cursor",
                description: null,
                type: "agent" as const,
              },
            ],
            interaction:
              current.state.phase === "waiting" &&
              current.state.authorizationUrl &&
              current.state.flowId
                ? {
                    type: "browser" as const,
                    id: current.state.flowId,
                    url: current.state.authorizationUrl,
                    requiresConsent: false,
                  }
                : null,
          };
          if (current.owner === null || current.owner === owner) return state;
          return {
            ...state,
            interaction: null,
            flowId: null,
            authorizationUrl: null,
            expiresAt: null,
            ...(active ? providerAuthMessage("auth.otherClient") : {}),
          };
        }),
      ),
    isLogoutPrompt: (text, hasAttachments) => !hasAttachments && text.trim() === "/logout",
  };

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      operation = "closed";
      const flow = active;
      active = undefined;
      if (flow?.fiber) yield* Fiber.interrupt(flow.fiber);
      yield* stopSessionsWithCredentials;
    }),
  );

  return {
    controller,
    readApiKey,
    requireApiKey,
    withAccess,
    usesApiKey: configuredKey !== undefined,
  } satisfies CursorAuth;
});

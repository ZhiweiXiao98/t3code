// @effect-diagnostics nodeBuiltinImport:off - node:http sends the one-shot loopback callback with no proxy, redirect handling, or response logging.
import { providerAuthErrorFields, type ProviderAuthMessageCode } from "@t3tools/contracts";
import * as NodeHttp from "node:http";

import { ProviderSetupError, type ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

export interface AntigravityPendingCallback {
  readonly redirectUri: string;
  readonly state: string;
}

export const validateAntigravityCallbackUrl = Effect.fn("validateAntigravityCallbackUrl")(
  function* (
    instanceId: ProviderInstanceId,
    pending: AntigravityPendingCallback,
    callbackUrl: string,
  ) {
    const invalid = (code: ProviderAuthMessageCode) =>
      new ProviderSetupError({
        instanceId,
        operation: "complete",
        ...providerAuthErrorFields(code),
      });
    if (callbackUrl.length > 16_384) {
      return yield* invalid("antigravity.responseTooLong");
    }
    const callback = yield* Effect.try({
      try: () => new URL(callbackUrl),
      catch: () => invalid("antigravity.pasteRedirect"),
    });
    const expected = new URL(pending.redirectUri);
    if (
      callback.protocol !== "http:" ||
      callback.hostname !== "127.0.0.1" ||
      callback.origin !== expected.origin ||
      callback.pathname !== expected.pathname ||
      callback.username !== "" ||
      callback.password !== "" ||
      callback.hash !== ""
    ) {
      return yield* invalid("antigravity.wrongRedirect");
    }
    const states = callback.searchParams.getAll("state");
    if (states.length !== 1 || states[0] !== pending.state) {
      return yield* invalid("antigravity.wrongRedirect");
    }
    const codes = callback.searchParams.getAll("code");
    const errors = callback.searchParams.getAll("error");
    if (
      !(
        (codes.length === 1 && Boolean(codes[0]) && errors.length === 0) ||
        (errors.length === 1 && Boolean(errors[0]) && codes.length === 0)
      )
    ) {
      return yield* invalid("antigravity.singleResponseRequired");
    }
    const issuers = callback.searchParams.getAll("iss");
    if (
      issuers.length > 1 ||
      (issuers.length === 1 && issuers[0] !== "https://accounts.google.com")
    ) {
      return yield* invalid("antigravity.wrongIssuer");
    }
    return callback;
  },
);

export const forwardAntigravityCallback = (
  instanceId: ProviderInstanceId,
  callback: URL,
): Effect.Effect<void, ProviderSetupError> =>
  Effect.callback<void, ProviderSetupError>((resume) => {
    const failed = () =>
      new ProviderSetupError({
        instanceId,
        operation: "complete",
        detail: "Could not deliver the sign-in response. Start sign-in again.",
        messageDescriptor: { code: "antigravity.forwardFailed" },
      });
    let response: NodeHttp.IncomingMessage | undefined;
    const request = NodeHttp.request(
      {
        protocol: "http:",
        hostname: callback.hostname,
        port: callback.port,
        path: `${callback.pathname}${callback.search}`,
        method: "GET",
        agent: false,
      },
      (incoming) => {
        response = incoming;
        incoming.once("error", () => resume(Effect.fail(failed())));
        incoming.once("end", () => {
          const status = incoming.statusCode ?? 0;
          resume(status >= 200 && status < 300 ? Effect.void : Effect.fail(failed()));
        });
        incoming.resume();
      },
    );
    request.once("error", () => resume(Effect.fail(failed())));
    request.end();
    return Effect.sync(() => {
      request.destroy();
      response?.destroy();
    });
  }).pipe(
    Effect.timeoutOrElse({
      duration: "10 seconds",
      orElse: () =>
        Effect.fail(
          new ProviderSetupError({
            instanceId,
            operation: "complete",
            detail: "The sign-in response timed out. Start sign-in again.",
            messageDescriptor: { code: "antigravity.forwardTimedOut" },
          }),
        ),
    }),
  );

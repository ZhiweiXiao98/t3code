import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { expect, it } from "vite-plus/test";
import { relayFailureReason } from "./relayFailureReason";
import { cloudLinkPreconditionError, cloudLinkFailureMessage } from "./cloudLinkFailureMessages";

it("keeps cached own preconditions separate from same-text external errors", () => {
  for (const source of ["environment", "permission", "loading", "signin"] as const) {
    const error = cloudLinkPreconditionError(source);
    const english = error.message;
    expect(cloudLinkFailureMessage(error, "en")).toBe(english);
    expect(cloudLinkFailureMessage(error, "zh-CN")).not.toBe(english);
    expect(cloudLinkFailureMessage(error, "en")).toBe(english);
    expect(error.message).toBe(english);
    expect(cloudLinkFailureMessage(Object.assign(new Error(english), { source }), "zh-CN")).toBe(
      english,
    );
  }
});

it("localizes typed relay fallback branches without translating raw diagnostics or foreign shapes", () => {
  const timeout = new ManagedRelay.ManagedRelayRequestTimeoutError({
    activity: "Relay environment listing",
    timeoutMs: 123,
    traceId: "opaque/{trace}/$&",
  });
  expect(relayFailureReason(timeout)).toBe("T3 Connect timed out. Try again.");
  expect(relayFailureReason(new Error("wrapper", { cause: timeout }), "zh-CN")).toBe(
    "T3 Connect 请求超时。请重试。",
  );
  const cause = new Error("opaque/{cause}/$&");
  for (const input of [{ transportFailed: true }, { status: 504 }, { status: 503 }]) {
    const error = new ManagedRelay.ManagedRelayRequestFailedError({
      action: "link relay environment",
      cause,
      ...input,
    });
    const english = relayFailureReason(error, "en");
    const original = error.message;
    expect(relayFailureReason(error, "zh-CN")).not.toBe(english);
    expect(relayFailureReason(error, "en")).toBe(english);
    expect(error.message).toBe(original);
    expect(error.cause).toBe(cause);
  }
  expect(relayFailureReason(new Error("T3 Connect timed out. Try again."), "zh-CN")).toBeNull();
  expect(
    relayFailureReason(
      Object.assign(new Error(timeout.message), {
        _tag: timeout._tag,
        activity: timeout.activity,
        timeoutMs: timeout.timeoutMs,
        traceId: timeout.traceId,
      }),
      "zh-CN",
    ),
  ).toBeNull();
});

import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { ManagedRelay, relayRequestFailureDetail } from "@t3tools/client-runtime/relay";
import * as Schema from "effect/Schema";

const isRequestFailed = Schema.is(ManagedRelay.ManagedRelayRequestFailedError);
const isRequestTimeout = Schema.is(ManagedRelay.ManagedRelayRequestTimeoutError);

/** One short line for an error toast saying why a T3 Connect request failed. */
export function relayFailureReason(
  cause: unknown,
  locale: ResolvedAppLocale = "en",
): string | null {
  for (let current = cause, depth = 0; current instanceof Error && depth < 4; depth += 1) {
    if (
      Object.getPrototypeOf(current) === ManagedRelay.ManagedRelayRequestTimeoutError.prototype &&
      isRequestTimeout(current)
    )
      return locale === "zh-CN"
        ? "T3 Connect 请求超时。请重试。"
        : "T3 Connect timed out. Try again.";
    if (
      Object.getPrototypeOf(current) === ManagedRelay.ManagedRelayRequestFailedError.prototype &&
      isRequestFailed(current)
    ) {
      if (current.transportFailed)
        return locale === "zh-CN"
          ? "无法连接 T3 Connect。请检查网络。"
          : "Could not reach T3 Connect. Check your network.";
      if (current.relayError) {
        return current.relayError._tag === "RelayInternalError"
          ? locale === "zh-CN"
            ? "T3 Connect 暂不可用。请重试。"
            : "T3 Connect is unavailable. Try again."
          : relayRequestFailureDetail(current);
      }
      if (current.status === 504)
        return locale === "zh-CN"
          ? "T3 Connect 请求超时。请重试。"
          : "T3 Connect timed out. Try again.";
      if ((current.status ?? 0) >= 500)
        return locale === "zh-CN"
          ? "T3 Connect 暂不可用。请重试。"
          : "T3 Connect is unavailable. Try again.";
      return relayRequestFailureDetail(current);
    }
    current = current.cause;
  }
  return null;
}

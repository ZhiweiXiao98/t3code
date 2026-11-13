import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage, translateWebSource } from "~/i18n/messages";
import type { DeviceHubAccess } from "@t3tools/client-runtime/state/deviceHubAccess";
import { withDeviceHubQuery } from "@t3tools/client-runtime/state/deviceHubAccess";
import * as Schema from "effect/Schema";

export type AndroidFoldPosture = "closed" | "opened";

export interface AndroidFoldState {
  readonly supported: boolean;
  readonly posture: "closed" | "half_opened" | "opened" | "flipped" | "tent" | null;
  readonly hingeAngle: number | null;
}

export class AndroidFoldError extends Schema.TaggedError<AndroidFoldError>()("AndroidFoldError", {
  message: Schema.String,
  status: Schema.Number,
}) {}

const ownedFailures = new WeakMap<
  Error,
  { readonly kind: "invalid" } | { readonly kind: "http"; readonly status: number }
>();

function invalidFoldResponse(): Error {
  const error = new Error("Unexpected Android fold response.");
  ownedFailures.set(error, { kind: "invalid" });
  return error;
}

export function androidFoldFailureMessage(locale: ResolvedAppLocale, error: Error): string {
  const source = ownedFailures.get(error);
  if (source === undefined) return error.message;
  return source.kind === "invalid"
    ? translateWebSource(locale, "Unexpected Android fold response.")
    : translateWebMessage(locale, "device.foldHttpFailed", { status: source.status });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseFold = (payload: unknown): AndroidFoldState => {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.fold)) {
    throw invalidFoldResponse();
  }
  const { supported, posture, hingeAngle } = payload.fold;
  if (
    typeof supported !== "boolean" ||
    (posture !== null &&
      posture !== "closed" &&
      posture !== "half_opened" &&
      posture !== "opened" &&
      posture !== "flipped" &&
      posture !== "tent") ||
    (hingeAngle !== null && (typeof hingeAngle !== "number" || !Number.isFinite(hingeAngle)))
  ) {
    throw invalidFoldResponse();
  }
  return { supported, posture, hingeAngle };
};

const foldRequest = async (
  access: DeviceHubAccess,
  deviceId: string,
  posture?: AndroidFoldPosture,
  signal?: AbortSignal,
): Promise<AndroidFoldState> => {
  const url = withDeviceHubQuery(
    `${access.httpBase}/vendor/serve-emu/api/fold?${new URLSearchParams({ device: deviceId })}`,
    access,
  );
  const response = await fetch(url, {
    method: posture ? "POST" : "GET",
    cache: "no-store",
    credentials: access.credentials ? "include" : "same-origin",
    ...(posture
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ posture }) }
      : {}),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const error = isRecord(payload) ? payload.error : null;
    const failure = new AndroidFoldError({
      message: typeof error === "string" ? error : `Fold command failed (${response.status}).`,
      status: response.status,
    });
    if (typeof error !== "string")
      ownedFailures.set(failure, { kind: "http", status: response.status });
    throw failure;
  }
  return parseFold(await response.json());
};

export const readAndroidFold = (access: DeviceHubAccess, deviceId: string, signal?: AbortSignal) =>
  foldRequest(access, deviceId, undefined, signal);

export const setAndroidFold = (
  access: DeviceHubAccess,
  deviceId: string,
  posture: AndroidFoldPosture,
  signal?: AbortSignal,
) => foldRequest(access, deviceId, posture, signal);

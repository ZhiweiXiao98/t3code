import {
  ProviderSetupError,
  formatProviderAuthMessage,
  providerAuthErrorMessage,
  type ProviderAuthMessage,
} from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";
import { translateWebSource } from "./messages";

const isSetupError = Schema.is(ProviderSetupError);
export type ProviderAuthDisplayError = string | ProviderAuthMessage;

export function providerAuthFailureValue(
  failure: unknown,
  fallback: string,
): ProviderAuthDisplayError {
  return isSetupError(failure)
    ? providerAuthErrorMessage(failure)
    : failure instanceof Error
      ? failure.message
      : fallback;
}

export function translateProviderAuthMessage(
  locale: ResolvedAppLocale,
  value: ProviderAuthMessage | string | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  return formatProviderAuthMessage(value, (source) => translateWebSource(locale, source));
}

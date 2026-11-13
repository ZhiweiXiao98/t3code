import {
  ProviderSetupError,
  formatProviderAuthMessage,
  providerAuthErrorMessage,
  type ProviderAuthMessage,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

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
  value: ProviderAuthMessage | string | null | undefined,
  locale: MobileLocale = MOBILE_LOCALE,
): string | null {
  if (typeof value === "string") return value;
  return formatProviderAuthMessage(value, (source) => localizeMobileString(source, locale));
}

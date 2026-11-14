import {
  ProviderSetupError,
  formatProviderAuthMessage,
  providerAuthErrorMessage,
  type ProviderAuthMessage,
} from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";
import { translateProviderAuthenticationSource } from "./providerAuthenticationMessages";
import { translateWebSource } from "./messages";

const isSetupError = Schema.is(ProviderSetupError);
const localAuthErrors = {
  providerSignIn: "Provider sign-in failed. Try again.",
  openSignIn: "Could not open the sign-in page. Copy the link and open it in your browser.",
  copySignIn: "Could not copy the sign-in link.",
  terminalUnavailable: "The provider sign-in terminal is no longer available.",
  terminalInput: "Could not send input to the provider sign-in terminal.",
  codexSetup: "Codex setup failed. Try again.",
  handoffFailed: "ChatGPT sign-in could not finish. Try again.",
  handoffInterrupted: "ChatGPT sign-in on the primary environment was interrupted. Try again.",
  localSignIn:
    "Could not finish sign-in on this computer. Try again or paste the redirect URL below.",
} as const;
type LocalAuthError = { readonly localCode: keyof typeof localAuthErrors };
export type ProviderAuthDisplayError = string | ProviderAuthMessage | LocalAuthError;

export function providerAuthFailureValue(
  failure: unknown,
  fallback: string | LocalAuthError,
): ProviderAuthDisplayError {
  return isSetupError(failure)
    ? providerAuthErrorMessage(failure)
    : failure instanceof Error
      ? failure.message
      : fallback;
}

export function translateProviderAuthMessage(
  locale: ResolvedAppLocale,
  value: ProviderAuthDisplayError | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  if (value && "localCode" in value) {
    const source = localAuthErrors[value.localCode];
    return value.localCode === "providerSignIn" ||
      value.localCode === "openSignIn" ||
      value.localCode === "copySignIn"
      ? translateProviderAuthenticationSource(locale, source)
      : translateWebSource(locale, source);
  }
  return formatProviderAuthMessage(value, (source) => translateWebSource(locale, source));
}

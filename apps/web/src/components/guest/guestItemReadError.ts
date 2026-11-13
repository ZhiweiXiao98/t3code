import * as Schema from "effect/Schema";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { localizeGuestError } from "~/i18n/guestErrorMessages";
import { readWebI18n } from "~/i18n/readWebI18n";

export class GuestItemReadError extends Schema.TaggedError<GuestItemReadError>()(
  "GuestItemReadError",
  { source: Schema.Literals(["Could not load this item.", "Output is no longer available."]) },
) {
  override get message(): string {
    return localizeGuestError(readWebI18n().locale, this.source);
  }
}

const isGuestItemReadError = Schema.is(GuestItemReadError);

export function guestItemFailureMessage(
  locale: ResolvedAppLocale,
  failure: unknown,
  fallback: string | null,
): string | null {
  return isGuestItemReadError(failure) &&
    Object.getPrototypeOf(failure) === GuestItemReadError.prototype
    ? localizeGuestError(locale, failure.source)
    : fallback;
}

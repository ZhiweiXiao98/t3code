import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { resolveFilesystemReadAccess } from "@t3tools/client-runtime/state/filesystem";
import * as Schema from "effect/Schema";
import { translateWebMessage } from "./messages";

export function resolveLocalizedFilesystemReadAccess(
  locale: ResolvedAppLocale,
  input: Parameters<typeof resolveFilesystemReadAccess>[0],
) {
  const access = resolveFilesystemReadAccess(input);
  // Session and connection errors are external, even when their text matches our fallback.
  return input.sessionError === null &&
    input.session === null &&
    input.connection?.error == null &&
    access.error !== null
    ? { ...access, error: translateWebMessage(locale, "audit11.offline") }
    : access;
}

export function localizeUsageError(
  locale: ResolvedAppLocale,
  source: string | null,
): string | null {
  switch (source) {
    case "This environment could not report usage.":
      return translateWebMessage(locale, "audit11.usageFailed");
    case "Could not check this connection's access to diagnostics and usage.":
      return translateWebMessage(locale, "audit11.usageAccessFailed");
    case "This environment is not connected.":
      return translateWebMessage(locale, "audit11.offline");
    case "This connection does not have access to diagnostics and usage.":
      return translateWebMessage(locale, "audit11.usageDenied");
    default:
      return source;
  }
}

export class ProjectAppearanceTimeoutError extends Schema.TaggedError<ProjectAppearanceTimeoutError>()(
  "ProjectAppearanceTimeoutError",
  {},
) {
  override get message(): string {
    return "The project did not appear in the desktop app.";
  }
}

const isProjectAppearanceTimeoutError = Schema.is(ProjectAppearanceTimeoutError);

export function projectAppearanceFailureMessage(locale: ResolvedAppLocale, failure: unknown) {
  return isProjectAppearanceTimeoutError(failure) &&
    Object.getPrototypeOf(failure) === ProjectAppearanceTimeoutError.prototype
    ? translateWebMessage(locale, "audit11.projectTimeout")
    : null;
}

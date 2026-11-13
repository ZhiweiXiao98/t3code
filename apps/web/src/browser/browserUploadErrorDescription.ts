import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { translateWebMessage } from "../i18n/messages";

export function browserUploadErrorDescription(
  locale: ResolvedAppLocale,
  cause: unknown,
): string | undefined {
  if (!(cause instanceof Error)) return undefined;
  switch (cause.message) {
    case "The page's file picker is no longer open.":
      return translateWebMessage(locale, "browser.uploadPickerClosed");
    case "The upload was refused.":
      return translateWebMessage(locale, "browser.uploadRefused");
    default:
      return cause.message;
  }
}

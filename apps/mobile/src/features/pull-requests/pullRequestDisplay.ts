import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function pullRequestFileSummary(
  input: {
    readonly fileCount: number;
    readonly hiddenCount: number;
    readonly hideTestFiles: boolean;
    readonly viewedCount: number | null;
  },
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return [
    formatMobileMessage(
      input.hiddenCount
        ? input.fileCount === 1
          ? "{0} visible file"
          : "{0} visible files"
        : input.fileCount === 1
          ? "{0} changed file"
          : "{0} changed files",
      [input.fileCount],
      locale,
    ),
    input.viewedCount === null
      ? null
      : formatMobileMessage("{0} viewed", [input.viewedCount], locale),
    input.hideTestFiles
      ? formatMobileMessage(
          input.hiddenCount === 1 ? "{0} test file hidden" : "{0} test files hidden",
          [input.hiddenCount],
          locale,
        )
      : localizeMobileString("Test files included", locale),
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function pullRequestDiffSubtitle(
  identifier: string,
  fileCount: number,
  hiddenCount: number,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return [
    identifier,
    formatMobileMessage(fileCount === 1 ? "{0} file" : "{0} files", [fileCount], locale),
    hiddenCount > 0
      ? formatMobileMessage(
          hiddenCount === 1 ? "{0} test hidden" : "{0} tests hidden",
          [hiddenCount],
          locale,
        )
      : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

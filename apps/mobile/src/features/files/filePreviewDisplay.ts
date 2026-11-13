import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { resolveFilesystemReadAccess } from "@t3tools/client-runtime/state/filesystem";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function attachmentSubtitle(
  draft: boolean,
  sizeBytes: number,
  locale: MobileLocale = MOBILE_LOCALE,
) {
  return [
    localizeMobileString(draft ? "Draft attachment" : "Attachment", locale),
    ...(sizeBytes > 0 ? [formatAttachmentSize(sizeBytes)] : []),
  ].join(" · ");
}

export function filePreviewFailure(
  description: string | null | undefined,
  kind: "image" | "file" | "pdf",
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return (
    description ||
    localizeMobileString(
      kind === "image"
        ? "The image could not be rendered."
        : kind === "pdf"
          ? "The PDF could not be loaded."
          : "The file could not be rendered.",
      locale,
    )
  );
}

export function pdfHttpFailure(status: number, locale: MobileLocale = MOBILE_LOCALE): string {
  return formatMobileMessage("The server returned HTTP {0}.", [status], locale);
}

export function localizedFilesystemReadAccess(
  input: Parameters<typeof resolveFilesystemReadAccess>[0],
  locale: MobileLocale = MOBILE_LOCALE,
) {
  const access = resolveFilesystemReadAccess(input);
  const externalError = input.sessionError !== null || input.connection?.error != null;
  return {
    ...access,
    error:
      access.error === null || externalError
        ? access.error
        : localizeMobileString(access.error, locale),
  };
}

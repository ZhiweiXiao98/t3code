import { fileAttachmentTooLargeMessage } from "@t3tools/client-runtime/state/attachments";
import { formatMobileMessage } from "./mobileDisplayStrings";
import { MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

export function mobileAttachmentTooLargeMessage(
  name: string,
  maxBytes: number,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (locale === "en") return fileAttachmentTooLargeMessage(name, maxBytes);
  const size =
    maxBytes >= 1024 * 1024 && maxBytes % (1024 * 1024) === 0
      ? `${maxBytes / (1024 * 1024)} MB`
      : maxBytes >= 1024 && maxBytes % 1024 === 0
        ? `${maxBytes / 1024} KB`
        : formatMobileMessage("{0} bytes", [maxBytes], locale);
  return formatMobileMessage("'{0}' exceeds the {1} attachment limit.", [name, size], locale);
}

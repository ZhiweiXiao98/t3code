import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
import {
  connectionStatusText,
  type EnvironmentConnectionPresentation,
} from "@t3tools/client-runtime/connection";

export function environmentStatusText(
  connection: EnvironmentConnectionPresentation,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (connection.phase === "unsupported" && connection.error !== null) return connection.error;
  if (connection.error && (connection.phase === "error" || connection.phase === "reconnecting")) {
    return formatMobileMessage(
      connection.phase === "error"
        ? "Connection failed. Reason: {0}"
        : "Failed to connect. Reconnecting... Reason: {0}",
      [connection.error],
      locale,
    );
  }
  return localizeMobileString(connectionStatusText(connection), locale);
}

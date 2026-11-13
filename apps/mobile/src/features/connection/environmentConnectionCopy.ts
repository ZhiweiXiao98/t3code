import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function noticeTitle(
  phase: EnvironmentConnectionPhase,
  environmentLabel: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  switch (phase) {
    case "offline":
      return localizeMobileString("You are offline", locale);
    case "connecting":
      return formatMobileMessage("Connecting to {0}...", [environmentLabel], locale);
    case "reconnecting":
      return formatMobileMessage("Reconnecting to {0}...", [environmentLabel], locale);
    case "unsupported":
      return localizeMobileString("Client not supported", locale);
    case "error":
      return formatMobileMessage("{0} is unavailable", [environmentLabel], locale);
    case "available":
      return formatMobileMessage("{0} is disconnected", [environmentLabel], locale);
    case "connected":
      return "";
  }
}

export function noticeDetail(
  phase: EnvironmentConnectionPhase,
  resourceName: string,
  error: string | null,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const resources: Record<string, string> = { preview: "预览", review: "审查", terminal: "终端" };
  const resourceLabel =
    locale === "zh-CN" && Object.hasOwn(resources, resourceName)
      ? resources[resourceName]!
      : resourceName;
  if (error) {
    return phase === "reconnecting"
      ? formatMobileMessage("The app will keep retrying automatically. {0}", [error], locale)
      : error;
  }

  switch (phase) {
    case "offline":
      return formatMobileMessage(
        "Cached data remains available. The {0} will load when your connection returns.",
        [resourceLabel],
        locale,
      );
    case "connecting":
    case "reconnecting":
      return formatMobileMessage(
        "The {0} will load as soon as the environment is ready.",
        [resourceLabel],
        locale,
      );
    case "unsupported":
      return localizeMobileString(
        "Use compatible versions of the app and server to connect.",
        locale,
      );
    case "available":
    case "error":
      return formatMobileMessage(
        "Reconnect the environment to load the {0}.",
        [resourceLabel],
        locale,
      );
    case "connected":
      return "";
  }
}

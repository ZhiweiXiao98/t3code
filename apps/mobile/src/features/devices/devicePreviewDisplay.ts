import {
  deviceToolUpdateOwnership,
  deviceToolUpdatePolicy,
} from "@t3tools/client-runtime/state/device";
import type { DeviceToolVersions } from "@t3tools/contracts";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function deviceRetryLabel(host: string, locale: MobileLocale = MOBILE_LOCALE): string {
  return formatMobileMessage("Retry {0}", [host], locale);
}

export function deviceToolsMessage(
  tools: DeviceToolVersions | undefined,
  detail: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const versions = tools
    ? (
        [
          ["Device hub", tools.hub],
          ["Agent tools", tools.agent],
        ] as const
      ).map(([name, tool]) => {
        const installed = tool.installedVersions.length
          ? tool.installedVersions.join(", ")
          : localizeMobileString("none", locale);
        const values = [
          localizeMobileString(name, locale),
          installed,
          tool.requiredVersion,
          tool.runningVersion,
        ];
        return formatMobileMessage(
          tool.runningVersion
            ? "{0}: installed {1}; required {2}; running {3}."
            : "{0}: installed {1}; required {2}.",
          values,
          locale,
        );
      })
    : [localizeMobileString("Device tool versions have not been checked.", locale)];
  return (
    localizeMobileString(deviceToolUpdateOwnership, locale) +
    "\n\n" +
    localizeMobileString(deviceToolUpdatePolicy(tools), locale) +
    "\n\n" +
    versions.join("\n") +
    "\n" +
    detail
  );
}

import type { PeerLinkHealth } from "@t3tools/client-runtime/state/peerLinks";
import type { ServerEventLoopStall } from "@t3tools/contracts";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function connectionRowActionLabel(
  host: string,
  opensDetails: boolean | undefined,
  expanded: boolean,
  locale: MobileLocale = MOBILE_LOCALE,
) {
  return formatMobileMessage(
    opensDetails ? "Manage {0}" : expanded ? "Collapse details for {0}" : "Expand details for {0}",
    [host],
    locale,
  );
}

export function linkedEnvironmentStatus(
  health: PeerLinkHealth,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  switch (health.kind) {
    case "expired":
      return localizeMobileString("Expired. Link it again with a new pairing code.", locale);
    case "unreachable":
      return health.detail ?? localizeMobileString("Not answering right now.", locale);
    case "failing":
      return health.detail;
    case "reachable":
      return health.expiresInDays === null
        ? localizeMobileString("Reachable", locale)
        : formatMobileMessage(
            health.expiresInDays === 1 ? "Expires in {0} day" : "Expires in {0} days",
            [health.expiresInDays],
            locale,
          );
  }
}

export function connectionHostFreezeDisplay(
  host: string,
  stall: ServerEventLoopStall | undefined,
  locale: MobileLocale = MOBILE_LOCALE,
): string | null {
  if (stall === undefined) return null;
  const title = formatMobileMessage(
    "{0} froze for {1}s",
    [host, Math.round(stall.durationMs / 1000)],
    locale,
  );
  const description =
    stall.loadAverage !== undefined && stall.loadAverage > stall.cpuCount
      ? formatMobileMessage(
          "Its CPU is overloaded (load {0} on {1} cores).",
          [Math.round(stall.loadAverage), stall.cpuCount],
          locale,
        )
      : formatMobileMessage("T3 Code on {0} was too busy to answer.", [host], locale);
  return `${title}. ${description}`;
}

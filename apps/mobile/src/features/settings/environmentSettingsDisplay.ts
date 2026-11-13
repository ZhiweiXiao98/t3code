import {
  connectionRouteAddress,
  connectionRouteKind,
  connectionRouteLabel,
  isLearned,
  routeHttpBaseUrl,
  type ConnectionRoute,
} from "@t3tools/client-runtime/connection";
import type { ServerProvider, ServerProviderUpdateState } from "@t3tools/contracts";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function environmentRouteDisplay(
  route: ConnectionRoute,
  position: number,
  count: number,
  inUse: boolean,
  locale: MobileLocale = MOBILE_LOCALE,
) {
  const kind = connectionRouteKind(route);
  let label = connectionRouteLabel(route);
  if (kind === "loopback") label = localizeMobileString("This device", locale);
  else if (kind === "public" && !URL.canParse(routeHttpBaseUrl(route) ?? "")) {
    label = localizeMobileString("Remote link", locale);
  }
  const address = connectionRouteAddress(route);
  return {
    label,
    address,
    removeTitle: formatMobileMessage("Remove {0}?", [label], locale),
    detail:
      address !== null && isLearned(route)
        ? formatMobileMessage("{0} · found automatically", [address], locale)
        : address,
    accessibilityLabel: [
      label,
      address,
      isLearned(route) ? localizeMobileString("Found automatically", locale) : null,
      inUse ? localizeMobileString("In use", locale) : null,
      formatMobileMessage("Route {0} of {1}", [position, count], locale),
    ]
      .filter((part) => part !== null)
      .join(", "),
  };
}

export function environmentUpdateConfirmation(
  name: string | null | undefined,
  version: string,
  desktopManaged: boolean,
  locale: MobileLocale = MOBILE_LOCALE,
) {
  return {
    title: formatMobileMessage(
      "Update {0}?",
      [name ?? localizeMobileString("environment", locale)],
      locale,
    ),
    message: formatMobileMessage(
      desktopManaged
        ? "Install T3 Code {0}. The desktop app will close and relaunch. Running threads may be interrupted."
        : "Install T3 Code {0}. The server will restart and reconnect. Running threads may be interrupted.",
      [version],
      locale,
    ),
  };
}

export function environmentMaintenanceFailure(
  cause: unknown,
  locale: MobileLocale = MOBILE_LOCALE,
) {
  return cause instanceof Error
    ? cause.message
    : localizeMobileString("The action could not be completed. Try again.", locale);
}

export function environmentProviderVersion(
  provider: Pick<ServerProvider, "installed" | "version" | "versionAdvisory">,
  locale: MobileLocale = MOBILE_LOCALE,
) {
  const version = provider.installed
    ? (provider.version ?? localizeMobileString("Version unknown", locale))
    : localizeMobileString("Not installed", locale);
  return provider.versionAdvisory?.latestVersion
    ? `${version} · ${formatMobileMessage("Latest {0}", [provider.versionAdvisory.latestVersion], locale)}`
    : version;
}

const updateStatusTemplates = {
  idle: "Update idle",
  queued: "Update queued",
  running: "Update running",
  succeeded: "Update succeeded",
  failed: "Update failed",
  unchanged: "Update unchanged",
} as const;
export function environmentProviderUpdateState(
  state: Pick<ServerProviderUpdateState, "message" | "status">,
  locale: MobileLocale = MOBILE_LOCALE,
) {
  return (
    state.message ??
    (Object.hasOwn(updateStatusTemplates, state.status)
      ? localizeMobileString(updateStatusTemplates[state.status], locale)
      : `Update ${state.status}`)
  );
}

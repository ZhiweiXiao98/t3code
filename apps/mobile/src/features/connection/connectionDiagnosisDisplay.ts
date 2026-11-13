import type { ConnectionDiagnosis } from "@t3tools/client-runtime/connection";

import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

const STEP_TEMPLATES = [
  "Connect this device to the internet. T3 Code reconnects on its own.",
  "Wait a moment. T3 Code retries on its own.",
  "If it keeps waiting, reload or restart T3 Code on this device.",
  "Update T3 Code on {0}.",
  "Turn on automatic date and time on this device and on {0}, then retry.",
  "Check that this device is signed in to the same T3 Connect account as the host.",
  "On {0}, open Settings > Sharing & access and turn T3 Connect on.",
  "Wait a minute. T3 Code retries on its own.",
  "On {0}, check Settings > Sharing & access or run `t3 connect status`.",
  "Wait a few minutes. T3 Code retries on its own.",
  "If it keeps failing, copy the diagnostics and report it.",
  "Make sure {0} is awake and T3 Code is running on it.",
  "A VPN or Tailscale exit node on {0} can block the tunnel (port 7844). Turn it off or allow the tunnel.",
  "Open or restart T3 Code on {0}.",
  "Make sure {0} is awake and online.",
  "Restart T3 Code on this device.",
  "If it keeps failing, remove {0} from this device and add it again.",
  "Sign out of T3 Connect and sign in again.",
  "Check this device's internet connection.",
  "A VPN, firewall, or ad blocker on this device can block T3 Connect.",
  "A VPN, firewall, or DNS filter on this device can block the tunnel.",
  "Try another network, or add a direct route such as a Tailscale address.",
  "Make sure T3 Code is running on {0}.",
  "Retry. If it keeps failing, copy the diagnostics.",
] as const;

const FACT_LABELS = new Set([
  "Cause",
  "HTTP status",
  "Attempts",
  "Next retry",
  "Route",
  "App version",
  "Host version",
  "Error",
  "Trace ID",
]);

const HOP_TEMPLATES = {
  device: "This device",
  relay: "T3 Connect",
  tunnel: "{0} tunnel",
  server: "T3 Code on {0}",
} as const;

/** Display only: keep the source diagnosis intact for copied technical reports. */
export function connectionDiagnosisDisplay(
  diagnosis: ConnectionDiagnosis,
  host: string,
  locale: MobileLocale = MOBILE_LOCALE,
): ConnectionDiagnosis {
  if (locale === "en") return diagnosis;
  return {
    ...diagnosis,
    hops: diagnosis.hops.map((hop) => {
      const template = HOP_TEMPLATES[hop.hop];
      return {
        ...hop,
        label:
          formatMobileMessage(template, [host], "en") === hop.label
            ? formatMobileMessage(template, [host], locale)
            : hop.label,
      };
    }),
    steps: diagnosis.steps.map((step) => {
      const template = STEP_TEMPLATES.find(
        (candidate) => formatMobileMessage(candidate, [host], "en") === step,
      );
      return template === undefined ? step : formatMobileMessage(template, [host], locale);
    }),
    facts: diagnosis.facts.map(([label, value]) => [
      FACT_LABELS.has(label) ? localizeMobileString(label, locale) : label,
      value,
    ]),
  };
}

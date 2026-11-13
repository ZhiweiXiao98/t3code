import type { PullRequestReaction } from "@t3tools/contracts";
import {
  pullRequestReactionName,
  pullRequestReactionTooltip,
} from "@t3tools/client-runtime/pull-request-reactions";
import { formatMobileMessage } from "./mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

export function mobileSubagentSummary(value: string, locale: MobileLocale = MOBILE_LOCALE): string {
  if (locale !== "zh-CN") return value;
  const parts = value.split(" · ");
  if (!parts.every((part) => /^\d+ (working|done|failed|stopped|idle)$/.test(part))) return value;
  return parts
    .map((part) => {
      const [count, status] = part.split(" ");
      return `${count} ${localizeMobileString(status!, locale)}`;
    })
    .join(" · ");
}

export function mobileReactionTooltip(
  reaction: PullRequestReaction,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  if (locale !== "zh-CN") return pullRequestReactionTooltip(reaction);
  const names =
    reaction.viewerHasReacted && reaction.actors.length < reaction.count
      ? [localizeMobileString("You", locale), ...reaction.actors]
      : [...reaction.actors];
  const shown = names.slice(0, Math.min(3, reaction.count));
  const remaining = Math.max(0, reaction.count - shown.length);
  const people = [
    ...shown,
    ...(remaining
      ? [formatMobileMessage(shown.length ? "{0} others" : "{0} people", [remaining], locale)]
      : []),
  ].join("、");
  return formatMobileMessage(
    "{0} reacted with {1} emoji",
    [people, localizeMobileString(pullRequestReactionName(reaction.content), locale)],
    locale,
  );
}

const CONNECTION_HEADLINES = [
  "{0} runs an older T3 Code",
  "{0} is not linked to your T3 Connect account",
  "{0}'s tunnel is still being set up",
  "T3 Connect is not turned on for {0}",
  "{0}'s tunnel is offline",
  "Tunnel works, but T3 Code on {0} did not answer",
  "T3 Code on {0} sent an unexpected answer",
  "{0}'s tunnel address did not resolve",
  "Secure connection to {0}'s tunnel failed",
  "{0}'s tunnel refused the connection",
  "{0} did not answer in time",
  "This device can't reach {0}'s tunnel",
  "T3 Connect could not reach {0}'s tunnel",
  "T3 Code on {0} did not accept this device",
  "T3 Code on {0} did not answer",
] as const;

/** Only for the generated diagnosis headline, never a server error or machine name alone. */
export function mobileConnectionHeadline(
  value: string,
  host: string,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const template = CONNECTION_HEADLINES.find(
    (candidate) => formatMobileMessage(candidate, [host], "en") === value,
  );
  return template
    ? formatMobileMessage(template, [host], locale)
    : localizeMobileString(value, locale);
}

export function mobileAttachmentUploadLabel(
  name: string,
  upload:
    | { readonly status: "failed" }
    | { readonly status: "uploading"; readonly progress: number },
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return upload.status === "failed"
    ? formatMobileMessage("Retry uploading {0}", [name], locale)
    : formatMobileMessage("Uploading {0}, {1}%", [name, Math.floor(upload.progress * 100)], locale);
}

import type { PullRequestReaction, PullRequestReactionContent } from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import {
  pullRequestReactionName,
  pullRequestReactionTooltip,
} from "@t3tools/client-runtime/pull-request-reactions";
import { translateWebMessage } from "./messages";

export function localizedReactionName(
  locale: ResolvedAppLocale,
  content: PullRequestReactionContent,
): string {
  return locale === "en"
    ? pullRequestReactionName(content)
    : translateWebMessage(locale, `audit4.reaction.${content}`);
}

export function localizedReactionTooltip(
  locale: ResolvedAppLocale,
  reaction: PullRequestReaction,
): string {
  if (locale === "en") return pullRequestReactionTooltip(reaction);
  const viewerHasRoom = reaction.actors.length < reaction.count;
  const names =
    reaction.viewerHasReacted && viewerHasRoom
      ? [translateWebMessage(locale, "audit4.reaction.you"), ...reaction.actors]
      : [...reaction.actors];
  const shown = names.slice(0, Math.min(3, reaction.count));
  const others = Math.max(0, reaction.count - shown.length);
  const parts = [
    ...shown,
    ...(others > 0
      ? [
          translateWebMessage(
            locale,
            shown.length > 0 ? "audit4.reaction.others" : "audit4.reaction.people",
            { count: others },
          ),
        ]
      : []),
  ];
  return translateWebMessage(locale, "audit4.reaction.tooltip", {
    names: parts.join("、"),
    reaction: localizedReactionName(locale, reaction.content),
  });
}

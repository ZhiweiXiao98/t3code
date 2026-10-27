import type { WebTranslate } from "~/i18n/WebI18nContext";

/** Diff failures currently include transport wrappers, so recognize the reason inside them. */
export function describePullRequestDiffError(
  error: string,
  providerName: string,
  term: string,
  t?: WebTranslate,
) {
  if (/\brate limit\b|\brate[-_]limited\b|\btoo many requests\b/i.test(error)) {
    return {
      title:
        t?.("pullRequests.diff.rateLimitTitle", { provider: providerName }) ??
        `${providerName} rate limit reached`,
      description:
        t?.("pullRequests.diff.rateLimitDescription", { provider: providerName }) ??
        `${providerName} is temporarily limiting requests, so this diff couldn't be loaded. Try again after the limit resets, or view the changes on ${providerName}.`,
    };
  }

  return {
    title: t?.("pullRequests.diff.unavailableTitle") ?? "Couldn't load the changes",
    description:
      t?.("pullRequests.diff.unavailableDescription", { provider: providerName }) ??
      `The environment couldn't load this ${term}'s diff. Try again, or view the changes on ${providerName}.`,
  };
}

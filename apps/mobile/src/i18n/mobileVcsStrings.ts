import type { GitRunStackedActionResult } from "@t3tools/contracts";
import { formatMobileMessage } from "./mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "./mobileStrings";

const phaseLabels = new Set([
  "Refreshing source control status",
  "Switching branch",
  "Creating branch",
  "Creating worktree",
  "Pulling latest changes",
  "Generating commit message...",
  "Committing...",
  "Preparing feature branch...",
  "Pushing...",
  "Generating PR content...",
  "Generating MR content...",
  "Creating pull request...",
  "Creating merge request...",
  "Preparing PR...",
  "Preparing MR...",
]);

export function mobileVcsProgressLabel(
  label: string | null,
  hookName: string | null,
  locale: MobileLocale = MOBILE_LOCALE,
): string | null {
  if (hookName !== null) return formatMobileMessage("Running {0}...", [hookName], locale);
  return label !== null && phaseLabels.has(label) ? localizeMobileString(label, locale) : label;
}

export function mobileVcsElapsed(
  ms: number | null,
  nowMs: number,
  locale: MobileLocale = MOBILE_LOCALE,
): string | null {
  if (ms === null) return null;
  const elapsed = Math.max(0, Math.floor((nowMs - ms) / 1000));
  return elapsed < 2 ? null : formatMobileMessage("Running for {0}s", [elapsed], locale);
}

export function mobileVcsResultTitle(
  result: GitRunStackedActionResult,
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  const original = result.toast.title;
  const translateIfExpected = (expected: string, template: string, args: Array<string | number>) =>
    original === expected ? formatMobileMessage(template, args, locale) : original;
  if (result.pr.status === "created" || result.pr.status === "opened_existing") {
    const verb = result.pr.status === "created" ? "Created" : "Opened";
    const number = result.pr.number ? ` #${result.pr.number}` : "";
    for (const term of ["PR", "MR"]) {
      if (original === `${verb} ${term}${number}`)
        return formatMobileMessage(`${verb} {0}`, [`${term}${number}`], locale);
    }
    return original;
  }
  const sha = result.commit.commitSha?.slice(0, 7) ?? "";
  if (result.push.status === "pushed") {
    const branch = result.push.upstreamBranch ?? result.push.branch;
    const commit = sha ? ` ${sha}` : "";
    const destination = branch ? ` to ${branch}` : "";
    return translateIfExpected(
      `Pushed${commit}${destination}`,
      branch ? "Pushed{0} to {1}" : "Pushed{0}",
      branch ? [commit, branch] : [commit],
    );
  }
  if (result.commit.status === "created") {
    return sha
      ? translateIfExpected(`Committed ${sha}`, "Committed {0}", [sha])
      : translateIfExpected("Committed changes", "Committed changes", []);
  }
  return translateIfExpected("Done", "Done", []);
}

export function mobileVcsFailure(
  error: unknown,
  fallback: "Git action failed." | "Failed to refresh branches.",
  locale: MobileLocale = MOBILE_LOCALE,
): string {
  return error instanceof Error ? error.message : localizeMobileString(fallback, locale);
}

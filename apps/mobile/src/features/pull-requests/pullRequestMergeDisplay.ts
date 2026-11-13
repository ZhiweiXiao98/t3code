import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";
import type { PullRequestMergeMethod } from "@t3tools/contracts";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";

export function pullRequestMergeConfirmation(
  input: {
    readonly action: "merge" | "enable-auto-merge" | "disable-auto-merge";
    readonly terminology: ChangeRequestTerminology;
    readonly number: number;
    readonly baseBranch: string;
    readonly method: PullRequestMergeMethod | undefined;
    readonly stack: {
      readonly layers: readonly { readonly number: number }[];
      readonly base: string | undefined;
    } | null;
  },
  locale: MobileLocale = MOBILE_LOCALE,
) {
  const term = localizeMobileString(input.terminology.singular, locale);
  const title =
    input.action === "merge"
      ? input.stack && input.stack.layers.length > 1
        ? formatMobileMessage("Merge {0} stack layers?", [input.stack.layers.length], locale)
        : formatMobileMessage("Merge {0}?", [term], locale)
      : localizeMobileString(
          input.action === "enable-auto-merge" ? "Enable auto-merge?" : "Disable auto-merge?",
          locale,
        );
  const message =
    input.action === "merge" && input.stack
      ? formatMobileMessage(
          "Merge {0} into {1} using {2}. Layers above #{3} stay open.",
          [
            input.stack.layers.map((layer) => `#${layer.number}`).join(" → "),
            input.stack.base,
            input.method,
            input.number,
          ],
          locale,
        )
      : input.action === "enable-auto-merge"
        ? formatMobileMessage(
            "Merge #{0} using {1} when its requirements are met. This may happen immediately.",
            [input.number, input.method],
            locale,
          )
        : input.action === "disable-auto-merge"
          ? formatMobileMessage(
              "Stop the provider from automatically merging this {0}.",
              [term],
              locale,
            )
          : formatMobileMessage(
              "Merge #{0} into {1} using {2}.",
              [input.number, input.baseBranch, input.method],
              locale,
            );
  return { title, message };
}

export function pullRequestActionFailure(
  cause: unknown,
  locale: MobileLocale = MOBILE_LOCALE,
  fallback = "Try again.",
): string {
  return cause instanceof Error ? cause.message : localizeMobileString(fallback, locale);
}

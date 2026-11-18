import { readWebI18n } from "~/i18n/readWebI18n";

import type { ThreadTitleRegenerationOutcome } from "@t3tools/contracts";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { stackedThreadToast } from "./ui/toast";

type TitleRegenerationResult = AtomCommandResult<ThreadTitleRegenerationOutcome | null, unknown>;

function failureMessage(result: TitleRegenerationResult): string | null {
  const { t } = readWebI18n();
  if (result._tag === "Failure") {
    if (isAtomCommandInterrupted(result)) return null;
    const error = squashAtomCommandFailure(result);
    return error instanceof Error ? error.message : t("common.error");
  }
  return result.value?.status === "failed"
    ? (result.value.message ?? t("sidebar.titleGenerationFailed"))
    : null;
}

function isKept(result: TitleRegenerationResult): boolean {
  return result._tag === "Success" && result.value?.status === "unchanged";
}

export function titleRegenerationToast(results: ReadonlyArray<TitleRegenerationResult>) {
  const { t } = readWebI18n();
  const failures = results.flatMap((result) => {
    const message = failureMessage(result);
    return message === null ? [] : [message];
  });
  if (failures.length > 0) {
    return stackedThreadToast({
      type: "error",
      title:
        results.length === 1
          ? t("sidebar.regenerateFailed")
          : t("sidebar.regeneratePartialFailed", {
              failed: failures.length,
              total: results.length,
            }),
      description: failures[0],
    });
  }
  const kept = results.filter(isKept).length;
  if (kept === 0) return null;
  if (results.length === 1) {
    return stackedThreadToast({
      type: "info",
      title: t("sidebar.titleKept"),
      description: t("sidebar.titleKeptDescription"),
    });
  }
  return stackedThreadToast({
    type: "info",
    title:
      kept === results.length
        ? t("sidebar.titlesKept")
        : t("sidebar.titlesPartialKept", { kept, total: results.length }),
    description:
      kept === results.length
        ? t("sidebar.titlesKeptDescription")
        : t("sidebar.titlesPartialKeptDescription"),
  });
}

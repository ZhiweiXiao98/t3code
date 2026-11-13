import { translateWebSource } from "~/i18n/messages";
import { readWebI18n } from "~/i18n/readWebI18n";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";

export function offHeadPullRequestCheckoutToast(terminology: ChangeRequestTerminology) {
  return {
    type: "warning",
    title: readWebI18n().t("audit3.offHead"),
    description: readWebI18n().t("audit3.offHeadHelp", {
      request: translateWebSource(readWebI18n().locale, terminology.singular),
    }),
  } as const;
}

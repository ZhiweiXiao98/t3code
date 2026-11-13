import { editorFailureMessage } from "~/editorFailurePresentation";
import { readWebI18n } from "~/i18n/readWebI18n";
import { useI18n } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";
import { useStableCallback } from "~/hooks/useStableCallback";
import {
  AuthOrchestrationOperateScope,
  type EditorId,
  type EnvironmentId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { useOpenInPreferredEditor } from "../editorPreferences";
import { useEnvironmentScope } from "../state/session";
import { Button } from "./ui/button";
import { stackedThreadToast, toastManager } from "./ui/toast";

export function KeybindingsConfigWarning({
  message,
  environmentId,
  configPath,
  availableEditors,
}: {
  message: string;
  environmentId: EnvironmentId | null;
  configPath: string | null;
  availableEditors: readonly EditorId[];
}) {
  const { locale } = useI18n();
  const translate = (source: string) => translateWebSource(locale, source);
  const translateAction = useStableCallback(translate);

  const canOpenEditor = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const openInEditor = useOpenInPreferredEditor(environmentId, availableEditors);

  return (
    <>
      {message}
      <span className="mt-2 flex justify-end">
        <Button
          size="xs"
          variant="outline"
          disabled={!canOpenEditor || !configPath || availableEditors.length === 0}
          onClick={async () => {
            if (!configPath) return;
            const result = await openInEditor(configPath);
            if (result._tag === "Success") return;
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: translateAction("Unable to open keybindings file"),
                description:
                  editorFailureMessage(error, readWebI18n().locale) ??
                  translateAction("Unknown error opening file."),
              }),
            );
          }}
        >
          {translate("Open keybindings.json")}
        </Button>
      </span>
    </>
  );
}

import { cliCommandFailureMessage, installedCliDescription } from "./cliCommandPresentation";
import { translateWebExtraSource } from "~/i18n/webExtraMessages";
import { useState } from "react";
import { useI18n } from "~/i18n/WebI18nContext";
import { translateWebSource } from "~/i18n/messages";

import {
  desktopCliCommandStateAtom,
  getDesktopCliCommandBridge,
  refreshDesktopCliCommandState,
} from "~/state/desktopCliCommand";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const FAILURE_TITLES = {
  install: "Could not install t3",
  uninstall: "Could not remove t3",
  addToPath: "Could not add t3 to PATH",
} as const;

/** The desktop `t3` command's state, and its actions with a toast on failure. */
export function useDesktopCliCommand() {
  const { locale } = useI18n();
  const bridge = getDesktopCliCommandBridge();
  const query = useEnvironmentQuery(bridge ? desktopCliCommandStateAtom : null);
  const [pending, setPending] = useState(false);

  const run = (action: keyof typeof FAILURE_TITLES) => {
    if (!bridge || pending) return;
    setPending(true);
    void bridge[action]()
      .then(refreshDesktopCliCommandState)
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: translateWebSource(
              locale,
              translateWebExtraSource(locale, FAILURE_TITLES[action]),
            ),
            description:
              error instanceof Error
                ? cliCommandFailureMessage(error.message)
                : translateWebSource(locale, "Something went wrong."),
          }),
        );
      })
      .finally(() => setPending(false));
  };

  return {
    state: bridge ? query.data : undefined,
    busy: pending || query.isPending,
    run,
  };
}

export function CliCommandSettingsRow() {
  const { locale, t } = useI18n();
  const { state, busy, run } = useDesktopCliCommand();

  if (!state?.supported) return null;
  const installed = state.installedPath !== null;
  const description = state.shadowedBy
    ? t("webExtra.cli.shadowed", { path: state.shadowedBy })
    : !installed
      ? translateWebExtraSource(locale, "Run T3 Code's CLI as `t3` from any terminal.")
      : installedCliDescription(locale, state);

  return (
    <SettingsRow
      {...searchableSetting("cli-command", locale)}
      description={description}
      control={
        <div className="flex gap-2">
          {state.pathSetup && !state.pathSetup.added ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("addToPath")}>
              {locale === "zh-CN" ? "添加到 PATH" : "Add to PATH"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || (!installed && Boolean(state.shadowedBy))}
            onClick={() => run(installed ? "uninstall" : "install")}
          >
            {translateWebSource(locale, installed ? "Remove" : "Install")}
          </Button>
        </div>
      }
    />
  );
}

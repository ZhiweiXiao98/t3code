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

export function CliCommandSettingsRow() {
  const { locale, t } = useI18n();
  const bridge = getDesktopCliCommandBridge();
  const query = useEnvironmentQuery(bridge ? desktopCliCommandStateAtom : null);
  const state = query.data;
  const [pending, setPending] = useState(false);

  const change = (action: "install" | "uninstall") => {
    if (!bridge || pending) return;
    setPending(true);
    void bridge[action]()
      .then(refreshDesktopCliCommandState)
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: translateWebExtraSource(
              locale,
              action === "install" ? "Could not install t3" : "Could not remove t3",
            ),
            description:
              error instanceof Error
                ? error.message
                : translateWebSource(locale, "Something went wrong."),
          }),
        );
      })
      .finally(() => setPending(false));
  };

  if (!bridge || !state?.supported) return null;
  const installed = state.installedPath !== null;
  const description = state.shadowedBy
    ? t("webExtra.cli.shadowed", { path: state.shadowedBy })
    : !installed
      ? translateWebExtraSource(locale, "Run T3 Code's CLI as `t3` from any terminal.")
      : state.onPath
        ? t("webExtra.cli.installed", { path: state.installedPath ?? "" })
        : t("webExtra.cli.notOnPath", { path: state.installedPath ?? "" });

  return (
    <SettingsRow
      {...searchableSetting("cli-command", locale)}
      description={description}
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={pending || query.isPending || (!installed && Boolean(state.shadowedBy))}
          onClick={() => change(installed ? "uninstall" : "install")}
        >
          {translateWebSource(locale, installed ? "Remove" : "Install")}
        </Button>
      }
    />
  );
}

import { readWebI18n } from "~/i18n/readWebI18n";
import type { EnvironmentId } from "@t3tools/contracts";
import { appSignInTargetForRemote } from "@t3tools/client-runtime/source-control-clients";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { sourceControlEnvironment } from "../state/sourceControl";
import { toastManager } from "./ui/toast";

/**
 * After a clone, suggests installing the forge app on the repository's owner when the server is
 * signed in with it but the app does not reach the repository.
 */
export async function suggestAppAccessForRemote(
  environmentId: EnvironmentId,
  remoteUrl: string,
): Promise<void> {
  const target = appSignInTargetForRemote(remoteUrl);
  if (target === null) return;
  const result = await runAtomCommand(
    appAtomRegistry,
    sourceControlEnvironment.checkAppAccess,
    { environmentId, input: target.input },
    { label: "check app access", reportFailure: false, reportDefect: false },
  );
  if (result._tag !== "Success" || result.value.status !== "not-covered") return;
  const { t } = readWebI18n();
  const owner = target.input.repository.split("/")[0] ?? target.input.repository;
  const id = toastManager.add({
    type: "info",
    title: t("audit.access.title", { app: target.appSignIn.appName, owner }),
    description: t("audit.access.description", { repository: target.input.repository }),
    actionProps: {
      children: t("settings.about.action.install"),
      onClick: () => {
        toastManager.close(id);
        window.open(target.appSignIn.installUrl, "_blank", "noopener,noreferrer");
      },
    },
  });
}

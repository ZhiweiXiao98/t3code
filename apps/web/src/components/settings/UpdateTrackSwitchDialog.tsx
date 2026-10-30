import { useI18n } from "../../i18n/WebI18nContext";
import { translateWebSource } from "../../i18n/messages";
import { useAtomValue } from "@effect/atom-react";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { DesktopUpdateChannel } from "@t3tools/contracts";
import { acceptsTrackSwitchRelease, desktopUpdateChannelOf } from "@t3tools/shared/cliRelease";
import { isMacPlatform } from "@t3tools/shared/keybindings";
import { useState } from "react";
import { AsyncResult } from "effect/reactivity";

import { APP_VERSION } from "~/branding";
import { useDesktopUpdateState } from "~/state/desktopUpdate";
import { useEnvironments } from "~/state/environments";
import { npmReleaseAtom } from "~/state/npmRelease";
import { downloadLocalUpdate, installLocalUpdate } from "../sidebar/SidebarUpdatePill";
import { UpdateEverythingDialog } from "../sidebar/UpdateEverythingDialog";
import {
  channelSwitchLabel,
  localSwitchBlockReason,
  type ChannelSwitchRelease,
} from "../sidebar/updateEverything.logic";
import { isHostedByThisApp, useUpdateEverything } from "../sidebar/useUpdateEverything";
import { prepareLocalTrackSwitch } from "./updateTrackSwitch.logic";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";

/** Moves this app and every connected machine to `channel`. */
export function UpdateTrackSwitchDialog({
  channel,
  onClose,
}: {
  readonly channel: DesktopUpdateChannel;
  readonly onClose: () => void;
}) {
  const { locale } = useI18n();
  const tx = (source: string) => translateWebSource(locale, source);
  // npm dist-tags match the desktop channel names.
  const release = useAtomValue(npmReleaseAtom(channel));
  if (AsyncResult.isSuccess(release) && release.value !== null) {
    return <SwitchPlan release={{ channel, ...release.value }} onClose={onClose} />;
  }
  const label = tx(channelSwitchLabel(channel));
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {locale === "zh-CN" ? `切换到${label}` : `Switch to ${label}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {AsyncResult.isFailure(release) || AsyncResult.isSuccess(release)
              ? locale === "zh-CN"
                ? `未能在 npm 上找到最新的${label}版本。请稍后重试。`
                : `Could not find the latest ${label} release on npm. Try again later.`
              : tx("Checking releases…")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>{tx("Cancel")}</AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function SwitchPlan({
  release,
  onClose,
}: {
  readonly release: ChannelSwitchRelease;
  readonly onClose: () => void;
}) {
  const { locale } = useI18n();
  const tx = (source: string) => translateWebSource(locale, source);
  const updateState = useDesktopUpdateState();
  const { environments } = useEnvironments();
  const crossesLocal = desktopUpdateChannelOf(APP_VERSION) !== release.channel;
  // With its updater off (a .deb install, or no feed) this app stays put and only remotes move.
  const updatesOff = updateState?.enabled === false;
  // After a partial switch this app may already be on the track; then only remotes move.
  const switchesLocal = crossesLocal && !updatesOff;
  const [checking, setChecking] = useState(false);
  const everything = useUpdateEverything(switchesLocal ? release.version : null, release);
  const label = tx(channelSwitchLabel(release.channel));
  // This app's reinstall restarts every server it hosts, so each of their databases must allow it.
  const localBlocked = localSwitchBlockReason(
    APP_VERSION,
    release,
    environments.filter(isHostedByThisApp).map((environment) => ({
      connected: environment.connection.phase === "connected",
      databaseMigration: environment.serverConfig?.environment.databaseMigration,
    })),
    window.desktopBridge?.getLocalEnvironmentBootstraps().length ?? 0,
  );

  const run = async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    // Stay open while the feed is checked; the run's own progress takes over after.
    setChecking(true);
    const fail = (description: string) =>
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: locale === "zh-CN" ? `无法切换到${label}` : `Could not switch to ${label}`,
          description,
        }),
      );
    const prepared = await prepareLocalTrackSwitch(bridge, {
      channel: release.channel,
      version: release.version,
      reinstall: switchesLocal,
    });
    onClose();
    if (!prepared.ok) {
      const outdated =
        /^This app found (.+), which is older than (.+)\. Try again in a few minutes\.$/.exec(
          prepared.message,
        );
      const missing = /^This app found no build of (.+) to install\.$/.exec(prepared.message);
      fail(
        locale !== "zh-CN"
          ? prepared.message
          : outdated
            ? `此应用找到的版本 ${outdated[1]} 低于 ${outdated[2]}。请稍后重试。`
            : missing
              ? `此应用未找到可安装的 ${missing[1]} 构建。`
              : tx(prepared.message),
      );
      return;
    }
    const { local } = prepared;
    const result = await settlePromise(() =>
      everything.run(
        local === null
          ? {}
          : {
              ...(local.status === "available"
                ? {
                    downloadLocal: (reportError) =>
                      downloadLocalUpdate(bridge, { notifyDownloaded: false, reportError }),
                  }
                : {}),
              // Install only a build the database check covers, pinned so nothing replaces it.
              installLocal: async (reportError) => {
                const { downloadedVersion } = await bridge.getUpdateState();
                if (
                  downloadedVersion === null ||
                  !acceptsTrackSwitchRelease(downloadedVersion, release.channel, release.version)
                ) {
                  reportError(
                    tx("Could not install update"),
                    locale === "zh-CN"
                      ? `此应用下载的版本为 ${downloadedVersion ?? "无"}，而非 ${release.version} 或更新版本。`
                      : `This app downloaded ${downloadedVersion ?? "nothing"}, not ${release.version} or newer.`,
                  );
                  return false;
                }
                return installLocalUpdate(bridge, reportError, downloadedVersion);
              },
            },
      ),
    );
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      fail(error instanceof Error ? error.message : tx("An unexpected error occurred."));
    }
  };

  return (
    <UpdateEverythingDialog
      open
      onOpenChange={(open) => !open && !checking && onClose()}
      title={locale === "zh-CN" ? `切换到${label}？` : `Switch to ${label}?`}
      version={release.version}
      providerCount={0}
      rows={everything.rows}
      notes={[
        ...(everything.rows.length === 0 && !crossesLocal
          ? [
              locale === "zh-CN"
                ? `所有已连接机器均已使用${label}。此操作仅保存更新通道。`
                : `Every connected machine is already on ${label}. This only saves the track.`,
            ]
          : []),
        ...(crossesLocal && updatesOff
          ? [tx("This app's updates are off here, so reinstall it yourself to switch.")]
          : []),
        ...(switchesLocal && isMacPlatform(navigator.platform)
          ? [tx("If T3 Code does not reopen after it restarts, open it again.")]
          : []),
      ]}
      restarts={everything.restarts}
      confirmLabel={
        checking ? tx("Checking…") : locale === "zh-CN" ? `切换到${label}` : `Switch to ${label}`
      }
      busy={checking}
      disabledReason={
        !switchesLocal || localBlocked === null
          ? null
          : locale === "zh-CN"
            ? `此应用无法切换：${tx(localBlocked)}。`
            : `This app cannot switch: ${localBlocked}.`
      }
      onConfirm={() => void run()}
    />
  );
}

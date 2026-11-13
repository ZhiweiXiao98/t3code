import { localizeMobileString, MOBILE_LOCALE } from "../../i18n/mobileStrings";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import * as Dialog from "../../components/ui/Dialog";
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type { PullRequestDetail, PullRequestMergeMethod } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useRef, useState } from "react";
import { View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { SplitButton } from "../../components/ui/SplitButton";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { composerPullRequests } from "../../state/pull-requests";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  allowedMergeMethods,
  canPerformPullRequestAction,
  mergeUnavailableReason,
  MERGE_METHODS,
  PR_ACTION_ICONS,
  pullRequestActionLabel,
} from "./pullRequestActions";
import { pullRequestStackMerge, singlePullRequestMergeAllowed } from "./pullRequestStack";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";
import { usePullRequestAction } from "./usePullRequestAction";
import { usePullRequestPermissions } from "./usePullRequestPermissions";
import { PullRequestGlyph } from "./pullRequestGlyphs";
import type { AppSymbolName } from "../../components/ui/AppSymbol";
import type { PullRequestStackState } from "./usePullRequestStack";
import { pullRequestActionFailure, pullRequestMergeConfirmation } from "./pullRequestMergeDisplay";

export function PullRequestMergeControls(props: {
  readonly pr: PullRequestDetail;
  readonly params: PullRequestParams;
  readonly stack: PullRequestStackState;
}) {
  const { pr, stack } = props;
  const terminology = sourceControlClients.get(pr.provider).changeRequest;
  const target = pullRequestTarget(props.params);
  const permissions = usePullRequestPermissions(props.params, pr);
  const stateAction = usePullRequestAction(props.params, pr);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const runAction = useAtomCommand(composerPullRequests.runAction, { reportFailure: false });
  const refreshDetail = useAtomRefresh(composerPullRequests.detail(target));
  const refreshActivity = useAtomRefresh(composerPullRequests.activity(target));
  const [selectedMethod, setSelectedMethod] = useState<PullRequestMergeMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const methods = allowedMergeMethods(pr);
  const preferred =
    selectedMethod ??
    (AsyncResult.isSuccess(preferences) ? preferences.value.pullRequestMergeMethod : undefined) ??
    "squash";
  const method = methods.includes(preferred)
    ? preferred
    : methods.includes("squash")
      ? "squash"
      : methods[0];
  const scope = stack.stack
    ? pullRequestStackMerge(stack.stack, pr.number, terminology, MOBILE_LOCALE)
    : null;
  const canMergeSingle = singlePullRequestMergeAllowed({
    supportsStackActions: stack.supportsStackActions,
    hasStack: stack.stack !== null,
    isFresh: stack.isFresh,
  });
  const checkingStack =
    permissions.connected && stack.supportsStackActions && !stack.isFresh && !stack.error;
  const reason =
    (!permissions.connected
      ? localizeMobileString("Reconnect to merge.")
      : mergeUnavailableReason(pr, permissions.canWrite, terminology, MOBILE_LOCALE)) ??
    (stack.stack
      ? !stack.supportsStackActions
        ? localizeMobileString("This environment can display stacks but cannot merge them.")
        : !stack.isFresh
          ? localizeMobileString("Refresh the stack before merging.")
          : scope?.reason
      : !canMergeSingle
        ? stack.error
          ? localizeMobileString("Couldn't check stack membership. Refresh before merging.")
          : localizeMobileString("Checking stack membership…")
        : null);
  const canMerge = !busy && method !== undefined && !reason;
  const label = method
    ? scope && scope.layers.length > 1
      ? formatMobileMessage("{0} stack ({1})", [
          localizeMobileString(MERGE_METHODS[method].title),
          scope.layers.length,
        ])
      : localizeMobileString(MERGE_METHODS[method].title)
    : localizeMobileString("Merge unavailable");
  const nextAction =
    pr.state === "closed" ? "reopen" : pr.state === "open" && pr.isDraft ? "ready" : null;
  // States the button itself names, instead of a reason line under it. Draft and
  // closed offer their way forward when the viewer can take it.
  const status: {
    label: string;
    icon: AppSymbolName;
    final?: boolean;
    action?: "ready" | "reopen";
  } | null =
    nextAction && stateAction.available(nextAction)
      ? {
          label: pullRequestActionLabel(nextAction, terminology),
          icon: PR_ACTION_ICONS[nextAction],
          final: nextAction === "reopen",
          action: nextAction,
        }
      : pr.state === "merged"
        ? { label: "Merged", icon: PullRequestGlyph.merged, final: true }
        : pr.state === "closed"
          ? { label: "Closed", icon: PullRequestGlyph.closed, final: true }
          : pr.isDraft
            ? { label: "Draft", icon: PullRequestGlyph.draft }
            : pr.mergeability === "conflicting"
              ? { label: "Resolve conflicts to merge", icon: PullRequestGlyph.conflicting }
              : pr.autoMergeEnabled
                ? {
                    label: pr.autoMergeMethod
                      ? formatMobileMessage("Auto-merge pending ({0})", [pr.autoMergeMethod])
                      : localizeMobileString("Auto-merge pending"),
                    icon: "clock",
                  }
                : checkingStack && !busy
                  ? { label: "Checking stack…", icon: PullRequestGlyph.merged }
                  : null;
  const autoAction = pr.autoMergeEnabled ? "disable-auto-merge" : "enable-auto-merge";
  const canAutoMerge =
    !busy &&
    (autoAction === "disable-auto-merge" || (!stack.stack && canMergeSingle)) &&
    permissions.canWrite &&
    canPerformPullRequestAction(pr, autoAction);

  const perform = async (action: "merge" | "enable-auto-merge" | "disable-auto-merge") => {
    if (
      pending.current ||
      (action !== "disable-auto-merge" && !method) ||
      (action === "merge" ? !canMerge : !canAutoMerge)
    )
      return;
    pending.current = true;
    setBusy(true);
    const response = await runAction({
      ...target,
      input: {
        ...target.input,
        action,
        ...(action === "merge" && method && stack.stack && scope
          ? {
              stackNumber: stack.stack.number,
              expectedStackHeads: scope.heads,
              mergeMethod: method,
            }
          : action === "merge" && method
            ? {
                resolveMergeMethod: (fresh) => {
                  if (
                    !canPerformPullRequestAction(fresh, "merge") ||
                    !allowedMergeMethods(fresh).includes(method)
                  )
                    throw new Error(
                      formatMobileMessage("The {0} changed. Refresh before merging.", [
                        localizeMobileString(terminology.singular),
                      ]),
                    );
                  return method;
                },
              }
            : action === "enable-auto-merge" && method
              ? { mergeMethod: method }
              : {}),
      },
    });
    // A stack can partly merge before the provider reports a failure.
    if (!AsyncResult.isSuccess(response)) refreshDetail();
    refreshActivity();
    stack.refresh();
    pending.current = false;
    setBusy(false);
    if (AsyncResult.isFailure(response)) {
      const cause = squashAtomCommandFailure(response);
      Dialog.alertWithLiteralMessage(
        "Couldn't complete the merge action",
        pullRequestActionFailure(cause),
      );
    }
  };
  const confirm = (action: "merge" | "enable-auto-merge" | "disable-auto-merge") => {
    const { title, message } = pullRequestMergeConfirmation({
      action,
      terminology,
      number: pr.number,
      baseBranch: pr.baseBranch,
      method,
      stack: scope ? { layers: scope.layers, base: stack.stack?.base } : null,
    });
    Dialog.alertWithLiteralMessage(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text:
          action === "merge"
            ? label
            : localizeMobileString(
                action === "enable-auto-merge" ? "Enable auto-merge" : "Disable auto-merge",
              ),
        onPress: () => void perform(action),
      },
    ]);
  };
  return (
    <View className="gap-2 border-t border-border-subtle p-3">
      <SplitButton
        label={localizeMobileString(
          busy || stateAction.busy
            ? "Working…"
            : !permissions.connected
              ? "Reconnect to merge"
              : (status?.label ?? label),
        )}
        accessibilityLabel={
          status
            ? localizeMobileString(status.label)
            : scope
              ? formatMobileMessage("{0}, {1} stack layers through #{2}", [
                  label,
                  scope.layers.length,
                  pr.number,
                ])
              : label
        }
        icon={status?.icon ?? PullRequestGlyph.merged}
        disabled={status?.action ? stateAction.busy : !canMerge || status !== null}
        loading={busy || stateAction.busy || (!status?.action && checkingStack)}
        onPress={() =>
          status?.action ? void stateAction.perform(status.action) : confirm("merge")
        }
        menuTitle={localizeMobileString("Merge options")}
        actions={
          status?.final
            ? []
            : [
                ...methods.map((id) => ({
                  id,
                  title: MERGE_METHODS[id].title,
                  state: id === method ? ("on" as const) : ("off" as const),
                  attributes: { disabled: !canMerge && !canAutoMerge },
                })),
                ...(canAutoMerge
                  ? [
                      {
                        id: autoAction,
                        title: pr.autoMergeEnabled ? "Disable auto-merge" : "Enable auto-merge",
                        image: "clock",
                      },
                    ]
                  : []),
              ]
        }
        onPressAction={(id) => {
          const selected = methods.find((method) => method === id);
          if (selected) {
            setSelectedMethod(selected);
            savePreferences({ pullRequestMergeMethod: selected });
          } else if (id === autoAction && canAutoMerge) confirm(autoAction);
        }}
      />
      {permissions.connected && !status && reason ? (
        <Text localize={false} className="px-1 text-xs text-foreground-muted">
          {reason}
        </Text>
      ) : null}
      {stack.error && stack.supportsStackActions ? (
        <Button label="Retry stack lookup" tone="text" onPress={stack.refresh} />
      ) : null}
    </View>
  );
}

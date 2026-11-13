import { MOBILE_LOCALE, localizeMobileString } from "../../i18n/mobileStrings";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { parsePullRequestAnchor } from "@t3tools/shared/pullRequestAnchor";
import { usePullRequestConnected } from "./usePullRequestConnected";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import type { PullRequestAction, PullRequestDetail } from "@t3tools/contracts";
import {
  capitalizeTerm,
  sourceControlClients,
} from "@t3tools/client-runtime/source-control-clients";
import Animated from "react-native-reanimated";
import { PR_ROW_LAYOUT, PR_DISCLOSURE_ENTER, PR_ROW_EXIT } from "./pullRequestAnimations";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { Menu } from "../../components/ui/Menu";
import { PullRequestAvatar } from "./PullRequestPresentation";
import { PullRequestCardRow } from "./PullRequestControls";
import { PullRequestAgentRow } from "./PullRequestAgentRow";
import { PullRequestGlyph } from "./pullRequestGlyphs";
import { composerPullRequests } from "../../state/pull-requests";
import { useEnvironmentQuery } from "../../state/query";
import {
  allowedUpdateMethods,
  PR_ACTION_ICONS,
  pullRequestActionLabel,
} from "./pullRequestActions";
import {
  checkStatus,
  pullRequestBranchSummary,
  pullRequestChecksSummary,
  pullRequestReviewSummary,
  pullRequestStatus,
} from "./pullRequestStatus";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";
import { usePullRequestAction } from "./usePullRequestAction";
import { usePullRequestAgentActions } from "./usePullRequestAgentActions";

type RowProps = { readonly pr: PullRequestDetail; readonly params: PullRequestParams };
const STATUS_ACTIONS: readonly PullRequestAction[] = [
  "ready",
  "draft",
  "close",
  "reopen",
  "revert",
];
const CHECK_PRIORITY = {
  failure: 0,
  "action-required": 1,
  pending: 2,
  cancelled: 3,
  neutral: 4,
  skipped: 5,
  success: 6,
};

export function PullRequestStatusMenu(props: RowProps) {
  const action = usePullRequestAction(props.params, props.pr);
  const actions = STATUS_ACTIONS.filter(action.available);
  const status = pullRequestStatus(props.pr);
  const terminology = sourceControlClients.get(props.pr.provider).changeRequest;
  const term = capitalizeTerm(terminology.singular);
  const trigger = (
    <Pressable
      accessibilityRole={actions.length ? "button" : undefined}
      accessibilityLabel={formatMobileMessage("{0} status, {1}", [
        localizeMobileString(term),
        localizeMobileString(status.label),
      ])}
      disabled={!actions.length}
      className="min-h-8 flex-row items-center gap-1.5 active:opacity-70"
    >
      <SymbolView name={status.icon} size={14} tintColorClassName={status.tint} />
      <Text className={`text-xs font-t3-medium ${status.text}`}>{status.label}</Text>
      {actions.length ? (
        <SymbolView name="chevron.down" size={9} tintColorClassName="accent-icon-muted" />
      ) : null}
    </Pressable>
  );
  if (!actions.length) return trigger;
  return (
    <Menu
      title={formatMobileMessage("{0} status", [localizeMobileString(term)])}
      actions={actions.map((id) => ({
        id,
        title: pullRequestActionLabel(id, terminology, MOBILE_LOCALE),
        image: PR_ACTION_ICONS[id],
        attributes: { destructive: id === "close" },
      }))}
      onPressAction={({ nativeEvent }) => {
        const selected = actions.find((id) => id === nativeEvent.event);
        if (!selected) return;
        if (selected === "close") action.confirmClose();
        else if (selected === "revert")
          action.confirm(
            selected,
            pullRequestActionLabel("revert", terminology, MOBILE_LOCALE),
            formatMobileMessage("Open a new {0} that reverses these changes?", [
              localizeMobileString(terminology.singular),
            ]),
          );
        else void action.perform(selected);
      }}
    >
      {trigger}
    </Menu>
  );
}

export function PullRequestChecksRow(props: RowProps) {
  const linked = parsePullRequestAnchor(props.params.navigationUrl)?.kind === "checks";
  const [expanded, setExpanded] = useState(linked);
  const [seenNavigation, setSeenNavigation] = useState(props.params.navigationId);
  if (props.params.navigationId !== seenNavigation) {
    setSeenNavigation(props.params.navigationId);
    if (linked) setExpanded(true);
  }
  const checks = pullRequestChecksSummary(props.pr);
  const action = usePullRequestAction(props.params, props.pr);
  const definition = sourceControlClients.get(props.pr.provider);
  return (
    <Animated.View layout={PR_ROW_LAYOUT}>
      <PullRequestCardRow
        title={checks.title}
        icon={checks.icon}
        tint={checks.tint}
        value={checks.count}
        compact
        accessibilityLabel={formatMobileMessage("Checks, {0}", [checks.label])}
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <Animated.View
          layout={PR_ROW_LAYOUT}
          entering={PR_DISCLOSURE_ENTER}
          exiting={PR_ROW_EXIT}
          className="pl-8"
        >
          {props.pr.state === "open" &&
          props.pr.checks.some((check) => check.status === "failure") ? (
            <PullRequestAgentRow {...props} task="feedback" title="Fix failing checks" />
          ) : null}
          {action.available("approve-workflows") ? (
            <PullRequestCardRow
              title="Approve workflows"
              icon="checkmark"
              detail={formatMobileMessage("{0} waiting for approval", [
                props.pr.workflowApprovalsRequired,
              ])}
              onPress={() =>
                action.confirm(
                  "approve-workflows",
                  "Approve workflows",
                  formatMobileMessage(
                    "Allow this {0}'s workflows to run? Review the workflow changes first.",
                    [localizeMobileString(definition.changeRequest.singular)],
                  ),
                )
              }
            />
          ) : null}
          {[...props.pr.checks]
            .sort((a, b) => CHECK_PRIORITY[a.status] - CHECK_PRIORITY[b.status])
            .map((check) => {
              const status = checkStatus(check);
              const url = check.url;
              return (
                <PullRequestCardRow
                  key={`${check.name}:${url}`}
                  title={check.name}
                  localizeTitle={false}
                  localizeDetail={false}
                  icon={status.icon}
                  tint={status.tint}
                  value={status.label}
                  detail={check.description ?? undefined}
                  onPress={url ? () => void Linking.openURL(url) : undefined}
                />
              );
            })}
          {!props.pr.checks.length ? (
            <Text className="px-4 py-3 text-xs text-foreground-muted">No checks reported.</Text>
          ) : null}
          <PullRequestCardRow
            title="Open checks on provider"
            icon="arrow.up.right"
            onPress={() =>
              void Linking.openURL(
                definition.changeRequestChecksUrl?.(props.pr.url) ?? props.pr.url,
              )
            }
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function PullRequestBranchRow(props: RowProps) {
  const action = usePullRequestAction(props.params, props.pr);
  const agent = usePullRequestAgentActions(props.params, props.pr);
  const methods = action.available("update-branch") ? allowedUpdateMethods(props.pr) : [];
  const canResolve =
    agent.canAsk && props.pr.state === "open" && props.pr.mergeability === "conflicting";
  const summary = action.busy ? "Updating…" : pullRequestBranchSummary(props.pr);
  const clean = props.pr.mergeability === "mergeable";
  const conflicting = props.pr.mergeability === "conflicting";
  const row = (
    <PullRequestCardRow
      title={
        props.pr.mergeability === "conflicting"
          ? formatMobileMessage("Conflicts with {0}", [props.pr.baseBranch])
          : clean
            ? formatMobileMessage("No conflicts with {0}", [props.pr.baseBranch])
            : "Branch"
      }
      icon={
        conflicting ? PullRequestGlyph.conflicting : clean ? "checkmark.circle" : "arrow.branch"
      }
      tint={
        conflicting
          ? "accent-danger-foreground"
          : clean
            ? "accent-adaptive-emerald-600-400"
            : undefined
      }
      value={
        conflicting || (clean && props.pr.baseComparison !== "behind" && !action.busy)
          ? undefined
          : summary
      }
      compact
      menu={methods.length > 0 || canResolve}
      accessibilityLabel={formatMobileMessage("Branch, {0}", [localizeMobileString(summary)])}
    />
  );
  if (!methods.length && !canResolve) return row;
  return (
    <Menu
      title="Branch"
      actions={[
        ...(canResolve ? [agent.menuAction("conflicts")] : []),
        ...methods.map((id) => ({
          id,
          title: localizeMobileString(`Update with ${id}`),
          image: "arrow.up.circle",
        })),
      ]}
      onPressAction={({ nativeEvent }) => {
        const method = methods.find((id) => id === nativeEvent.event);
        if (method) void action.perform("update-branch", method);
        else agent.select(nativeEvent.event);
      }}
    >
      {row}
    </Menu>
  );
}

export function PullRequestReviewersRow(props: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const navigation = useNavigation();
  const activity = useEnvironmentQuery(
    composerPullRequests.activity(pullRequestTarget(props.params)),
  );
  const summary = pullRequestReviewSummary(props.pr, activity.data);
  const canWrite = useAtomValue(
    composerPullRequests.requestReviewers.permissionAtom(
      pullRequestTarget(props.params).environmentId,
    ),
  );
  const connected = usePullRequestConnected(props.params.environmentId);
  const canRequest =
    connected &&
    canWrite &&
    props.pr.state === "open" &&
    props.pr.capabilities.reviewers.request &&
    props.pr.viewerPermissions.requestReviewers;
  return (
    <Animated.View layout={PR_ROW_LAYOUT}>
      <PullRequestCardRow
        title={summary.title}
        icon={summary.icon}
        tint={summary.tint}
        value={summary.count}
        compact
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <Animated.View
          layout={PR_ROW_LAYOUT}
          entering={PR_DISCLOSURE_ENTER}
          exiting={PR_ROW_EXIT}
          className="pl-8"
        >
          {summary.reviews.map((review) => (
            <View
              key={review.id}
              accessibilityLabel={[
                review.author?.login ?? localizeMobileString("Unknown reviewer"),
                localizeMobileString(
                  review.reviewState === "APPROVED"
                    ? "Approved"
                    : review.reviewState === "CHANGES_REQUESTED"
                      ? "Changes requested"
                      : "Commented",
                ),
              ].join(", ")}
              className="min-h-14 flex-row items-center gap-3 px-4 py-2"
            >
              <SymbolView
                name={
                  review.reviewState === "APPROVED"
                    ? "checkmark"
                    : review.reviewState === "CHANGES_REQUESTED"
                      ? "plusminus"
                      : "bubble.left"
                }
                size={18}
                tintColorClassName={
                  review.reviewState === "APPROVED"
                    ? "accent-adaptive-emerald-600-400"
                    : review.reviewState === "CHANGES_REQUESTED"
                      ? "accent-danger-foreground"
                      : "accent-icon-muted"
                }
              />
              <PullRequestAvatar actor={review.author} size={32} />
              <Text className="min-w-0 flex-1 text-sm font-t3-medium" numberOfLines={1}>
                {review.author?.login ?? "Unknown reviewer"}
              </Text>
            </View>
          ))}
          {props.pr.reviewers
            .filter(
              (reviewer) =>
                !summary.reviews.some((review) => review.author?.login === reviewer.login),
            )
            .map((reviewer) => (
              <View
                key={reviewer.login}
                accessibilityLabel={formatMobileMessage("{0}, Review requested", [reviewer.login])}
                className="min-h-14 flex-row items-center gap-3 px-4 py-2"
              >
                <SymbolView name="clock" size={18} tintColorClassName="accent-icon-muted" />
                <PullRequestAvatar actor={reviewer} size={32} />
                <Text className="min-w-0 flex-1 text-sm font-t3-medium" numberOfLines={1}>
                  {reviewer.login}
                </Text>
              </View>
            ))}
          {canRequest ? (
            <PullRequestCardRow
              title="Request review"
              icon="person.badge.plus"
              onPress={() => navigation.navigate("PullRequestReviewers", props.params)}
            />
          ) : (
            <PullRequestCardRow
              title="View reviewers on provider"
              icon="arrow.up.right"
              onPress={() => void Linking.openURL(props.pr.url)}
            />
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

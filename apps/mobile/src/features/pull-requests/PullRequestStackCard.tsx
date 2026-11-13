import { localizeMobileString } from "../../i18n/mobileStrings";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { useState } from "react";
import { View } from "react-native";
import { useOpenWorkspaceDetail } from "../layout/useOpenWorkspaceDetail";
import { AppText as Text } from "../../components/ui/AppText";
import { PullRequestCardGroup, PullRequestCardRow } from "./PullRequestControls";
import { pullRequestLayerParams } from "./pullRequestStack";
import { pullRequestStatus } from "./pullRequestStatus";
import type { PullRequestParams } from "./usePullRequestDiff";
import type { PullRequestStackState } from "./usePullRequestStack";
import { PullRequestGlyph } from "./pullRequestGlyphs";
import { withKnownPullRequestSummary } from "../../state/use-thread-pr";

export function PullRequestStackCard(props: {
  readonly params: PullRequestParams;
  readonly state: PullRequestStackState;
}) {
  const openDetail = useOpenWorkspaceDetail();
  const [expanded, setExpanded] = useState(false);
  const stack = props.state.stack;
  if (!stack) {
    const summary =
      props.params.initialSummary?.number === props.params.number
        ? props.params.initialSummary.stack
        : undefined;
    if (!summary) return null;
    return (
      <PullRequestCardGroup>
        <PullRequestCardRow
          title="Stack"
          icon={PullRequestGlyph.stack}
          value={formatMobileMessage("{0} of {1}", [summary.position, summary.size])}
          last
        />
      </PullRequestCardGroup>
    );
  }
  const position = stack.layers.findIndex((layer) => layer.number === props.params.number) + 1;
  return (
    <PullRequestCardGroup>
      <PullRequestCardRow
        title="Stack"
        icon={PullRequestGlyph.stack}
        value={formatMobileMessage("{0} of {1}", [position, stack.layers.length])}
        accessibilityLabel={[
          formatMobileMessage("Stack, {0} of {1}", [position, stack.layers.length]),
          props.state.isFresh ? null : localizeMobileString("showing saved stack"),
        ]
          .filter(Boolean)
          .join(", ")}
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        last={!expanded}
      />
      {expanded ? (
        <View>
          {stack.layers.map((layer, index) => {
            const selected = layer.number === props.params.number;
            const status = pullRequestStatus({
              state: layer.state,
              isDraft: layer.isDraft === true,
            });
            return (
              <View key={layer.number} className={selected ? "bg-thread-selected" : undefined}>
                <PullRequestCardRow
                  title={layer.title ?? layer.headBranch}
                  localizeTitle={false}
                  icon={status.icon}
                  tint={status.tint}
                  value={selected ? "Current" : status.label}
                  detail={`#${layer.number} · ${formatMobileMessage("{0} of {1}", [index + 1, stack.layers.length])}`}
                  onPress={
                    selected
                      ? undefined
                      : () =>
                          openDetail({
                            name: "PullRequest",
                            params: withKnownPullRequestSummary(
                              pullRequestLayerParams(props.params, layer.number),
                            ),
                          })
                  }
                  last={index === stack.layers.length - 1}
                />
              </View>
            );
          })}
          <Text className="px-4 py-3 text-xs text-foreground-muted">
            {formatMobileMessage(
              "Base: {0}. Open a layer to review it or merge the stack through that layer.",
              [stack.base],
            )}
          </Text>
        </View>
      ) : null}
    </PullRequestCardGroup>
  );
}

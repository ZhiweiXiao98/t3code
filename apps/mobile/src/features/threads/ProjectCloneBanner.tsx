import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { mobileCloneProgress } from "../../i18n/threadDisplayMessages";
import { Button } from "../../components/ui/Button";
import { projectCloneDisplayName, type ProjectCloneSnapshot } from "@t3tools/contracts";
import { View } from "react-native";

import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { cn } from "../../lib/cn";
import { AppText as Text } from "../../components/ui/AppText";

export function ProjectCloneBanner(props: {
  readonly clone: ProjectCloneSnapshot;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onRemove: () => void;
}) {
  const { clone } = props;
  const name = projectCloneDisplayName(clone);
  if (clone.phase === "running") {
    return (
      <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
        <AppActivityIndicator size="small" />
        <View className="min-w-0 flex-1">
          <Text localize={false} className="font-t3-medium text-sm" numberOfLines={1}>
            {formatMobileMessage("Cloning {0}", [name])}
          </Text>
          <Text localize={false} className="text-xs text-foreground-muted" numberOfLines={1}>
            {mobileCloneProgress(clone)}
          </Text>
        </View>
        <BannerAction label="Cancel" onPress={props.onCancel} />
      </View>
    );
  }
  const cancelled = clone.phase === "cancelled";
  return (
    <View
      className={cn(
        "rounded-2xl border px-3.5 py-3",
        cancelled ? "border-warning-border bg-warning" : "border-danger-border bg-danger",
      )}
    >
      <Text
        localize={false}
        className={cn(
          "font-t3-medium text-sm",
          cancelled ? "text-warning-foreground" : "text-danger-foreground",
        )}
        numberOfLines={1}
      >
        {formatMobileMessage(cancelled ? "Cancelled cloning {0}" : "Failed to clone {0}", [name])}
      </Text>
      {clone.error ? (
        <Text localize={false} className="mt-0.5 text-xs text-danger-foreground" numberOfLines={3}>
          {clone.error}
        </Text>
      ) : null}
      <View className="mt-2 flex-row justify-end gap-2">
        <BannerAction label="Remove project" onPress={props.onRemove} />
        <BannerAction label="Retry" onPress={props.onRetry} />
      </View>
    </View>
  );
}

function BannerAction(props: { readonly label: string; readonly onPress: () => void }) {
  return (
    <Button
      label={props.label}
      tone="secondary"
      accessibilityLabel={props.label}
      onPress={props.onPress}
    />
  );
}

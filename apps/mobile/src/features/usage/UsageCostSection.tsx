import type { MergedUsage } from "@t3tools/shared/usageMerge";
import { formatUsd } from "@t3tools/shared/usageFormat";
import { View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { localizeMobileString, MOBILE_LOCALE, type MobileLocale } from "../../i18n/mobileStrings";
import { SettingsSection } from "../settings/components/SettingsSection";
import { mobileUsageCostLabel } from "./usageDisplay";
import { useUsageMixColors } from "./usageProviders";

export function UsageCostSection(props: {
  readonly merged: Pick<MergedUsage, "categoryCost" | "speedCost" | "costUsd">;
  readonly wide: boolean;
  readonly locale?: MobileLocale;
}) {
  const locale = props.locale ?? MOBILE_LOCALE;
  const { categoryCost, speedCost } = props.merged;
  const colors = useUsageMixColors();
  const byType = [
    {
      label: mobileUsageCostLabel("input", locale),
      value: categoryCost.input,
      color: colors.input,
    },
    {
      label: mobileUsageCostLabel("cacheRead", locale),
      value: categoryCost.cacheRead,
      color: colors.cacheRead,
    },
    {
      label: mobileUsageCostLabel("cacheWrite", locale),
      value: categoryCost.cacheWrite,
      color: colors.cacheWrite,
    },
    {
      label: mobileUsageCostLabel("output", locale),
      value: categoryCost.output,
      color: colors.output,
    },
    // Reported cost with no rates to split it, or from older servers. Below a
    // cent it is rounding, not usage.
    {
      label: mobileUsageCostLabel("other", locale),
      value: categoryCost.unsplit >= 0.005 ? categoryCost.unsplit : 0,
      color: colors.other,
    },
  ];
  const bySpeed = [
    {
      label: mobileUsageCostLabel("standard", locale),
      value: speedCost.standard,
      color: colors.standard,
    },
    { label: mobileUsageCostLabel("fast", locale), value: speedCost.fast, color: colors.fast },
    {
      label: mobileUsageCostLabel("ultrafast", locale),
      value: speedCost.ultrafast,
      color: colors.ultrafast,
    },
  ];
  if (props.merged.costUsd <= 0) return null;

  return (
    <SettingsSection title={localizeMobileString("Cost", locale)} localizeTitle={false}>
      <View className={props.wide ? "flex-row" : undefined}>
        <View className={props.wide ? "min-w-0 flex-1" : undefined}>
          <ShareBar label={localizeMobileString("By type", locale)} segments={byType} />
        </View>
        {speedCost.fast + speedCost.ultrafast > 0 ? (
          <View
            className={
              props.wide
                ? "min-w-0 flex-1 border-l border-border-subtle"
                : "border-t border-border-subtle"
            }
          >
            <ShareBar
              label={localizeMobileString("By speed", locale)}
              segments={bySpeed}
              aside={formatMobileMessage("{0} premium", [formatUsd(speedCost.premium)], locale)}
            />
          </View>
        ) : null}
      </View>
    </SettingsSection>
  );
}

function ShareBar(props: {
  readonly label: string;
  readonly segments: readonly { label: string; value: number; color: string }[];
  readonly aside?: string;
}) {
  const visible = props.segments.filter((segment) => segment.value > 0);
  if (visible.length === 0) return null;

  return (
    <View className="gap-3 p-4">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text localize={false} className="text-sm text-foreground-muted">
          {props.label}
        </Text>
        {props.aside ? (
          <Text localize={false} className="text-sm tabular-nums text-foreground-muted">
            {props.aside}
          </Text>
        ) : null}
      </View>
      <View className="h-2 flex-row gap-0.5">
        {visible.map((segment) => (
          <View
            key={segment.label}
            className="h-full rounded-sm"
            style={{ flex: segment.value, backgroundColor: segment.color }}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((segment) => (
          <View key={segment.label} className="flex-row items-center gap-1.5">
            <View className="size-2 rounded-sm" style={{ backgroundColor: segment.color }} />
            <Text localize={false} className="text-sm text-foreground-muted">
              {segment.label}
            </Text>
            <Text localize={false} className="text-sm tabular-nums text-foreground">
              {formatUsd(segment.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

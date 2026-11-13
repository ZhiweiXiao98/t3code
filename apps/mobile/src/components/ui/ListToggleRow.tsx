import { localizeMobileString } from "../../i18n/mobileStrings";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { Pressable } from "react-native";

import { AppText } from "./AppText";
import { ListRowLayout, type ListRowContentProps } from "./ListRowLayout";
import { ThemedSwitch } from "./ThemedSwitch";

export function ListToggleRow(
  props: Omit<ListRowContentProps, "detail"> & {
    readonly value: boolean | null;
    readonly onValueChange: (value: boolean) => void;
  },
) {
  return (
    <ListRowLayout
      icon={props.icon}
      label={props.label}
      localizeLabel={props.localizeLabel}
      localizeDescription={props.localizeDescription}
      description={props.description}
      disabled={props.disabled}
      accessory={
        props.value === null ? (
          <Pressable
            accessibilityLabel={formatMobileMessage("Set {0} on for selected environments", [
              props.localizeLabel === false ? props.label : localizeMobileString(props.label ?? ""),
            ])}
            accessibilityRole="button"
            accessibilityHint={
              props.localizeDescription === false || props.description === undefined
                ? props.description
                : localizeMobileString(props.description)
            }
            accessibilityState={{ disabled: Boolean(props.disabled) }}
            disabled={props.disabled}
            className="rounded-full bg-subtle px-3 py-2 active:opacity-70"
            onPress={() => props.onValueChange(true)}
          >
            <AppText className="text-sm font-t3-medium text-foreground">Mixed · Set on</AppText>
          </Pressable>
        ) : (
          <ThemedSwitch
            localizeAccessibilityLabel={props.localizeLabel}
            localizeAccessibilityHint={false}
            accessibilityLabel={props.label}
            accessibilityHint={
              props.localizeDescription === false || props.description === undefined
                ? props.description
                : localizeMobileString(props.description)
            }
            disabled={props.disabled}
            onValueChange={props.onValueChange}
            value={props.value}
          />
        )
      }
    />
  );
}

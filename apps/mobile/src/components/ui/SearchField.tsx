import { localizeMobileString } from "../../i18n/mobileStrings";
import type { RefObject } from "react";
import { Pressable, TextInput, type TextInputInstance, View } from "react-native";

import { SymbolView } from "./AppSymbol";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

export interface SearchFieldProps {
  readonly localize?: boolean;
  readonly autoFocus?: boolean;
  readonly inputRef: RefObject<TextInputInstance | null>;
  readonly accessibilityLabel: string;
  readonly clearAccessibilityLabel: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}

export function SearchField({
  inputRef,
  localize = true,
  autoFocus = true,
  accessibilityLabel,
  clearAccessibilityLabel,
  placeholder,
  value,
  onChangeText,
}: SearchFieldProps) {
  const { scale, mediumIconSize } = useAndroidControlSizing();
  return (
    <View
      className="min-w-0 flex-1 flex-row items-center rounded-full border border-input-border bg-input"
      style={{
        minHeight: Math.max(48, 42 * scale),
        gap: 7 * scale,
        paddingHorizontal: 10.5 * scale,
      }}
    >
      <SymbolView
        name="magnifyingglass"
        size={mediumIconSize}
        tintColorClassName="accent-foreground-muted"
      />
      <TextInput
        ref={inputRef}
        accessibilityLabel={
          localize ? localizeMobileString(accessibilityLabel) : accessibilityLabel
        }
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        placeholder={localize ? localizeMobileString(placeholder) : placeholder}
        placeholderTextColorClassName="accent-placeholder"
        selectionColorClassName="accent-focus/32"
        cursorColorClassName="accent-focus"
        selectionHandleColorClassName="accent-focus"
        className="min-w-0 flex-1 font-sans text-base text-foreground"
        style={{ paddingVertical: 7 * scale }}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel={
            localize ? localizeMobileString(clearAccessibilityLabel) : clearAccessibilityLabel
          }
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            onChangeText("");
            inputRef.current?.focus();
          }}
        >
          <SymbolView
            name="xmark.circle.fill"
            size={mediumIconSize}
            tintColorClassName="accent-foreground-muted"
          />
        </Pressable>
      ) : null}
    </View>
  );
}

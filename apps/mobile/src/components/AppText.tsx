import { Children, type ReactNode } from "react";
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  type TextProps as RNTextProps,
} from "react-native";

import { cn } from "../lib/cn";
import { localizeMobileString } from "../i18n/mobileStrings";

export type AppTextProps = RNTextProps & {
  readonly className?: string;
  /** UI copy is localized by default; disable this for user-, server-, or repository-owned text. */
  readonly localize?: boolean;
};

/**
 * Thin wrapper around RN Text with default font-family and foreground color.
 * Uses Uniwind className — no manual style parsing.
 */
function localizeTextChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === "string" ? localizeMobileString(child) : child,
  );
}

export function AppText({
  accessibilityLabel,
  children,
  className,
  localize = true,
  ...props
}: AppTextProps) {
  return (
    <RNText
      accessibilityLabel={
        accessibilityLabel === undefined || !localize
          ? accessibilityLabel
          : localizeMobileString(accessibilityLabel)
      }
      className={cn("font-sans text-foreground", className)}
      {...props}
    >
      {localize ? localizeTextChildren(children) : children}
    </RNText>
  );
}

export type AppTextInputProps = Omit<RNTextInputProps, "placeholderTextColor"> & {
  readonly className?: string;
  readonly ref?: React.Ref<RNTextInput>;
};

/**
 * Thin wrapper around RN TextInput with default input styling.
 * Uses Uniwind className — no manual style parsing.
 */
export function AppTextInput({
  accessibilityLabel,
  className,
  placeholder,
  ref,
  ...props
}: AppTextInputProps) {
  return (
    <RNTextInput
      ref={ref}
      accessibilityLabel={
        accessibilityLabel === undefined ? undefined : localizeMobileString(accessibilityLabel)
      }
      className={cn(
        "min-h-13.5 rounded-2xl border border-input-border bg-input px-3.5 py-3 font-sans text-base text-foreground",
        className,
      )}
      placeholder={placeholder === undefined ? undefined : localizeMobileString(placeholder)}
      placeholderTextColorClassName="accent-placeholder"
      {...props}
    />
  );
}

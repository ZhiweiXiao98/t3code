import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
  useWindowDimensions: () => ({ fontScale: 1 }),
  Pressable: ({
    accessibilityLabel,
    accessibilityHint,
    onPress,
    disabled,
    children,
  }: {
    accessibilityLabel?: string;
    accessibilityHint?: string;
    onPress?: () => void;
    disabled?: boolean;
    children?: ReactNode;
  }) => (
    <button
      aria-label={accessibilityLabel}
      aria-description={accessibilityHint}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  Switch: ({
    accessibilityLabel,
    accessibilityHint,
    onValueChange,
    value,
    disabled,
  }: {
    accessibilityLabel?: string;
    accessibilityHint?: string;
    onValueChange?: (value: boolean) => void;
    value?: boolean;
    disabled?: boolean;
  }) => (
    <button
      aria-label={accessibilityLabel}
      aria-description={accessibilityHint}
      disabled={disabled}
      onClick={() => onValueChange?.(!value)}
    />
  ),
}));
vi.mock("./NativeSwitch", () => ({ NativeSwitch: () => null }));
vi.mock("./AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, "zh-CN"),
  };
});
import { ListToggleRow } from "./ListToggleRow";

it("honors literal labels and hints through mixed and switch controls without changing actions", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    for (const value of [null, true, false]) {
      for (const localize of [undefined, false]) {
        const container = document.createElement("div");
        const root = createRoot(container);
        const change = vi.fn();
        try {
          act(() =>
            root.render(
              <ListToggleRow
                label="Settings"
                description="Open"
                localizeLabel={localize}
                localizeDescription={localize}
                value={value}
                onValueChange={change}
              />,
            ),
          );
          const button = container.querySelector("button");
          expect(button).not.toBeNull();
          expect(button?.getAttribute("aria-description")).toBe(
            localize === false ? "Open" : "打开",
          );
          expect(button?.getAttribute("aria-label")).toContain(
            localize === false ? "Settings" : "设置",
          );
          const texts = Array.from(container.querySelectorAll("span"), (node) => node.textContent);
          expect(texts).toContain(localize === false ? "Settings" : "设置");
          expect(texts).toContain(localize === false ? "Open" : "打开");
          act(() => button?.click());
          expect(change).toHaveBeenCalledExactlyOnceWith(value === null ? true : !value);
        } finally {
          act(() => root.unmount());
        }
      }
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

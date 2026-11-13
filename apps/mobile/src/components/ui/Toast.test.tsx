import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
const { announce, platform } = vi.hoisted(() => ({
  announce: vi.fn(),
  platform: { OS: process.env.T3_MOBILE_TEST_PLATFORM === "android" ? "android" : "ios" },
}));
vi.mock("react-native", () => ({
  Platform: platform,
  AccessibilityInfo: { announceForAccessibility: announce },
  StyleSheet: { absoluteFill: {} },
  View: ({
    children,
    accessibilityRole,
    accessibilityLabel,
    onAccessibilityAction,
  }: {
    children?: ReactNode;
    accessibilityRole?: string;
    onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
    accessibilityLabel?: string;
  }) => (
    <div
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      onKeyDown={(event) =>
        onAccessibilityAction?.({
          nativeEvent: { actionName: event.key === "Escape" ? "dismiss" : "activate" },
        })
      }
    >
      {children}
    </div>
  ),
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("react-native-gesture-handler", () => ({
  GestureDetector: "div",
  usePanGesture: vi.fn(),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: "div" },
  cancelAnimation: vi.fn(),
  withTiming: (value: number, _options?: unknown, onComplete?: (finished: boolean) => void) => {
    onComplete?.(true);
    return value;
  },
  runOnJS: <Args extends unknown[], Result>(callback: (...args: Args) => Result) => callback,
  useSharedValue: (value: number) => ({ value, get: () => value, set: vi.fn() }),
  useAnimatedStyle: (style: () => unknown) => style(),
  Easing: { out: vi.fn(), cubic: vi.fn() },
  FadeOut: { duration: () => ({ reduceMotion: () => ({}) }) },
  ReduceMotion: { System: "system" },
}));
vi.mock("./useControlTheme", () => ({ useControlTheme: () => ({ colorScheme: "light" }) }));
vi.mock("./AppText", () => ({
  AppText: ({
    children,
    localize,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    localize?: boolean;
    accessibilityLabel?: string;
  }) => (
    <span data-localize={String(localize)} aria-label={accessibilityLabel}>
      {children}
    </span>
  ),
}));
vi.mock("./Button", () => ({ Button: "Button" }));
vi.mock("./GlassSurface", () => ({ GlassSurface: "div" }));
vi.mock("./IconButton", () => ({ IconButton: "IconButton" }));
vi.mock("./AppActivityIndicator", () => ({ AppActivityIndicator: "Activity" }));
vi.mock("./AppSymbol", () => ({ SymbolView: "Symbol" }));
vi.mock("../../i18n/mobileStrings", () => ({
  localizeMobileString: (text: string) =>
    text === "Settings" ? "设置" : text === "Open" ? "打开" : text,
}));
import { Toast } from "./Toast";

it.runIf(platform.OS === "ios")(
  "applies provenance to normal and single-line toast text and VoiceOver without retranslating opaque content",
  () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    try {
      for (const localizeMessage of [undefined, false, true]) {
        for (const localizeDescription of [undefined, false, true]) {
          for (const singleLine of [false, true]) {
            const container = document.createElement("div");
            const root = createRoot(container);
            try {
              act(() =>
                root.render(
                  <Toast
                    message="Settings"
                    description="Open"
                    localizeMessage={localizeMessage}
                    localizeDescription={localizeDescription}
                    singleLine={singleLine}
                  />,
                ),
              );
              const rows = container.querySelectorAll("span");
              const message = localizeMessage === false ? "Settings" : "设置";
              const description = localizeDescription === false ? "Open" : "打开";
              expect(rows[0]?.textContent).toBe(
                singleLine ? `${message}: ${description}` : message,
              );
              expect(rows[0]?.getAttribute("data-localize")).toBe("false");
              if (singleLine)
                expect(rows[0]?.getAttribute("aria-label")).toBe(`${message}: ${description}`);
              else {
                expect(rows[1]?.textContent).toBe(description);
                expect(rows[1]?.getAttribute("data-localize")).toBe("false");
              }
              expect(announce).toHaveBeenLastCalledWith(message);
            } finally {
              act(() => root.unmount());
            }
          }
        }
      }
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it.runIf(platform.OS === "android")(
  "keeps the Android swipe-dismiss accessibility alert in the same provenance mode",
  () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    try {
      for (const localizeMessage of [undefined, false, true]) {
        const container = document.createElement("div");
        const root = createRoot(container);
        const onDismiss = vi.fn();
        try {
          act(() =>
            root.render(
              <Toast
                message="Settings"
                localizeMessage={localizeMessage}
                dismissMode="swipe"
                onDismiss={onDismiss}
              />,
            ),
          );
          expect(container.querySelector('[role="alert"]')?.getAttribute("aria-label")).toBe(
            localizeMessage === false ? "Settings" : "设置",
          );
          const alert = container.querySelector('[role="alert"]')!;
          act(() =>
            alert.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
          );
          expect(onDismiss).not.toHaveBeenCalled();
          act(() =>
            alert.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
          );
          expect(onDismiss).toHaveBeenCalledExactlyOnceWith();
        } finally {
          act(() => root.unmount());
        }
      }
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

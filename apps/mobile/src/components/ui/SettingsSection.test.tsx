import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({ platform: { OS: "ios" }, fontScale: 1, locale: "zh-CN" }));
vi.mock("react-native", () => ({
  Platform: state.platform,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
  useWindowDimensions: () => ({ fontScale: state.fontScale }),
}));
vi.mock("uniwind", () => ({ useResolveClassNames: () => ({ backgroundColor: "#fff" }) }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({}),
  useRoute: () => ({ name: "Settings" }),
}));
vi.mock("../../features/settings/settings-navigation", () => ({ openSettings: vi.fn() }));
vi.mock("./AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("./RadioIndicator", () => ({ RadioIndicator: () => null }));
vi.mock("./RowPressable", () => ({
  RowPressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress: () => void;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (text: string) =>
      actual.localizeMobileString(text, state.locale === "en" ? "en" : "zh-CN"),
  };
});
import {
  SettingsSection,
  SettingsSidebarContext,
} from "../../features/settings/components/SettingsSection";
import { SettingsRow } from "../../features/settings/components/SettingsRow";
it("keeps environment section titles literal in both normal and sidebar layouts without changing the default", () => {
  state.locale = "zh-CN";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    for (const sidebar of [null, { selected: "providers" }]) {
      for (const localizeTitle of [undefined, false]) {
        const container = document.createElement("div");
        const root = createRoot(container);
        try {
          act(() =>
            root.render(
              <SettingsSidebarContext value={sidebar}>
                <SettingsSection title="Settings" localizeTitle={localizeTitle}>
                  <button>Action</button>
                </SettingsSection>
              </SettingsSidebarContext>,
            ),
          );
          expect(container.querySelector("span")?.textContent).toBe(
            localizeTitle === false ? "Settings" : "设置",
          );
          expect(container.querySelector("button")?.textContent).toBe("Action");
        } finally {
          act(() => root.unmount());
        }
      }
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps literal settings values unchanged across spoken, below, trailing and scaled detail layouts", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    for (const locale of ["en", "zh-CN"]) {
      state.locale = locale;
      for (const platform of ["ios", "android"]) {
        state.platform.OS = platform;
        for (const fontScale of [1, 2]) {
          state.fontScale = fontScale;
          for (const sidebar of [null, { selected: "providers" }]) {
            for (const valuePosition of [undefined, "below", "trailing"] as const) {
              for (const localizeValue of [undefined, false, true]) {
                const onPress = vi.fn();
                act(() =>
                  root.render(
                    <SettingsSidebarContext value={sidebar}>
                      <SettingsRow
                        icon="person.crop.circle"
                        label="Settings"
                        localizeLabel={false}
                        value="Open"
                        localizeValue={localizeValue}
                        valuePosition={valuePosition}
                        onPress={onPress}
                      />
                    </SettingsSidebarContext>,
                  ),
                );
                const value = locale === "zh-CN" && localizeValue !== false ? "打开" : "Open";
                const button = container.querySelector("button")!;
                expect(button.textContent).toBe(`Settings${value}`);
                expect(button.getAttribute("aria-label")).toBe(`Settings, ${value}`);
                act(() => button.click());
                expect(onPress).toHaveBeenCalledOnce();
              }
            }
          }
        }
      }
    }
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

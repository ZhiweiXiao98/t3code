import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("react-native", () => ({
  Platform: platform,
  Pressable: () => null,
  View: () => null,
}));
vi.mock("./AppText", () => ({ AppText: () => null }));
vi.mock("./AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("./useAndroidControlSizing", () => ({
  useAndroidControlSizing: () => ({ smallIconSize: 16 }),
}));
vi.mock("../../features/settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeVariables: { "--color-subtle-strong": "#111111" } }),
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return { ...actual, localizeMobileString: vi.fn(actual.localizeMobileString) };
});

import { localizeMobileString } from "../../i18n/mobileStrings";
import { NavigationRow } from "./NavigationRow";
import { SelectionRow } from "./SelectionRow";

it("preserves picker names on both platforms and translates only independently opted-in copy", async () => {
  const actual = await vi.importActual<typeof import("../../i18n/mobileStrings")>(
    "../../i18n/mobileStrings",
  );
  for (const locale of ["en", "zh-CN"] as const) {
    vi.mocked(localizeMobileString).mockImplementation((value) =>
      actual.localizeMobileString(value, locale),
    );
    for (const os of ["ios", "android"]) {
      platform.OS = os;
      for (const localizeTitle of [undefined, false, true]) {
        for (const localizeSubtitle of [undefined, false, true]) {
          const onPress = vi.fn();
          const row = SelectionRow({
            title: "Settings",
            subtitle: "Open",
            ...(localizeTitle === undefined ? {} : { localizeTitle }),
            ...(localizeSubtitle === undefined ? {} : { localizeSubtitle }),
            selected: true,
            onPress,
          });
          const expectedTitle = localizeTitle
            ? actual.localizeMobileString("Settings", locale)
            : "Settings";
          const expectedSubtitle = localizeSubtitle
            ? actual.localizeMobileString("Open", locale)
            : "Open";
          if (os === "android") {
            expect(row.type).toBe(NavigationRow);
            expect(row.props.localizeTitle).toBe(false);
            expect(row.props.localizeSubtitle).toBe(false);
          }
          const native = os === "android" ? NavigationRow(row.props) : row;
          expect(native.props.accessibilityLabel).toBe(`${expectedTitle}, ${expectedSubtitle}`);
          expect(native.props.accessibilityState.checked).toBe(true);
          expect(native.props.onPress).toBe(onPress);
          native.props.onPress();
          expect(onPress).toHaveBeenCalledOnce();
          const content = Children.toArray(native.props.children).find(
            (child) =>
              isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined,
          );
          if (!isValidElement<{ children: ReactNode }>(content))
            throw new Error("Missing picker text container");
          const texts = Children.toArray(content.props.children);
          for (const [index, expected] of [expectedTitle, expectedSubtitle].entries()) {
            const text = texts[index];
            if (!isValidElement<{ children: ReactNode; localize: boolean }>(text))
              throw new Error("Missing picker text");
            expect(text.props.children).toBe(expected);
            expect(text.props.localize).toBe(false);
          }
        }
      }
    }
  }
});

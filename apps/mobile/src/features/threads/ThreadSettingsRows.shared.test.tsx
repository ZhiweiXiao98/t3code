import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({ Pressable: () => null, View: () => null }));
vi.mock("../../components/ui/AppText", () => ({ AppText: () => null }));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return { ...actual, localizeMobileString: vi.fn(actual.localizeMobileString) };
});

import { localizeMobileString } from "../../i18n/mobileStrings";
import { ChoiceRowContent } from "./ThreadSettingsRows.shared";

it("only localizes client-owned choices and preserves colliding provider text and selection", async () => {
  const actual = await vi.importActual<typeof import("../../i18n/mobileStrings")>(
    "../../i18n/mobileStrings",
  );
  for (const locale of ["en", "zh-CN"] as const) {
    vi.mocked(localizeMobileString).mockImplementation((value) =>
      actual.localizeMobileString(value, locale),
    );
    for (const localize of [undefined, false, true]) {
      const onPress = vi.fn();
      const view = ChoiceRowContent({
        label: "Link custom",
        description: "Settings",
        ...(localize === undefined ? {} : { localize }),
        selected: true,
        isLast: true,
        onPress,
      });
      const expectedLabel = localize
        ? actual.localizeMobileString("Link custom", locale)
        : "Link custom";
      const expectedDescription = localize
        ? actual.localizeMobileString("Settings", locale)
        : "Settings";
      expect(view.props.accessibilityLabel).toBe(`${expectedLabel}. ${expectedDescription}`);
      expect(view.props.accessibilityState.checked).toBe(true);
      view.props.onPress();
      expect(onPress).toHaveBeenCalledOnce();
      const content = Children.toArray(view.props.children).find(
        (child) =>
          isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined,
      );
      if (!isValidElement<{ children: ReactNode }>(content))
        throw new Error("Missing choice content");
      const text = Children.toArray(content.props.children);
      for (const [index, expected] of [expectedLabel, expectedDescription].entries()) {
        const child = text[index];
        if (!isValidElement<{ children: ReactNode; localize: boolean }>(child))
          throw new Error("Missing choice text");
        expect(child.props.children).toBe(expected);
        expect(child.props.localize).toBe(false);
      }
    }
  }
});

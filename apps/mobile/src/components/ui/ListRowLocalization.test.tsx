import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: "View",
  useWindowDimensions: () => ({ fontScale: 1 }),
}));
vi.mock("uniwind", () => ({ useResolveClassNames: () => ({ backgroundColor: "#fff" }) }));
vi.mock("./AppText", () => ({ AppText: "AppText" }));
vi.mock("./AppSymbol", () => ({ SymbolView: "SymbolView" }));
vi.mock("./RowPressable", () => ({ RowPressable: "RowPressable" }));
vi.mock("./RadioIndicator", () => ({ RadioIndicator: "RadioIndicator" }));
vi.mock("./AppActivityIndicator", () => ({ AppActivityIndicator: "AppActivityIndicator" }));
vi.mock("../../i18n/mobileStrings", () => ({
  localizeMobileString: (text: string) =>
    text === "Settings" ? "设置" : text === "Open" ? "打开" : text,
}));
import { ListChoiceRow } from "./ListChoiceRow";
import { ListActionRow } from "./ListActionRow";
import { ListRow } from "./ListRow";
import { ListRowLayout } from "./ListRowLayout";

function textProps(node: ReactNode): Array<{ children?: ReactNode; localize?: boolean }> {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; localize?: boolean }>(child)) return [];
    return child.type === "AppText" ? [child.props] : textProps(child.props.children);
  });
}

it("opts provider model name and description out at both accessibility and text boundaries", () => {
  for (const localizeDescription of [undefined, false, true]) {
    const props = {
      label: "Settings",
      localizeLabel: false,
      description: "Open",
      localizeDescription,
      onPress: vi.fn(),
    };
    for (const row of [ListChoiceRow({ ...props, selected: true }), ListActionRow(props)]) {
      expect(row.props.accessibilityLabel).toBe("Settings");
      expect(row.props.accessibilityHint).toBe(localizeDescription === false ? "Open" : "打开");
      expect(row.props.children.props.localizeDescription).toBe(localizeDescription);
    }
    expect(ListRow(props).props.accessibilityLabel).toBe(
      `Settings, ${localizeDescription === false ? "Open" : "打开"}`,
    );
    const texts = textProps(ListRowLayout(props));
    expect(texts[0]).toMatchObject({ children: "Settings", localize: false });
    expect(texts[1]).toMatchObject({ children: "Open", localize: localizeDescription ?? true });
  }
});

it("keeps unsupported server reasons literal while retaining app-owned local-model states", () => {
  for (const connected of [false, true]) {
    for (const supported of [undefined, false] as const) {
      const serverReason = "Open";
      const description = !connected ? "Settings" : supported === false ? serverReason : "Settings";
      const localizeDescription = !connected || supported !== false;
      const row = ListChoiceRow({
        label: "Local model",
        description,
        localizeDescription,
        selected: false,
        onPress: vi.fn(),
      });
      expect(row.props.accessibilityHint).toBe(
        connected && supported === false ? serverReason : "设置",
      );
      expect(row.props.children.props.localizeDescription).toBe(localizeDescription);
    }
  }
});

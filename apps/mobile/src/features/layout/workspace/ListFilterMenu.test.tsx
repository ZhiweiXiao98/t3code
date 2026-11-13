import { localizeMobileString } from "../../../i18n/mobileStrings";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
  Pressable: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("expo-glass-effect", () => ({
  GlassView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("uniwind", () => ({ withUniwind: (component: unknown) => component }));
vi.mock("../../../native/native-glass", () => ({ NATIVE_LIQUID_GLASS_SUPPORTED: false }));
vi.mock("../../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, "zh-CN"),
  };
});
vi.mock("../../settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "light" }),
}));
vi.mock("../../../components/ui/Menu", () => ({
  Menu: ({
    children,
    actions,
    onPressAction,
  }: {
    children?: ReactNode;
    actions: { id: string; title: string }[];
    onPressAction: (event: { nativeEvent: { event: string } }) => void;
  }) => (
    <div>
      {children}
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={() => onPressAction({ nativeEvent: { event: action.id } })}
        >
          {action.title}
        </button>
      ))}
    </div>
  ),
}));
import { ListFilterMenu } from "./ListFilterMenu";

it("preserves explicit environment and author labels while retaining menu action identifiers", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    for (const localizeLabel of [undefined, false]) {
      for (const label of ["Author", "Add", "Reply", "Settings/{0}/$&"]) {
        const container = document.createElement("div");
        const root = createRoot(container);
        const select = vi.fn();
        try {
          act(() =>
            root.render(
              <ListFilterMenu
                label={label}
                localizeLabel={localizeLabel}
                accessibilityLabel="Choose environment"
                actions={[{ id: "env:original-id", title: label }]}
                onSelect={select}
              />,
            ),
          );
          expect(container.querySelector("span")?.textContent).toBe(
            localizeLabel === false ? label : localizeMobileString(label),
          );
          act(() => container.querySelector("button")?.click());
          expect(select).toHaveBeenCalledExactlyOnceWith("env:original-id");
        } finally {
          act(() => root.unmount());
        }
      }
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

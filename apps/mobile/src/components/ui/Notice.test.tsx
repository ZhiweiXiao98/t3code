import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
const announce = vi.hoisted(() => vi.fn());
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AccessibilityInfo: { announceForAccessibility: announce },
  View: "div",
  Pressable: "button",
}));
vi.mock("./AppText", () => ({
  AppText: ({ children, localize }: { children?: ReactNode; localize?: boolean }) => (
    <span data-localize={String(localize)}>{children}</span>
  ),
}));
vi.mock("./AppSymbol", () => ({ SymbolView: "i" }));
vi.mock("./GlassSurface", () => ({ GlassSurface: "div" }));
vi.mock("../../i18n/mobileStrings", () => ({
  localizeMobileString: (value: string) => (value === "Settings" ? "设置" : value),
}));
import { Notice } from "./Notice";
import { ErrorBanner } from "./ErrorBanner";

it("preserves literal notice text in visible and accessibility output, including ErrorBanner forwarding", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    for (const Component of [Notice, ErrorBanner]) {
      for (const localizeMessage of [undefined, true, false]) {
        const container = document.createElement("div");
        const root = createRoot(container);
        try {
          act(() =>
            root.render(<Component message="Settings" localizeMessage={localizeMessage} />),
          );
          const expected = localizeMessage === false ? "Settings" : "设置";
          expect(container.textContent).toBe(expected);
          expect(container.querySelector("span")?.getAttribute("data-localize")).toBe("false");
          expect(announce).toHaveBeenLastCalledWith(expected);
        } finally {
          act(() => root.unmount());
        }
      }
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

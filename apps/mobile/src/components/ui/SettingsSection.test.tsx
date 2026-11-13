import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, View: "div" }));
vi.mock("./AppText", () => ({
  AppText: ({ children, localize }: { children?: ReactNode; localize?: boolean }) => (
    <span>{localize !== false && children === "Settings" ? "设置" : children}</span>
  ),
}));
import {
  SettingsSection,
  SettingsSidebarContext,
} from "../../features/settings/components/SettingsSection";
it("keeps environment section titles literal in both normal and sidebar layouts without changing the default", () => {
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

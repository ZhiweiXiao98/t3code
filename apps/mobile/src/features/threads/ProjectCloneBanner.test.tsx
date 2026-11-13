import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ProjectCloneSnapshot } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { expect, it, vi } from "vite-plus/test";
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
}));
vi.mock("../../components/ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("../../components/ui/Button", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    MOBILE_LOCALE: "zh-CN",
    localizeMobileString: (value: string) => actual.localizeMobileString(value, "zh-CN"),
  };
});
import { ProjectCloneBanner } from "./ProjectCloneBanner";

const decodeClone = Schema.decodeUnknownSync(ProjectCloneSnapshot);

it("preserves repository names, Git detail and errors while keeping clone actions unchanged", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    for (const phase of ["running", "cancelled", "failed"] as const) {
      const clone = decodeClone({
        projectId: "project",
        remoteUrl: "https://example.com/repo.git",
        destinationPath: "/workspace/Title",
        repository: null,
        phase,
        stage: "receiving",
        percent: 42,
        detail: "Settings",
        stalled: false,
        error: phase === "running" ? null : "Open",
        startedAt: "2026-11-13T00:00:00.000Z",
        endedAt: null,
        sequence: 1,
      });
      const before = JSON.stringify(clone);
      const cancel = vi.fn();
      const retry = vi.fn();
      const remove = vi.fn();
      const container = document.createElement("div");
      const root = createRoot(container);
      try {
        act(() =>
          root.render(
            <ProjectCloneBanner
              clone={clone}
              onCancel={cancel}
              onRetry={retry}
              onRemove={remove}
            />,
          ),
        );
        expect(container.textContent).toContain(
          phase === "running"
            ? "正在克隆 Title"
            : phase === "cancelled"
              ? "已取消克隆 Title"
              : "无法克隆 Title",
        );
        expect(container.textContent).toContain(
          phase === "running" ? "正在接收对象 · 42% · Settings" : "Open",
        );
        const buttons = container.querySelectorAll("button");
        if (phase === "running") {
          act(() => buttons[0]?.click());
          expect(cancel).toHaveBeenCalledOnce();
        } else {
          act(() => buttons[0]?.click());
          act(() => buttons[1]?.click());
          expect(remove).toHaveBeenCalledOnce();
          expect(retry).toHaveBeenCalledOnce();
        }
        expect(JSON.stringify(clone)).toBe(before);
      } finally {
        act(() => root.unmount());
      }
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { EnvironmentId, ThreadId, TurnItemId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  data: null as { output: { text: string; truncated: boolean }; running: boolean } | null,
  error: null as string | null,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
}));
vi.mock("../../state/entities", () => ({ useServerConfigs: () => new Map() }));
vi.mock("../../state/orchestration", () => ({
  orchestrationEnvironment: { v2: { commandOutput: () => null } },
}));
vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => state }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    MOBILE_LOCALE: "zh-CN",
    localizeMobileString: (value: string) => actual.localizeMobileString(value, "zh-CN"),
  };
});
import { ThreadCommandOutput } from "./thread-command-output";

it("renders plain and ANSI-styled terminal output verbatim and translates only owned status messages", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  try {
    for (const [text, expected] of [
      ["Settings", "Settings"],
      ["\u001b[31mTitle\u001b[0m", "Title"],
    ]) {
      state.data = { output: { text: text!, truncated: false }, running: false };
      state.error = null;
      const container = document.createElement("div");
      const root = createRoot(container);
      try {
        act(() =>
          root.render(
            <ThreadCommandOutput
              environmentId={"env" as EnvironmentId}
              threadId={"thread" as ThreadId}
              itemId={"item" as TurnItemId}
              themeAppearance="light"
            />,
          ),
        );
        expect(container.textContent).toBe(expected);
      } finally {
        act(() => root.unmount());
      }
    }
    state.data = null;
    state.error = "Title/{0}/$&";
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <ThreadCommandOutput
            environmentId={"env" as EnvironmentId}
            threadId={"thread" as ThreadId}
            itemId={"item" as TurnItemId}
            themeAppearance="light"
          />,
        ),
      );
      expect(container.textContent).toBe("无法加载输出：Title/{0}/$&");
    } finally {
      act(() => root.unmount());
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

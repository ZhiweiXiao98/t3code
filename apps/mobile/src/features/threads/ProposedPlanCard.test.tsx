import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  write: vi.fn(),
  alert: vi.fn(),
  literal: vi.fn(),
  prompt: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => true }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: () => null,
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, "zh-CN"),
  };
});
vi.mock("../../state/projects", () => ({
  projectEnvironment: { writeFile: { permissionAtom: () => null } },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.write }));
vi.mock("../../components/ui/Dialog", () => ({
  alert: state.alert,
  alertWithLiteralMessage: state.literal,
  prompt: state.prompt,
}));
vi.mock("./CopyTextButton", () => ({ CopyTextButton: () => null }));
vi.mock("../../components/ui/Button", () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onPress} disabled={disabled}>
      {label}
    </button>
  ),
}));
import type { EnvironmentId } from "@t3tools/contracts";
import { ProposedPlanCard } from "./ProposedPlanCard";

it("keeps a model plan title, saved path and write data literal through the save action", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.write.mockResolvedValue({ _tag: "Success", value: { relativePath: "Title" } });
  const container = document.createElement("div");
  const root = createRoot(container);
  const markdown = "# Title\n\nPlan body";
  try {
    act(() =>
      root.render(
        <ProposedPlanCard
          environmentId={"environment" as EnvironmentId}
          workspaceRoot="/workspace"
          markdown={markdown}
          renderMarkdown={(text) => <pre>{text}</pre>}
        />,
      ),
    );
    expect(container.querySelector("span")?.textContent).toBe("Title");
    act(() => container.querySelector("button")?.click());
    const request = state.prompt.mock.calls.at(-1)?.[0] as { onConfirm: (path: string) => void };
    expect(request).toBeDefined();
    await act(async () => request.onConfirm(" Title "));
    expect(state.write).toHaveBeenCalledWith({
      environmentId: "environment",
      input: { cwd: "/workspace", relativePath: "Title", contents: `${markdown}\n` },
    });
    expect(state.literal).toHaveBeenCalledWith("Plan saved to workspace", "Title");
    expect(state.alert).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

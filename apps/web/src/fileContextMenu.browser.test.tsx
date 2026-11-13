import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../test/render";
import { WebI18nContext } from "./i18n/WebI18nContext";
import { translateWebMessage } from "./i18n/messages";
import { useFileContextMenu } from "./fileContextMenu";

const state = vi.hoisted(() => ({ command: vi.fn(), show: vi.fn(), toast: vi.fn() }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({
    availableEditors: ["file-manager", "vscode"],
    shellRevealInFileManager: true,
    shellRevealInFileManagerKind: "finder",
    environment: { platform: { os: "darwin" } },
  }),
}));
vi.mock("./state/server", () => ({ serverEnvironment: { configValueAtom: () => null } }));
vi.mock("./state/shell", () => ({ shellEnvironment: { openInEditor: {} } }));
vi.mock("./state/use-atom-command", () => ({ useAtomCommand: () => state.command }));
vi.mock("./localApi", () => ({ readLocalApi: () => ({ contextMenu: { show: state.show } }) }));
vi.mock("./components/ui/toast", () => ({ toastManager: { add: state.toast } }));
vi.mock("./i18n/readWebI18n", () => ({
  readWebI18n: () => ({
    locale: "zh-CN",
    t: (
      key: Parameters<typeof translateWebMessage>[1],
      values: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage("zh-CN", key, values),
  }),
}));

it("localizes the actual file menu hook while preserving action IDs, editor names and command paths", async () => {
  state.command.mockResolvedValue(
    AsyncResult.failure(Cause.fail(new Error("opaque provider error"))),
  );
  state.show.mockResolvedValue("editor:vscode");
  const target = {
    environmentId: EnvironmentId.make("env"),
    filePath: "src/{name}/$&.ts",
    workspaceRoot: "/workspace",
  };
  function Menu() {
    const menu = useFileContextMenu(target.environmentId);
    return <button onClick={() => void menu.show(target)}>Show</button>;
  }
  await using screen = await render(
    <WebI18nContext
      value={{
        locale: "zh-CN",
        appLocale: "zh-CN",
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage("zh-CN", key, values),
      }}
    >
      <Menu />
    </WebI18nContext>,
  );
  await screen.getByRole("button", { name: "Show" }).click();
  await vi.waitFor(() => expect(state.command).toHaveBeenCalledOnce());
  const items = state.show.mock.calls[0]?.[0];
  expect(items).toEqual([
    { id: "open", label: "打开", icon: "pencil" },
    { id: "reveal-in-folder", label: "在访达中显示", icon: "folder-tree" },
    { id: "open-with", label: "打开方式", children: [{ id: "editor:vscode", label: "VS Code" }] },
  ]);
  expect(state.command.mock.calls[0]?.[0]).toMatchObject({ environmentId: target.environmentId });
  expect(JSON.stringify(state.command.mock.calls[0]?.[0])).toContain("/workspace/src/{name}/$&.ts");
  await vi.waitFor(() => expect(state.toast).toHaveBeenCalledOnce());
  expect(state.toast.mock.calls[0]?.[0]).toMatchObject({
    title: "无法在 VS Code 中打开",
    description: "/workspace/src/{name}/$&.ts",
  });
});

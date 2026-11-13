import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import type { AlertButton } from "react-native";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  alert: vi.fn(),
  copy: vi.fn(),
  prepare: vi.fn(),
  scratch: vi.fn(),
  wait: vi.fn(),
  draft: vi.fn(),
  text: vi.fn(),
  select: vi.fn(),
  route: { key: "route", params: {} as object },
}));
vi.mock("react-native", () => ({ Alert: { alert: state.alert } }));
vi.mock("expo-clipboard", () => ({ setStringAsync: state.copy }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "1.2.3" } } }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ getState: () => ({ index: 0, routes: [state.route] }) }),
}));
vi.mock("../../lib/authClientMetadata", () => ({
  authClientMetadata: (version: string) => ({ version }),
}));
vi.mock("../../state/projects", () => ({ projectEnvironment: { openScratch: state.scratch } }));
vi.mock("../../state/server", () => ({ serverEnvironment: { prepareTriage: state.prepare } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: (command: unknown) => command }));
vi.mock("../../state/use-composer-drafts", () => ({
  createNewTaskDraft: state.draft,
  setComposerDraftText: state.text,
  waitForComposerDraftsLoaded: state.wait,
}));
vi.mock("../layout/workspace/useSelectWorkspaceDetail", () => ({
  useSelectWorkspaceDetail: () => state.select,
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    MOBILE_LOCALE: "zh-CN",
    localizeMobileString: (value: string, locale: "en" | "zh-CN" = "zh-CN") =>
      actual.localizeMobileString(value, locale),
    localizeAlertArguments: (title: string, message?: string, buttons?: AlertButton[]) =>
      actual.localizeAlertArguments(title, message, buttons, "zh-CN"),
  };
});
import { useStartTriage } from "./useStartTriage";

const environmentId = EnvironmentId.make("environment");
const projectId = ProjectId.make("scratch");
function setup() {
  state.alert.mockReset();
  state.copy.mockReset().mockResolvedValue(undefined);
  state.scratch.mockReset().mockResolvedValue(AsyncResult.success({ id: projectId }));
  state.prepare.mockReset().mockResolvedValue(AsyncResult.success({ prompt: "Settings {0} $&" }));
  state.wait.mockReset().mockResolvedValue(undefined);
  state.draft.mockReset().mockReturnValue("draft-id");
  state.text.mockReset();
  state.select.mockReset();
  state.route = { key: "route", params: {} };
  return useStartTriage();
}

it("keeps triage failures literal while the advice and copy failure are localized", async () => {
  for (const message of ["Settings", "Open", "{0} $&\nCould not copy", ""]) {
    const start = setup();
    state.scratch.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error(message))));
    await start(environmentId);
    expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
      "无法启动问题诊断",
      `${message} 请改为在该机器的终端中运行 npx t3 triage。`,
    ]);
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.draft).not.toHaveBeenCalled();
    const actions = state.alert.mock.lastCall?.[2] as AlertButton[];
    expect(actions[1]).toMatchObject({ style: "cancel" });
    const copiedFailure = Promise.withResolvers<unknown[]>();
    state.alert.mockImplementation((...args: unknown[]) => copiedFailure.resolve(args));
    state.copy.mockRejectedValue(new Error("Clipboard failure"));
    actions[0]!.onPress?.();
    expect((await copiedFailure.promise).slice(0, 2)).toEqual([
      "无法复制",
      "请改为手动输入 npx t3 triage。",
    ]);
    expect(state.copy).toHaveBeenCalledExactlyOnceWith("npx t3 triage");
  }
});

it("selects only owned triage fallbacks and never opens a draft after failed preparation", async () => {
  for (const stage of ["scratch", "prepare", "drafts"] as const) {
    const start = setup();
    if (stage === "drafts") state.wait.mockRejectedValue(null);
    else state[stage].mockResolvedValue(AsyncResult.failure(Cause.fail(null)));
    await start(environmentId);
    const expected = {
      scratch: "此机器无法在没有项目的情况下启动对话。",
      prepare: "服务器无法完成准备。",
      drafts: "无法加载草稿。",
    }[stage];
    expect(state.alert.mock.lastCall?.[1]).toBe(
      `${expected} 请改为在该机器的终端中运行 npx t3 triage。`,
    );
    expect(state.draft).not.toHaveBeenCalled();
    expect(state.select).not.toHaveBeenCalled();
  }
  for (const stage of ["scratch", "prepare"] as const) {
    const start = setup();
    state[stage].mockResolvedValue(AsyncResult.failure(Cause.interrupt(1)));
    await start(environmentId);
    expect(state.alert).not.toHaveBeenCalled();
    expect(state.draft).not.toHaveBeenCalled();
    expect(state.select).not.toHaveBeenCalled();
  }
});

it("retains the prompt and workspace identity and leaves a navigated-away route alone", async () => {
  const start = setup();
  await start(environmentId);
  expect(state.scratch).toHaveBeenCalledExactlyOnceWith({ environmentId, input: {} });
  expect(state.prepare).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { client: { version: "1.2.3" } },
  });
  expect(state.text).toHaveBeenCalledExactlyOnceWith("draft-id", "Settings {0} $&");
  expect(state.select).toHaveBeenCalledExactlyOnceWith({
    name: "Thread",
    params: { draft: { environmentId, projectId, title: "Triage", draftId: "draft-id" } },
  });

  const startLater = setup();
  const prepared =
    Promise.withResolvers<ReturnType<typeof AsyncResult.success<{ prompt: string }>>>();
  const preparing = Promise.withResolvers<void>();
  state.prepare.mockImplementation(() => {
    preparing.resolve();
    return prepared.promise;
  });
  const pending = startLater(environmentId);
  await preparing.promise;
  state.route = { key: "route", params: { environmentId: "other" } };
  prepared.resolve(AsyncResult.success({ prompt: "unchanged" }));
  await pending;
  expect(state.draft).not.toHaveBeenCalled();
  expect(state.select).not.toHaveBeenCalled();
});

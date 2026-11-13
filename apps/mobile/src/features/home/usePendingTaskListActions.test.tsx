import {
  CommandId,
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";
import type { PendingDraftTask, PendingQueuedTask } from "../../state/use-pending-new-tasks";

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  held: false,
  alert: vi.fn<typeof import("react-native").Alert.alert>(),
  remove: vi.fn<typeof import("../../state/thread-outbox-removal").removeThreadOutboxMessage>(),
  clear: vi.fn(),
  hold: vi.fn(),
  release: vi.fn(),
  dismiss: vi.fn<() => { finished: Promise<void>; restore: () => void }>(),
  restore: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("react-native", () => ({ Alert: { alert: state.alert, prompt: vi.fn() } }));
vi.mock("../../state/thread-outbox-removal", () => ({ removeThreadOutboxMessage: state.remove }));
vi.mock("../../state/use-composer-drafts", () => ({ clearComposerDraftContent: state.clear }));
vi.mock("../../state/atom-registry", () => ({
  appAtomRegistry: { get: () => (state.held ? { "message-Settings": true } : {}) },
}));
vi.mock("../../state/use-thread-outbox", () => ({
  editingQueuedMessageIdsAtom: "editing",
  holdEditingQueuedMessage: state.hold,
  releaseEditingQueuedMessage: state.release,
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, state.locale),
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], state.locale),
  };
});

import { registerThreadDismissal } from "./thread-dismissal";
import { usePendingTaskListActions } from "./usePendingTaskListActions";

const environmentId = EnvironmentId.make("Settings");
const projectId = ProjectId.make("project");
const title = "Settings\n{0} $&";
const createdAt = "2026-11-13T00:00:00.000Z";
const draft: PendingDraftTask = {
  kind: "draft",
  key: "draft-key",
  environmentId,
  projectId,
  projectTitle: undefined,
  projectCwd: undefined,
  title,
  createdAt,
  draftKey: "draft-Settings",
  draft: { text: title, attachments: [], project: { environmentId, projectId, createdAt } },
};
const creation = { projectId, workspaceMode: "local" as const, branch: null, worktreePath: null };
const pending: PendingQueuedTask = {
  kind: "pending",
  key: "pending-key",
  environmentId,
  projectId,
  projectTitle: undefined,
  projectCwd: undefined,
  branch: null,
  title,
  createdAt,
  creation,
  message: {
    environmentId,
    threadId: ThreadId.make("thread-Settings"),
    messageId: MessageId.make("message-Settings"),
    commandId: CommandId.make("command"),
    text: title,
    attachments: [],
    creation,
    createdAt,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "Settings" },
  },
};

function setup(locale: MobileLocale) {
  state.locale = locale;
  state.held = false;
  for (const mock of [
    state.alert,
    state.remove,
    state.clear,
    state.hold,
    state.release,
    state.dismiss,
    state.restore,
    state.navigate,
  ])
    mock.mockReset();
  state.remove.mockResolvedValue(true);
  state.dismiss.mockImplementation(() => ({ finished: Promise.resolve(), restore: state.restore }));
}

async function render(task: PendingDraftTask | PendingQueuedTask) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement("div");
  const root = createRoot(element);
  function Actions() {
    const actions = usePendingTaskListActions(state.navigate);
    return (
      <>
        <button onClick={() => actions.confirmDeletePendingTask(task)}>remove</button>
        <button onClick={() => actions.openPendingTask(task)}>open</button>
      </>
    );
  }
  await using stack = new AsyncDisposableStack();
  stack.defer(registerThreadDismissal(task.key, state.dismiss));
  stack.defer(() => act(async () => root.unmount()));
  await act(async () => root.render(<Actions />));
  const resources = stack.move();
  return {
    click: (index: number) => act(async () => element.querySelectorAll("button")[index]!.click()),
    [Symbol.asyncDispose]: () => resources.disposeAsync(),
  };
}

async function pressDialog(index: number) {
  const action = state.alert.mock.lastCall?.[2]?.[index];
  expect(action).toBeDefined();
  await act(async () => action?.onPress?.());
}

it.each(["en", "zh-CN"] as const)(
  "keeps draft identity and navigation literal in %s and only clears after confirmation",
  async (locale) => {
    setup(locale);
    await using screen = await render(draft);
    await screen.click(1);
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith({
      draft: { environmentId, projectId, draftId: draft.draftKey },
    });
    await screen.click(0);
    expect(state.alert.mock.lastCall?.slice(0, 2)).toEqual([
      locale === "en" ? "Discard draft?" : "丢弃草稿？",
      locale === "en" ? `“${title}” will be removed.` : `将移除“${title}”。`,
    ]);
    await pressDialog(0);
    expect(state.clear).not.toHaveBeenCalled();
    expect(state.dismiss).not.toHaveBeenCalled();
    const animation = Promise.withResolvers<void>();
    state.dismiss.mockReturnValueOnce({ finished: animation.promise, restore: state.restore });
    await screen.click(0);
    await pressDialog(1);
    expect(state.clear).not.toHaveBeenCalled();
    await act(async () => animation.resolve());
    expect(state.clear).toHaveBeenCalledExactlyOnceWith(draft.draftKey, {
      clearModelSelection: true,
      clearWorkspaceSelection: true,
    });
    expect(state.dismiss).toHaveBeenCalledOnce();
    expect(state.restore).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.hold).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh-CN"] as const)(
  "preserves pending delivery holds, cancellation and removal outcomes in %s",
  async (locale) => {
    for (const held of [false, true]) {
      for (const outcome of [
        true,
        false,
        new Error("Settings"),
        new Error("Open\n{0} $&"),
        "failure",
      ]) {
        setup(locale);
        state.held = held;
        const completion = Promise.withResolvers<boolean>();
        state.remove.mockReturnValue(completion.promise);
        await using screen = await render(pending);
        await screen.click(1);
        expect(state.navigate).toHaveBeenCalledWith({
          environmentId,
          threadId: pending.message.threadId,
        });
        await screen.click(0);
        expect(state.alert.mock.lastCall?.[1]).toBe(
          locale === "en"
            ? `“${title}” has not been sent yet and will be removed from the outbox.`
            : `“${title}”尚未发送，将从发件箱中移除。`,
        );
        await pressDialog(0);
        expect(state.hold).not.toHaveBeenCalled();
        expect(state.remove).not.toHaveBeenCalled();
        await screen.click(0);
        await pressDialog(1);
        expect(state.hold).toHaveBeenCalledExactlyOnceWith(pending.message.messageId);
        expect(state.remove).toHaveBeenCalledExactlyOnceWith(pending.message);
        expect(state.release).not.toHaveBeenCalled();
        await act(async () => {
          if (typeof outcome === "boolean") completion.resolve(outcome);
          else completion.reject(outcome);
        });
        expect(state.release).toHaveBeenCalledTimes(outcome === true || !held ? 1 : 0);
        if (outcome === true || !held)
          expect(state.release).toHaveBeenCalledWith(pending.message.messageId);
        expect(state.dismiss).toHaveBeenCalledTimes(held ? 0 : 1);
        expect(state.restore).toHaveBeenCalledTimes(!held && outcome !== true ? 1 : 0);
        if (typeof outcome !== "boolean")
          expect(state.alert.mock.lastCall?.[1]).toBe(
            outcome instanceof Error
              ? outcome.message
              : locale === "en"
                ? "The pending task could not be removed."
                : "无法移除待处理任务。",
          );
        else expect(state.alert).toHaveBeenCalledTimes(2);
      }
    }
  },
);

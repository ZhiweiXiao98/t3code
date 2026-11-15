import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { readableFailure } from "./pullRequestDetail.logic";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  EnvironmentId,
  GitCommandError,
  ThreadId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestRef,
  type GitPreparePullRequestThreadResult,
} from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { type EnvironmentPullRequestEntry } from "./pullRequestList.logic";
import {
  usePullRequestActionRunner,
  usePullRequestCloseBatch,
  usePullRequestHandoffs,
} from "./usePullRequestActions";

const state = vi.hoisted(() => ({
  runAction: vi.fn(),
  toast: vi.fn(),
  updateToast: vi.fn(),
  newThread: vi.fn(),
  prepare: vi.fn(),
  success: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: state.toast, update: state.updateToast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = state.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
vi.mock(import("~/state/use-atom-command"), () => ({
  useAtomCommand: (() => state.runAction) as never,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function MergeButton({ reference }: { reference: PullRequestRef }) {
  const { actionPending, perform } = usePullRequestActionRunner({
    environmentId: EnvironmentId.make("environment"),
    reference,
    terminology: sourceControlClients.get(undefined).changeRequest,
  });
  return (
    <button type="button" disabled={actionPending} onClick={() => void perform("merge")}>
      {actionPending ? "Merging..." : "Merge"}
    </button>
  );
}

it("keeps pending merges with their pull request when navigating between threads", async () => {
  const first: PullRequestRef = {
    projectId: ProjectId.make("project"),
    repository: "owner/repo",
    number: 1,
  };
  const second = { ...first, number: 2 };
  const firstResult = deferred<{ _tag: "Success"; value: void }>();
  const secondResult = deferred<{ _tag: "Success"; value: void }>();
  state.runAction
    .mockReset()
    .mockReturnValueOnce(firstResult.promise)
    .mockReturnValueOnce(secondResult.promise);
  await using screen = await render(<MergeButton reference={first} />);
  const button = screen.getByRole("button");

  await userEvent.click(button);
  await expect.element(button).toHaveTextContent("Merging...");
  await screen.rerender(<MergeButton reference={second} />);
  await expect.element(button).toHaveTextContent("Merge");
  await expect.element(button).toBeEnabled();
  await userEvent.click(button);
  expect(state.runAction).toHaveBeenCalledTimes(2);

  await screen.rerender(<MergeButton reference={first} />);
  await expect.element(button).toHaveTextContent("Merging...");
  await expect.element(button).toBeDisabled();
  await act(async () => {
    firstResult.resolve({ _tag: "Success", value: undefined });
    await firstResult.promise;
  });
  await expect.element(button).toHaveTextContent("Merge");
  await screen.rerender(<MergeButton reference={second} />);
  await expect.element(button).toHaveTextContent("Merging...");
  await act(async () => {
    secondResult.resolve({ _tag: "Success", value: undefined });
    await secondResult.promise;
  });
  await expect.element(button).toHaveTextContent("Merge");
});

const readyReference: PullRequestRef = {
  projectId: ProjectId.make("ready-project"),
  repository: "literal-owner/repo",
  number: 42,
};
function ReadyProbe({ reference }: { reference: PullRequestRef | null }) {
  const { actionPending, perform } = usePullRequestActionRunner({
    environmentId: EnvironmentId.make("environment"),
    reference,
    terminology: sourceControlClients.get(undefined).changeRequest,
    onSuccess: state.success,
  });
  return (
    <>
      <button type="button" disabled={actionPending} onClick={() => void perform("ready")}>
        {actionPending ? "Pending ready" : "Mark ready"}
      </button>
      <button type="button" onClick={() => void perform("ready")}>
        Repeat ready
      </button>
    </>
  );
}
function readySurface(locale: "en" | "zh-CN", reference: PullRequestRef | null = readyReference) {
  state.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ReadyProbe reference={reference} />
    </WebI18nContext>
  );
}
it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {host failure}")],
  ["empty", new Error("")],
  ["whitespace", new Error("   ")],
  ["interrupted", undefined],
] as const)("uses settlement locale for action runner failure: %s", async (kind, cause) => {
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  const pending = deferred<Result>();
  state.runAction.mockReset().mockReturnValueOnce(pending.promise);
  state.toast.mockClear();
  state.success.mockClear();
  using _restore = {
    [Symbol.dispose]() {
      state.locale = "en";
      state.runAction.mockReset();
    },
  };
  await using screen = await render(readySurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        pending.resolve(AsyncResult.failure(Cause.interrupt()));
        await pending.promise;
      });
    },
  };
  await screen.getByRole("button", { name: "Mark ready", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Pending ready", exact: true }))
    .toBeDisabled();
  await screen.getByRole("button", { name: "Repeat ready", exact: true }).click();
  expect(state.runAction).toHaveBeenCalledExactlyOnceWith({
    environmentId: EnvironmentId.make("environment"),
    input: { ...readyReference, action: "ready" },
  });
  await screen.rerender(readySurface("zh-CN"));
  expect(state.toast).not.toHaveBeenCalled();
  const result: Result = AsyncResult.failure(
    kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause),
  );
  await act(async () => {
    pending.resolve(result);
    await pending.promise;
  });
  expect(state.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法标记为可供评审",
    description:
      kind === "raw"
        ? "Literal $& {host failure}"
        : kind === "interrupted"
          ? readableFailure(
              squashAtomCommandFailure(result),
              "托管服务拒绝了操作。请确认你拥有此仓库的写入权限。",
            )
          : "托管服务拒绝了操作。请确认你拥有此仓库的写入权限。",
  });
  await expect
    .element(screen.getByRole("button", { name: "Mark ready", exact: true }))
    .toBeEnabled();
  expect(state.success).not.toHaveBeenCalled();
  await screen.rerender(readySurface("en"));
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(state.runAction).toHaveBeenCalledTimes(1);
});
it("does not run a ready action without a reference", async () => {
  state.runAction.mockReset();
  state.toast.mockClear();
  state.success.mockClear();
  await using screen = await render(readySurface("en", null));
  await screen.getByRole("button", { name: "Mark ready", exact: true }).click();
  await screen.getByRole("button", { name: "Repeat ready", exact: true }).click();
  expect(state.runAction).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
  expect(state.success).not.toHaveBeenCalled();
});

it("uses settlement locale for action runner ready success", async () => {
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result =
    | ReturnType<typeof AsyncResult.success<undefined>>
    | ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  const pending = deferred<Result>();
  state.runAction.mockReset().mockReturnValueOnce(pending.promise);
  state.toast.mockClear();
  state.success.mockClear();
  using _restore = {
    [Symbol.dispose]() {
      state.locale = "en";
      state.runAction.mockReset();
    },
  };
  await using screen = await render(readySurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        pending.resolve(AsyncResult.failure(Cause.interrupt()));
        await pending.promise;
      });
    },
  };
  await screen.getByRole("button", { name: "Mark ready", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Pending ready", exact: true }))
    .toBeDisabled();
  await screen.getByRole("button", { name: "Repeat ready", exact: true }).click();
  expect(state.runAction).toHaveBeenCalledExactlyOnceWith({
    environmentId: EnvironmentId.make("environment"),
    input: { ...readyReference, action: "ready" },
  });
  expect(state.toast).not.toHaveBeenCalled();
  expect(state.success).not.toHaveBeenCalled();
  await screen.rerender(readySurface("zh-CN"));
  await act(async () => {
    pending.resolve(AsyncResult.success(undefined));
    await pending.promise;
  });
  expect(state.toast).toHaveBeenCalledExactlyOnceWith({
    type: "success",
    title: "已标记为可供评审",
  });
  expect(state.success).toHaveBeenCalledExactlyOnceWith("ready", undefined);
  expect(state.toast.mock.invocationCallOrder[0]).toBeLessThan(
    state.success.mock.invocationCallOrder[0]!,
  );
  await expect
    .element(screen.getByRole("button", { name: "Mark ready", exact: true }))
    .toBeEnabled();
  await screen.rerender(readySurface("en"));
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(state.success).toHaveBeenCalledTimes(1);
  expect(state.runAction).toHaveBeenCalledTimes(1);
});

const closeFirst: EnvironmentPullRequestEntry = {
  environmentId: EnvironmentId.make("close-environment"),
  provider: SourceControlProviderKind.make("github"),
  host: "github.com",
  projectId: ProjectId.make("close-project"),
  projectTitle: "Literal project",
  repository: "owner/repo",
  number: 41,
  title: "Literal $& {first}",
  url: "https://github.com/owner/repo/pull/41",
  author: { login: "author", name: null, avatarUrl: null },
  headBranch: "feature",
  baseBranch: "main",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 0,
  deletions: 0,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  viewerReviewRequested: false,
  labels: [],
};
const closeSecond: EnvironmentPullRequestEntry = {
  ...closeFirst,
  number: 42,
  title: "Literal $& {second}",
  url: "https://github.com/owner/repo/pull/42",
};
const closeEntries = [closeFirst, closeSecond] as const;
function CloseProbe({ entries }: { entries: readonly EnvironmentPullRequestEntry[] }) {
  const { close, closingKeys } = usePullRequestCloseBatch(state.success);
  return (
    <>
      <button type="button" onClick={() => void close(entries)}>
        Close batch
      </button>
      <output aria-label="Pending closes">{closingKeys.size}</output>
    </>
  );
}
function closeSurface(
  locale: "en" | "zh-CN",
  entries: readonly EnvironmentPullRequestEntry[] = closeEntries,
) {
  state.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <CloseProbe entries={entries} />
    </WebI18nContext>
  );
}
it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {first failure}")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)("uses settlement locale for close batch failure: %s", async (kind, cause) => {
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  const first = deferred<Result>();
  const second = deferred<Result>();
  state.runAction
    .mockReset()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  state.toast.mockClear();
  state.success.mockClear();
  using _restore = {
    [Symbol.dispose]() {
      state.locale = "en";
      state.runAction.mockReset();
    },
  };
  await using screen = await render(closeSurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        first.resolve(AsyncResult.failure(Cause.interrupt()));
        second.resolve(AsyncResult.failure(Cause.interrupt()));
        await Promise.all([first.promise, second.promise]);
      });
    },
  };
  const button = screen.getByRole("button", { name: "Close batch", exact: true });
  await button.click();
  await expect
    .element(screen.getByRole("status", { name: "Pending closes" }))
    .toHaveTextContent("2");
  await button.click();
  expect(state.runAction).toHaveBeenCalledTimes(2);
  for (const [index, entry] of closeEntries.entries()) {
    expect(state.runAction).toHaveBeenNthCalledWith(index + 1, {
      environmentId: entry.environmentId,
      input: {
        projectId: entry.projectId,
        host: entry.host,
        repository: entry.repository,
        number: entry.number,
        action: "close",
      },
    });
  }
  await screen.rerender(closeSurface("zh-CN"));
  const firstResult: Result = AsyncResult.failure(
    kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause),
  );
  const secondResult: Result = AsyncResult.failure(
    kind === "interrupted"
      ? Cause.interrupt()
      : Cause.fail(new Error("Literal $& {second failure}")),
  );
  await act(async () => {
    second.resolve(secondResult);
    await second.promise;
  });
  await expect
    .element(screen.getByRole("status", { name: "Pending closes" }))
    .toHaveTextContent("1");
  expect(state.toast).not.toHaveBeenCalled();
  expect(state.success).not.toHaveBeenCalled();
  await act(async () => {
    first.resolve(firstResult);
    await first.promise;
  });
  const hint = "托管服务拒绝了操作。请确认你拥有写入权限，或此请求由你创建。";
  const firstText =
    kind === "raw"
      ? "Literal $& {first failure}"
      : kind === "interrupted"
        ? readableFailure(squashAtomCommandFailure(firstResult), hint)
        : hint;
  const secondText =
    kind === "interrupted"
      ? readableFailure(squashAtomCommandFailure(secondResult), hint)
      : "Literal $& {second failure}";
  expect(state.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "已关闭 2 个拉取请求中的 0 个",
    description: "#42: " + secondText + "\n#41: " + firstText,
  });
  await expect
    .element(screen.getByRole("status", { name: "Pending closes" }))
    .toHaveTextContent("0");
  expect(state.success).not.toHaveBeenCalled();
  await screen.rerender(closeSurface("en"));
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(state.runAction).toHaveBeenCalledTimes(2);
});
it("ignores closed entries in the close batch", async () => {
  state.runAction.mockReset();
  state.toast.mockClear();
  state.success.mockClear();
  await using screen = await render(closeSurface("en", [{ ...closeFirst, state: "closed" }]));
  await screen.getByRole("button", { name: "Close batch", exact: true }).click();
  await expect
    .element(screen.getByRole("status", { name: "Pending closes" }))
    .toHaveTextContent("0");
  expect(state.runAction).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
  expect(state.success).not.toHaveBeenCalled();
});

it.each(["one", "two", "mixed"] as const)(
  "uses settlement locale for close batch success: %s",
  async (kind) => {
    const { AsyncResult } = await import("effect/reactivity");
    const Cause = await import("effect/Cause");
    type Result =
      | ReturnType<typeof AsyncResult.success<undefined>>
      | ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
    const first = deferred<Result>();
    const second = deferred<Result>();
    const entries = kind === "one" ? [closeFirst] : closeEntries;
    state.runAction
      .mockReset()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    state.toast.mockClear();
    state.success.mockClear();
    using _restore = {
      [Symbol.dispose]() {
        state.locale = "en";
        state.runAction.mockReset();
      },
    };
    await using screen = await render(closeSurface("en", entries));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          first.resolve(AsyncResult.failure(Cause.interrupt()));
          second.resolve(AsyncResult.failure(Cause.interrupt()));
          await Promise.all([first.promise, second.promise]);
        });
      },
    };
    const button = screen.getByRole("button", { name: "Close batch", exact: true });
    await button.click();
    await expect
      .element(screen.getByRole("status", { name: "Pending closes" }))
      .toHaveTextContent(String(entries.length));
    await button.click();
    expect(state.runAction).toHaveBeenCalledTimes(entries.length);
    for (const [index, entry] of entries.entries()) {
      expect(state.runAction).toHaveBeenNthCalledWith(index + 1, {
        environmentId: entry.environmentId,
        input: {
          projectId: entry.projectId,
          host: entry.host,
          repository: entry.repository,
          number: entry.number,
          action: "close",
        },
      });
    }
    await screen.rerender(closeSurface("zh-CN", entries));
    if (kind !== "one") {
      await act(async () => {
        second.resolve(AsyncResult.success(undefined));
        await second.promise;
      });
      await expect
        .element(screen.getByRole("status", { name: "Pending closes" }))
        .toHaveTextContent("1");
      expect(state.success).toHaveBeenCalledExactlyOnceWith(closeSecond, undefined);
      expect(state.toast).not.toHaveBeenCalled();
    }
    await act(async () => {
      first.resolve(
        kind === "mixed"
          ? AsyncResult.failure(Cause.fail(new Error("Literal $& {mixed failure}")))
          : AsyncResult.success(undefined),
      );
      await first.promise;
    });
    expect(state.success.mock.calls).toEqual(
      kind === "one"
        ? [[closeFirst, undefined]]
        : kind === "two"
          ? [
              [closeSecond, undefined],
              [closeFirst, undefined],
            ]
          : [[closeSecond, undefined]],
    );
    expect(state.toast).toHaveBeenCalledExactlyOnceWith(
      kind === "mixed"
        ? {
            type: "error",
            title: "已关闭 2 个拉取请求中的 1 个",
            description: "#41: Literal $& {mixed failure}",
          }
        : {
            type: "success",
            title: kind === "one" ? "已关闭 1 个拉取请求" : "已关闭 2 个拉取请求",
          },
    );
    expect(state.success.mock.invocationCallOrder.at(-1)).toBeLessThan(
      state.toast.mock.invocationCallOrder[0]!,
    );
    await expect
      .element(screen.getByRole("status", { name: "Pending closes" }))
      .toHaveTextContent("0");
    await screen.rerender(closeSurface("en", entries));
    expect(state.toast).toHaveBeenCalledTimes(1);
    expect(state.success).toHaveBeenCalledTimes(kind === "two" ? 2 : 1);
    expect(state.runAction).toHaveBeenCalledTimes(entries.length);
  },
);

vi.mock(import("~/hooks/useHandleNewThread"), async (original) => ({
  ...(await original()),
  useNewThreadHandler: () => state.newThread,
}));
vi.mock(import("~/state/sourceControlActions"), async (original) => ({
  ...(await original()),
  usePreparePullRequestThreadAction: () => ({
    isAllowed: true,
    isPending: false,
    resetError: () => {},
    run: state.prepare,
    error: null,
  }),
}));
const handoffDetail = {
  projectId: ProjectId.make("handoff-project"),
  workspaceRoot: "/literal/$&/{workspace}",
  url: "https://github.com/owner/repo/pull/42",
};
const handoffTask = { prompt: "Literal $& {task}" };
function HandoffProbe() {
  const { handoff, startHandoff } = usePullRequestHandoffs({
    environmentId: EnvironmentId.make("handoff-environment"),
    detail: handoffDetail,
  });
  return (
    <>
      <button type="button" onClick={() => void startHandoff("conflicts", handoffTask)}>
        Start handoff
      </button>
      <output aria-label="Handoff state">{handoff ?? "idle"}</output>
    </>
  );
}
function handoffSurface(locale: "en" | "zh-CN") {
  state.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <HandoffProbe />
    </WebI18nContext>
  );
}
it.each([
  ["null", false, null],
  ["raw rejection", true, new Error("Literal $& {thread failure}")],
  ["empty rejection", true, new Error("")],
  ["unknown rejection", true, undefined],
] as const)(
  "uses settlement locale for checkout thread opening failure: %s",
  async (_kind, reject, cause) => {
    const before = useComposerDraftStore.getState();
    using _restore = {
      [Symbol.dispose]() {
        useComposerDraftStore.setState(before, true);
        state.locale = "en";
        state.newThread.mockReset();
        state.toast.mockReset();
      },
    };
    let finish = () => {};
    let fail = (_cause: unknown) => {};
    const pending = new Promise<null>((resolve, reject) => {
      finish = () => resolve(null);
      fail = reject;
    });
    void pending.catch(() => {});
    state.newThread.mockReset().mockReturnValueOnce(pending);
    state.prepare.mockClear();
    state.runAction.mockClear();
    state.toast.mockReset().mockReturnValue("handoff-toast");
    state.updateToast.mockClear();
    await using screen = await render(handoffSurface("en"));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish();
          await pending.catch(() => {});
        });
      },
    };
    const button = screen.getByRole("button", { name: "Start handoff", exact: true });
    await button.click();
    await expect
      .element(screen.getByRole("status", { name: "Handoff state" }))
      .toHaveTextContent("conflicts");
    await button.click();
    expect(state.newThread).toHaveBeenCalledExactlyOnceWith({
      environmentId: EnvironmentId.make("handoff-environment"),
      projectId: handoffDetail.projectId,
    });
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "loading",
      title: "Preparing the pull request checkout...",
    });
    expect(state.updateToast).not.toHaveBeenCalled();
    await screen.rerender(handoffSurface("zh-CN"));
    await act(async () => {
      if (reject) fail(cause);
      else finish();
      await pending.catch(() => {});
    });
    expect(state.updateToast).toHaveBeenCalledExactlyOnceWith("handoff-toast", {
      type: "error",
      title: "无法为检出目录打开任务",
      description: "请从项目中重试，或先打开一个任务。",
    });
    await expect
      .element(screen.getByRole("status", { name: "Handoff state" }))
      .toHaveTextContent("idle");
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.runAction).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState()).toBe(before);
    await screen.rerender(handoffSurface("en"));
    expect(state.newThread).toHaveBeenCalledTimes(1);
    expect(state.toast).toHaveBeenCalledTimes(1);
    expect(state.updateToast).toHaveBeenCalledTimes(1);
  },
);

const checkoutHint =
  "Check that the branch still exists and is not checked out elsewhere, then try again.";
it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {checkout failure}")],
  ["empty", new Error("")],
  ["interrupted", undefined],
  [
    "typed diagnostic",
    new GitCommandError({
      cwd: "/literal/workspace",
      operation: "GitVcsDriver.createWorktree",
      command: "git worktree add",
      detail: checkoutHint,
      reason: "path_already_exists",
    }),
  ],
] as const)("uses settlement locale for checkout preparation failure: %s", async (kind, cause) => {
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  const before = useComposerDraftStore.getState();
  using _restore = {
    [Symbol.dispose]() {
      useComposerDraftStore.setState(before, true);
      state.locale = "en";
      state.newThread.mockReset();
      state.prepare.mockReset();
      state.toast.mockReset();
    },
  };
  const opened = {
    draftId: DraftId.make("fixture-handoff-draft"),
    threadId: ThreadId.make("fixture-handoff-thread"),
  };
  const pending = deferred<Result>();
  state.newThread.mockReset().mockResolvedValueOnce(opened);
  state.prepare.mockReset().mockReturnValueOnce(pending.promise);
  state.runAction.mockClear();
  state.toast.mockReset().mockReturnValue("prepare-toast");
  state.updateToast.mockClear();
  await using screen = await render(handoffSurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        pending.resolve(AsyncResult.failure(Cause.interrupt()));
        await pending.promise;
      });
    },
  };
  const button = screen.getByRole("button", { name: "Start handoff", exact: true });
  await button.click();
  await expect.poll(() => state.prepare.mock.calls.length).toBe(1);
  expect(state.newThread).toHaveBeenCalledExactlyOnceWith({
    environmentId: EnvironmentId.make("handoff-environment"),
    projectId: handoffDetail.projectId,
  });
  expect(state.prepare).toHaveBeenCalledExactlyOnceWith({
    reference: handoffDetail.url,
    mode: "worktree",
    threadId: opened.threadId,
  });
  await expect
    .element(screen.getByRole("status", { name: "Handoff state" }))
    .toHaveTextContent("conflicts");
  await button.click();
  expect(state.newThread).toHaveBeenCalledTimes(1);
  expect(state.prepare).toHaveBeenCalledTimes(1);
  expect(state.toast).toHaveBeenCalledExactlyOnceWith({
    type: "loading",
    title: "Preparing the pull request checkout...",
  });
  expect(state.updateToast).not.toHaveBeenCalled();
  await screen.rerender(handoffSurface("zh-CN"));
  await act(async () => {
    pending.resolve(
      AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause)),
    );
    await pending.promise;
  });
  expect(state.updateToast).toHaveBeenCalledExactlyOnceWith("prepare-toast", {
    type: "error",
    title: "无法准备检出拉取请求",
    description:
      kind === "raw"
        ? "Literal $& {checkout failure}"
        : kind === "typed diagnostic"
          ? checkoutHint + " (path_already_exists)"
          : "请确认该分支仍然存在且未在其他位置检出，然后重试。",
  });
  await expect
    .element(screen.getByRole("status", { name: "Handoff state" }))
    .toHaveTextContent("idle");
  expect(state.newThread).toHaveBeenCalledTimes(1);
  expect(state.prepare).toHaveBeenCalledTimes(1);
  expect(state.runAction).not.toHaveBeenCalled();
  expect(useComposerDraftStore.getState()).toBe(before);
  await screen.rerender(handoffSurface("en"));
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(state.updateToast).toHaveBeenCalledTimes(1);
});

it.each([
  ["worktree null", "/literal/$&/{worktree}", false, null],
  ["local null", null, false, null],
  ["raw rejection", "/literal/$&/{worktree}", true, new Error("Literal $& {retarget failure}")],
  ["empty rejection", null, true, new Error("")],
  ["unknown rejection", "/literal/$&/{worktree}", true, undefined],
] as const)(
  "uses settlement locale for checkout retarget failure: %s",
  async (_kind, worktreePath, reject, cause) => {
    const { AsyncResult } = await import("effect/reactivity");
    const before = useComposerDraftStore.getState();
    using _restore = {
      [Symbol.dispose]() {
        useComposerDraftStore.setState(before, true);
        state.locale = "en";
        state.newThread.mockReset();
        state.prepare.mockReset();
        state.toast.mockReset();
      },
    };
    const opened = {
      draftId: DraftId.make("fixture-pointed-draft"),
      threadId: ThreadId.make("fixture-pointed-thread"),
    };
    const prepared: GitPreparePullRequestThreadResult = {
      pullRequest: {
        number: 42,
        title: "Literal PR",
        url: handoffDetail.url,
        baseBranch: "main",
        headBranch: "feature",
        state: "open",
      },
      branch: "feature/$&/{literal}",
      worktreePath,
      isOnPullRequestHead: true,
    };
    let finish = () => {};
    let fail = (_cause: unknown) => {};
    const pending = new Promise<null>((resolve, reject) => {
      finish = () => resolve(null);
      fail = reject;
    });
    void pending.catch(() => {});
    state.newThread.mockReset().mockResolvedValueOnce(opened).mockReturnValueOnce(pending);
    state.prepare.mockReset().mockResolvedValueOnce(AsyncResult.success(prepared));
    state.runAction.mockClear();
    state.toast.mockReset().mockReturnValue("pointed-toast");
    state.updateToast.mockClear();
    await using screen = await render(handoffSurface("en"));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish();
          await pending.catch(() => {});
        });
      },
    };
    const button = screen.getByRole("button", { name: "Start handoff", exact: true });
    await button.click();
    await expect.poll(() => state.newThread.mock.calls.length).toBe(2);
    const projectRef = {
      environmentId: EnvironmentId.make("handoff-environment"),
      projectId: handoffDetail.projectId,
    };
    expect(state.newThread).toHaveBeenNthCalledWith(1, projectRef);
    expect(state.newThread).toHaveBeenNthCalledWith(2, projectRef, {
      branch: prepared.branch,
      worktreePath,
      envMode: worktreePath === null ? "local" : "worktree",
    });
    expect(state.prepare).toHaveBeenCalledExactlyOnceWith({
      reference: handoffDetail.url,
      mode: "worktree",
      threadId: opened.threadId,
    });
    await expect
      .element(screen.getByRole("status", { name: "Handoff state" }))
      .toHaveTextContent("conflicts");
    await button.click();
    expect(state.newThread).toHaveBeenCalledTimes(2);
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "loading",
      title: "Preparing the pull request checkout...",
    });
    expect(state.updateToast).not.toHaveBeenCalled();
    await screen.rerender(handoffSurface("zh-CN"));
    await act(async () => {
      if (reject) fail(cause);
      else finish();
      await pending.catch(() => {});
    });
    expect(state.updateToast).toHaveBeenCalledExactlyOnceWith("pointed-toast", {
      type: "error",
      title: "检出完成，但任务未切换过去",
      description:
        "已在 `feature/$&/{literal}` 准备好检出目录。请从分支选择器将任务指向该目录，然后重试。",
    });
    await expect
      .element(screen.getByRole("status", { name: "Handoff state" }))
      .toHaveTextContent("idle");
    expect(state.newThread).toHaveBeenCalledTimes(2);
    expect(state.prepare).toHaveBeenCalledTimes(1);
    expect(state.runAction).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState()).toBe(before);
    await screen.rerender(handoffSurface("en"));
    expect(state.toast).toHaveBeenCalledTimes(1);
    expect(state.updateToast).toHaveBeenCalledTimes(1);
  },
);

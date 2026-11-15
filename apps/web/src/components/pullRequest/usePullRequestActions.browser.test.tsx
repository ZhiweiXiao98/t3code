import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { readableFailure } from "./pullRequestDetail.logic";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestRef,
} from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { type EnvironmentPullRequestEntry } from "./pullRequestList.logic";
import { usePullRequestActionRunner, usePullRequestCloseBatch } from "./usePullRequestActions";

const state = vi.hoisted(() => ({
  runAction: vi.fn(),
  toast: vi.fn(),
  success: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: state.toast },
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

import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { readableFailure } from "./pullRequestDetail.logic";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId, ProjectId, type PullRequestRef } from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { usePullRequestActionRunner } from "./usePullRequestActions";

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

import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ThreadLinkedPullRequest,
  type VcsStatusResult,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { act, render } from "../../../test/render";
import { useThreadLinkedPullRequest } from "./useThreadLinkedPullRequest";

const state = vi.hoisted(() => ({
  update: vi.fn(),
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
  closed: true,
}));
vi.mock("../ThreadStatusIndicators", async (original) => ({
  ...(await original<typeof import("../ThreadStatusIndicators")>()),
  useLinkedThreadPullRequest: () => ({ pr: { state: state.closed ? "closed" : "open" } }),
}));
vi.mock("~/state/session", async (original) => ({
  ...(await original<typeof import("~/state/session")>()),
  readEnvironmentScope: () => true,
}));
vi.mock("~/state/use-atom-command", async (original) => {
  const actual = await original<typeof import("~/state/use-atom-command")>();
  const { threadEnvironment } = await import("~/state/threads");
  return {
    ...actual,
    useAtomCommand: (...args: Parameters<typeof actual.useAtomCommand>) =>
      args[0] === threadEnvironment.updateMetadata ? state.update : actual.useAtomCommand(...args),
  };
});
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: state.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => ({ locale: state.locale }),
}));
const environmentId = EnvironmentId.make("relink-environment");
const threadRef = scopeThreadRef(environmentId, ThreadId.make("relink-thread"));
const projectId = ProjectId.make("relink-project");
const persisted: ThreadLinkedPullRequest = {
  projectId,
  repository: "literal/repository",
  number: 41,
  url: "https://github.com/literal/repository/pull/41",
};
const branch = "feature/$&/{branch}";
function detected(number = 42): NonNullable<VcsStatusResult["pr"]> {
  return {
    number,
    title: "Literal $& {title}",
    url: "https://github.com/literal/repository/pull/" + number,
    baseRef: "main",
    headRef: branch,
    state: "open",
  };
}
function replacement(number = 42): ThreadLinkedPullRequest {
  return { projectId, repository: persisted.repository, number, url: detected(number).url };
}
function Probe({ number, refName }: { number: number; refName: string }) {
  const linked = useThreadLinkedPullRequest({
    serverThreadRef: threadRef,
    environmentId,
    persisted,
    projectId,
    projectRepository: persisted.repository,
    threadBranch: branch,
    gitStatus: { refName, pr: detected(number) },
  });
  return <output>{linked.linked?.number}</output>;
}
function surface(locale: "en" | "zh-CN", number = 42, refName = branch) {
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
      <Probe number={number} refName={refName} />
    </WebI18nContext>
  );
}
type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
function deferred() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const previous = useRightPanelStore.getState();
  state.closed = true;
  state.update.mockReset();
  state.toast.mockClear();
  useRightPanelStore.getState().openPullRequest(threadRef, persisted);
  return {
    [Symbol.dispose]() {
      useRightPanelStore.setState(previous, true);
      state.locale = "en";
      state.closed = true;
      state.update.mockReset();
    },
  };
}
it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {host}")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)("uses settlement locale for automatic relink failure: %s", async (kind, cause) => {
  using _restore = setup();
  const pending = deferred();
  state.update.mockReturnValue(pending.promise);
  await using screen = await render(surface("en"));
  await using _drain = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        pending.resolve(AsyncResult.failure(Cause.interrupt()));
        await pending.promise;
      });
    },
  };
  await expect.poll(() => state.update.mock.calls.length).toBe(1);
  expect(state.update).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { threadId: threadRef.threadId, linkedPullRequest: replacement() },
  });
  expect(
    selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, threadRef),
  ).toMatchObject(replacement());
  await screen.rerender(surface("zh-CN"));
  expect(state.update).toHaveBeenCalledTimes(1);
  expect(state.toast).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve(
      AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause)),
    );
    await pending.promise;
  });
  if (kind === "interrupted") expect(state.toast).not.toHaveBeenCalled();
  else
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法更新会话的拉取请求",
      description: cause instanceof Error ? cause.message : "发生错误。",
      data: { actionLayout: "stacked-end" },
    });
  // A fresh eligible render may retry after failure; disable detection before rerendering.
  await screen.rerender(surface("en", 42, "other-branch"));
  expect(state.update).toHaveBeenCalledTimes(1);
});
it("serializes replacement writes and ignores a superseded failure", async () => {
  using _restore = setup();
  const first = deferred();
  const second = deferred();
  state.update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await using screen = await render(surface("en"));
  await using _drain = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        first.resolve(AsyncResult.failure(Cause.interrupt()));
        second.resolve(AsyncResult.failure(Cause.interrupt()));
        await Promise.all([first.promise, second.promise]);
      });
    },
  };
  await expect.poll(() => state.update.mock.calls.length).toBe(1);
  await screen.rerender(surface("zh-CN", 43));
  expect(state.update).toHaveBeenCalledTimes(1);
  await act(async () => {
    first.resolve(AsyncResult.failure(Cause.fail(new Error("stale"))));
    await first.promise;
  });
  await expect.poll(() => state.update.mock.calls.length).toBe(2);
  expect(state.toast).not.toHaveBeenCalled();
  expect(state.update).toHaveBeenNthCalledWith(2, {
    environmentId,
    input: { threadId: threadRef.threadId, linkedPullRequest: replacement(43) },
  });
  await act(async () => {
    second.resolve(AsyncResult.failure(Cause.interrupt()));
    await second.promise;
  });
  expect(state.toast).not.toHaveBeenCalled();
});
it.each(["same request", "open persisted", "different branch"] as const)(
  "skips ineligible automatic relinking: %s",
  async (kind) => {
    using _restore = setup();
    state.closed = kind !== "open persisted";
    await using screen = await render(
      surface(
        "en",
        kind === "same request" ? 41 : 42,
        kind === "different branch" ? "other" : branch,
      ),
    );
    await expect.element(screen.getByRole("status")).toHaveTextContent("41");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.toast).not.toHaveBeenCalled();
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, threadRef),
    ).toMatchObject(persisted);
  },
);

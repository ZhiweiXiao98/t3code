import "~/index.css";
import { useRef, useState } from "react";
import { AsyncResult } from "effect/reactivity";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { makeThreadErrorSetter, type LocalThreadErrorEntry } from "../ChatView.logic";
import { ChatBannerLane } from "./ChatBannerLane";
import * as Cause from "effect/Cause";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

const state = vi.hoisted(() => ({
  childThreadInputs: [] as EnvironmentThreadShell[],
  allowed: true,
  locale: "en" as "en" | "zh-CN",
  switchRef: (async () => undefined) as (input: unknown) => Promise<unknown>,
}));

vi.mock("../../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../../i18n/readWebI18n")>()),
  readWebI18n: () => ({
    locale: state.locale,
    t: (
      key: Parameters<typeof translateWebMessage>[1],
      values: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage(state.locale, key, values),
  }),
}));

vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));
vi.mock("./useForceStopThread", async (original) => ({
  ...(await original<typeof import("./useForceStopThread")>()),
  useForceStopThread: () => ({
    canForceStop: false,
    stoppingThreadId: null,
    forceStopThread: async () => undefined,
  }),
}));
vi.mock(import("../../state/session"), async (importOriginal) => ({
  ...(await importOriginal()),
  useEnvironmentScope: (() => true) as never,
  readEnvironmentScope: (() => state.allowed) as never,
}));

vi.mock(import("../../state/use-atom-command"), async (importOriginal) => ({
  ...(await importOriginal()),
  useAtomCommand: (() => (input: unknown) => state.switchRef(input)) as never,
}));

vi.mock(import("../../state/use-orchestration-command"), async (importOriginal) => ({
  ...(await importOriginal()),
  useOrchestrationCommand: (() => (input: unknown) => state.switchRef(input)) as never,
}));

vi.mock(import("../../hooks/useThreadActions"), async (importOriginal) => ({
  ...(await importOriginal()),
  useThreadActions: (() => ({})) as never,
  useAcknowledgeThreadWoke: (() => () => undefined) as never,
}));

vi.mock(import("../../state/entities"), async (importOriginal) => ({
  ...(await importOriginal()),
  useChildThreadInputs: (() => state.childThreadInputs) as never,
}));

import { render } from "../../../test/render";
import { useThreadLifecycle } from "./useThreadLifecycle";

const environmentId = EnvironmentId.make("environment:test");

function setup() {
  state.allowed = true;
  state.locale = "en";
  state.childThreadInputs = [];
  state.switchRef = async () => undefined;
}

function threadInput(threadId: string, branch: string) {
  const ref = scopeThreadRef(environmentId, ThreadId.make(threadId));
  const thread = { id: ref.threadId, environmentId, branch, worktreePath: null };
  return {
    routeThreadKey: scopedThreadKey(ref),
    activeThread: thread as never,
    activeThreadId: ref.threadId,
    activeThreadRef: ref,
    threadDetailRef: ref,
    activeThreadKey: scopedThreadKey(ref),
    localCheckoutBranchMismatch: { threadBranch: branch, currentBranch: "main" },
  };
}

type ThreadInput = ReturnType<typeof threadInput>;

it.each([
  { remote: false, approval: false, link: "Open question" },
  { remote: true, approval: false, link: "Open question" },
  { remote: true, approval: false, link: "Child" },
  { remote: true, approval: true, link: "Open approval" },
])("opens the child in its environment ($remote, $link)", async ({ remote, approval, link }) => {
  setup();
  const parent = threadInput("parent", "main");
  const childEnvironmentId = remote ? EnvironmentId.make("remote") : environmentId;
  state.childThreadInputs = [
    {
      id: ThreadId.make("child"),
      environmentId: childEnvironmentId,
      title: "Child",
      hasPendingApprovals: approval,
      lineage: { sideChat: false },
    } as EnvironmentThreadShell,
  ];
  await using screen = await render(
    <RestoreBranchHarness
      thread={parent}
      currentRouteThreadKeyRef={{ current: parent.routeThreadKey }}
      refreshGitStatus={() => undefined}
      focusComposer={() => undefined}
    />,
    { router: "/environment:test/parent" },
  );
  await screen.getByRole("button", { name: link, exact: true }).click();
  await vi.waitFor(() =>
    expect(screen.router?.state.location.pathname).toBe(
      `/${encodeURIComponent(childEnvironmentId)}/child`,
    ),
  );
});

function RestoreBranchHarness(props: {
  readonly thread: ThreadInput;
  readonly showErrors?: boolean;
  readonly goal?: boolean;
  readonly settled?: () => void;
  readonly currentRouteThreadKeyRef: { readonly current: string | null };
  readonly refreshGitStatus: () => void;
  readonly focusComposer: () => void;
}) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismissTick] = useState(0);
  const setError = makeThreadErrorSetter({
    routeThreadRef: props.thread.activeThreadRef,
    routeThreadKey: props.thread.routeThreadKey,
    draftId: null,
    serverThreadRef: props.thread.activeThreadRef,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const entry = entries[props.thread.routeThreadKey];
  const sendInFlightRef = useRef(false);
  const lifecycle = useThreadLifecycle({
    ...props.thread,
    threadDetailRef: props.showErrors ? null : props.thread.threadDetailRef,
    environmentId,
    currentRouteThreadKeyRef: props.currentRouteThreadKeyRef,
    canOperateThread: true,
    clientSettingsHydrated: true,
    activeThreadShell: props.goal
      ? ({ goal: { objective: "opaque/$&/{goal}", status: "paused" } } as EnvironmentThreadShell)
      : null,
    limitRecoveryHoldsSnooze: false,
    activeLatestRun: null as never,
    activeProjectCwd: "/repo",
    serverConfig: null,
    runtimeMode: "full-access" as never,
    isWorking: false,
    pendingBackgroundTasks: [{ taskId: "background-command", kind: "command" }] as never,
    turnItems: [],
    activePendingApproval: null as never,
    activePendingUserInput: null as never,
    gitStatusQuery: { refresh: props.refreshGitStatus },
    nowMinute: "",
    composerRef: {
      current: {
        focusAtEnd: props.focusComposer,
        getSendContext: () => ({
          providerAvailable: true,
          selectedModelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5.5",
          },
        }),
      },
    } as never,
    composerDraftTarget: { kind: "thread", ref: props.thread.activeThreadRef } as never,
    sendInFlightRef,
    setOptimisticUserMessages: () => undefined,
    setThreadError: setError,
    clearUsageLimitsFor: () => undefined,
    beginLocalDispatch: () => undefined,
    resetLocalDispatch: props.settled ?? (() => undefined),
    scrollToEnd: () => undefined,
    persistThreadSettingsForNextTurn: async () => ({ _tag: "Success", value: undefined }) as never,
  });
  return (
    <>
      {lifecycle.childInputNow?.description}
      {lifecycle.childInputNow?.actions}
      {lifecycle.workNow?.actions}
      {lifecycle.goalNow?.actions}
      {props.showErrors ? (
        <ChatBannerLane
          environmentId={environmentId}
          providerStatus={null}
          providerStatusBannerKey={null}
          setDismissedProviderStatusBannerKey={() => undefined}
          onOpenProviderSetup={() => undefined}
          threadId={props.thread.activeThreadId}
          threadError={entry?.message ?? null}
          localThreadErrorEntry={entry}
          threadErrorClass={null}
          threadErrorCode={null}
          threadErrorBannerKey={null}
          setThreadError={setError}
          setThreadErrorBannerDismissTick={setDismissTick}
        />
      ) : null}
      <button
        type="button"
        disabled={lifecycle.isRestoringThreadBranch}
        onClick={lifecycle.handleSwitchCheckoutToThreadStable}
      >
        {lifecycle.isRestoringThreadBranch ? "Restoring..." : "Restore branch"}
      </button>
    </>
  );
}

it.each(["a", "b", "navigation"] as const)(
  "isolates restore completion and queued focus for %s",
  async (scenario) => {
    const first = scenario === "b" ? "b" : "a";
    setup();
    const completions: Array<(result: unknown) => void> = [];
    const switchRef = vi.fn(() => new Promise<unknown>((resolve) => completions.push(resolve)));
    state.switchRef = switchRef;
    const threadA = threadInput("thread:a", "feature-a");
    const threadB = threadInput("thread:b", "feature-b");
    const currentRouteThreadKeyRef = { current: threadA.routeThreadKey };
    const refreshGitStatus = vi.fn();
    const focusComposer = vi.fn();
    const harness = (thread: ThreadInput) => (
      <RestoreBranchHarness
        thread={thread}
        currentRouteThreadKeyRef={currentRouteThreadKeyRef}
        refreshGitStatus={refreshGitStatus}
        focusComposer={focusComposer}
      />
    );
    await using screen = await render(harness(threadA));
    const focusFrames: FrameRequestCallback[] = [];
    using _frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      focusFrames.push(callback);
      return 0;
    });

    await page.getByRole("button", { name: "Restore branch" }).click();
    await expect.element(page.getByRole("button", { name: "Restoring..." })).toBeDisabled();

    // ChatView stays mounted across server threads, so the hook sees thread B in place.
    currentRouteThreadKeyRef.current = threadB.routeThreadKey;
    await screen.rerender(harness(threadB));
    await expect.element(page.getByRole("button", { name: "Restore branch" })).toBeEnabled();
    await page.getByRole("button", { name: "Restore branch" }).click();
    expect(switchRef).toHaveBeenLastCalledWith(
      expect.objectContaining({ input: { cwd: "/repo", refName: "feature-b" } }),
    );

    // Back on thread A, its own restore is still pending, so it can't start a second one.
    currentRouteThreadKeyRef.current = threadA.routeThreadKey;
    await screen.rerender(harness(threadA));
    await expect.element(page.getByRole("button", { name: "Restoring..." })).toBeDisabled();
    currentRouteThreadKeyRef.current = threadB.routeThreadKey;
    await screen.rerender(harness(threadB));

    const completed = first === "a" ? threadA : threadB;
    const pending = first === "a" ? threadB : threadA;
    currentRouteThreadKeyRef.current = pending.routeThreadKey;
    await screen.rerender(harness(pending));
    completions[first === "a" ? 0 : 1]!({
      _tag: "Success",
      value: { refName: completed.localCheckoutBranchMismatch.threadBranch },
    });
    await vi.waitFor(() => expect(refreshGitStatus).toHaveBeenCalledOnce());
    expect(focusComposer).not.toHaveBeenCalled();
    await expect.element(page.getByRole("button", { name: "Restoring..." })).toBeDisabled();
    expect(switchRef).toHaveBeenCalledTimes(2);

    completions[first === "a" ? 1 : 0]!({
      _tag: "Success",
      value: { refName: pending.localCheckoutBranchMismatch.threadBranch },
    });
    await expect.element(page.getByRole("button", { name: "Restore branch" })).toBeEnabled();
    expect(refreshGitStatus).toHaveBeenCalledTimes(2);
    expect(focusComposer).not.toHaveBeenCalled();
    expect(focusFrames).toHaveLength(1);
    if (scenario === "navigation") {
      currentRouteThreadKeyRef.current = completed.routeThreadKey;
      await screen.rerender(harness(completed));
    }
    focusFrames[0]!(0);
    expect(focusComposer).toHaveBeenCalledTimes(scenario === "navigation" ? 0 : 1);
  },
);

it.each(["Success", "Failure"] as const)(
  "keeps background stop requests per thread after %s",
  async (outcome) => {
    setup();
    const completions: Array<(result: unknown) => void> = [];
    state.switchRef = vi.fn(() => new Promise((resolve) => completions.push(resolve)));
    const threadA = threadInput("thread:a", "feature-a");
    const threadB = threadInput("thread:b", "feature-b");
    const currentRouteThreadKeyRef = { current: threadA.routeThreadKey };
    const harness = (thread: ThreadInput) => (
      <RestoreBranchHarness
        thread={thread}
        currentRouteThreadKeyRef={currentRouteThreadKeyRef}
        refreshGitStatus={() => undefined}
        focusComposer={() => undefined}
      />
    );
    await using screen = await render(harness(threadA));
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Stopping..." })).toBeDisabled();
    await screen.rerender(harness(threadB));
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await screen.rerender(harness(threadA));
    await expect.element(page.getByRole("button", { name: "Stopping..." })).toBeDisabled();
    completions[0]!(
      outcome === "Success"
        ? { _tag: "Success", value: undefined }
        : { _tag: "Failure", cause: Cause.fail(new Error("stop failed")) },
    );
    if (outcome === "Success") {
      await expect.element(page.getByRole("button", { name: "Stopping..." })).toBeDisabled();
    } else {
      await expect.element(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
    }
    await screen.rerender(harness(threadB));
    await expect.element(page.getByRole("button", { name: "Stopping..." })).toBeDisabled();
    expect(state.switchRef).toHaveBeenCalledTimes(2);
    completions[1]!({ _tag: "Success", value: undefined });
  },
);

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "keeps background stop %s failure current without another interrupt",
  async (kind) => {
    setup();
    const thread = threadInput("stop-fixture", "main");
    const currentRouteThreadKeyRef = { current: thread.routeThreadKey };
    const refreshGitStatus = vi.fn();
    const focusComposer = vi.fn();
    let finish!: (result: unknown) => void;
    const interrupt = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    state.switchRef = interrupt;
    const surface = (locale: "en" | "zh-CN") => (
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <RestoreBranchHarness
          thread={thread}
          currentRouteThreadKeyRef={currentRouteThreadKeyRef}
          refreshGitStatus={refreshGitStatus}
          focusComposer={focusComposer}
          showErrors
        />
      </WebI18nContext>
    );
    await using screen = await render(surface("en"));
    await screen.getByRole("button", { name: "Stop", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: "Stopping...", exact: true }))
      .toBeDisabled();
    await screen.rerender(surface("zh-CN"));
    finish(
      AsyncResult.failure(
        kind === "interrupted"
          ? Cause.interrupt()
          : Cause.fail(
              kind === "owned"
                ? null
                : new Error(kind === "empty" ? "" : "Failed to stop background work."),
            ),
      ),
    );
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale));
      await expect
        .element(
          screen.getByRole("button", { name: locale === "en" ? "Stop" : "停止", exact: true }),
        )
        .toBeEnabled();
      if (kind === "empty" || kind === "interrupted")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            kind === "owned" && locale === "zh-CN"
              ? "停止后台任务失败。"
              : "Failed to stop background work.",
          );
    }
    expect(interrupt).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { threadId: thread.activeThreadId },
    });
    expect(refreshGitStatus).not.toHaveBeenCalled();
    expect(focusComposer).not.toHaveBeenCalled();
  },
);
it("does not stop background work after permission is denied", async () => {
  setup();
  state.allowed = false;
  const interrupt = vi.fn();
  state.switchRef = interrupt;
  const thread = threadInput("denied-stop", "main");
  await using screen = await render(
    <RestoreBranchHarness
      thread={thread}
      currentRouteThreadKeyRef={{ current: thread.routeThreadKey }}
      refreshGitStatus={() => undefined}
      focusComposer={() => undefined}
      showErrors
    />,
  );
  await screen.getByRole("button", { name: "Stop", exact: true }).click();
  expect(interrupt).not.toHaveBeenCalled();
});

it.each([
  { action: "resume", kind: "owned" },
  { action: "clear", kind: "owned" },
  { action: "resume", kind: "raw" },
  { action: "clear", kind: "raw" },
  { action: "resume", kind: "empty" },
  { action: "clear", kind: "interrupted" },
] as const)(
  "keeps $kind goal $action failure current without another command",
  async ({ action, kind }) => {
    setup();
    const thread = threadInput(`goal-${action}`, "main");
    const currentRouteThreadKeyRef = { current: thread.routeThreadKey };
    const settled = vi.fn();
    let finish!: (value: unknown) => void;
    const command = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    state.switchRef = command;
    const surface = (locale: "en" | "zh-CN") => {
      state.locale = locale;
      return (
        <WebI18nContext
          value={{
            locale,
            appLocale: locale,
            setAppLocale: () => undefined,
            t: (key, values) => translateWebMessage(locale, key, values),
          }}
        >
          <RestoreBranchHarness
            thread={thread}
            currentRouteThreadKeyRef={currentRouteThreadKeyRef}
            refreshGitStatus={() => undefined}
            focusComposer={() => undefined}
            showErrors
            goal
            settled={settled}
          />
        </WebI18nContext>
      );
    };
    await using screen = await render(surface("en"));
    await screen
      .getByRole("button", { name: action === "resume" ? "Resume" : "Clear", exact: true })
      .click();
    await expect.poll(() => command.mock.calls.length).toBe(1);
    await screen.rerender(surface("zh-CN"));
    await screen
      .getByRole("button", { name: action === "resume" ? "继续" : "清除", exact: true })
      .click();
    expect(command).toHaveBeenCalledTimes(1);
    finish(
      AsyncResult.failure(
        kind === "interrupted"
          ? Cause.interrupt()
          : Cause.fail(
              kind === "owned"
                ? null
                : new Error(kind === "empty" ? "" : `Failed to ${action} goal.`),
            ),
      ),
    );
    await expect.poll(() => settled.mock.calls.length).toBe(1);
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale));
      if (kind === "empty" || kind === "interrupted")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            locale === "en" || kind === "raw"
              ? `Failed to ${action} goal.`
              : action === "resume"
                ? "恢复目标失败。"
                : "清除目标失败。",
          );
    }
    expect(command).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        environmentId,
        input: expect.objectContaining({
          threadId: thread.activeThreadId,
          message: expect.objectContaining({ text: `/goal ${action}`, attachments: [] }),
        }),
      }),
    );
  },
);

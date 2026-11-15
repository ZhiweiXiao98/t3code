import "~/index.css";
import { useRef, useState } from "react";
import { EnvironmentId, ThreadId, RunId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { makeThreadFixture } from "../../test-fixtures";
import { makeThreadErrorSetter, type LocalThreadErrorEntry } from "../ChatView.logic";
import { ChatBannerLane } from "./ChatBannerLane";
const fixture = vi.hoisted(() => ({
  fork: vi.fn(),
  wait: vi.fn(),
  rewind: vi.fn(),
  query: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: () => fixture.fork,
}));
vi.mock("../../state/use-orchestration-command", async (original) => ({
  ...(await original<typeof import("../../state/use-orchestration-command")>()),
  useOrchestrationCommand: () => fixture.rewind,
}));
vi.mock("../../state/use-atom-query-runner", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-query-runner")>()),
  useAtomQueryRunner: () => fixture.query,
}));
vi.mock("../../state/entities", async (original) => ({
  ...(await original<typeof import("../../state/entities")>()),
  waitForThreadShell: fixture.wait,
}));
vi.mock("../../i18n/readWebI18n", async (original) => {
  const { translateWebMessage } = await import("../../i18n/messages");
  return {
    ...(await original<typeof import("../../i18n/readWebI18n")>()),
    readWebI18n: () => ({
      locale: fixture.locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(fixture.locale, key, values),
    }),
  };
});
import { useTimelineRewind } from "./useTimelineRewind";
const ref = {
  environmentId: EnvironmentId.make("fork-fixture"),
  threadId: ThreadId.make("source-thread"),
};
const runId = RunId.make("source-run");
const activeThread = makeThreadFixture({ ...ref, id: ref.threadId, title: "Literal $& {title}" });
function setup() {
  fixture.locale = "en";
  fixture.fork.mockReset().mockResolvedValue(AsyncResult.failure(Cause.fail(null)));
  fixture.wait.mockReset().mockResolvedValue(false);
  fixture.rewind.mockReset();
  fixture.query.mockReset();
}
function Probe({
  absent = false,
  unavailable = false,
}: {
  absent?: boolean;
  unavailable?: boolean;
}) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismissTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const promptRef = useRef("");
  const composerRef = useRef(null);
  const routeRef = useRef("fork");
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "fork",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const actions = useTimelineRewind({
    environmentId: ref.environmentId,
    routeThreadRef: ref,
    routeThreadKey: "fork",
    currentRouteThreadKeyRef: routeRef,
    serverProjection: null,
    activeThread: absent ? undefined : activeThread,
    timelineMessages: [],
    phase: "ready",
    isSendBusy: false,
    isRevertingCheckpoint: false,
    supportsConversationRollback: true,
    activeEnvironmentUnavailable: unavailable,
    activeEnvironmentUnavailableLabel: null,
    promptRef,
    composerRef,
    composerDraftTarget: ref,
    setThreadError: setError,
  });
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await actions.onForkFromRunStable({ sourceThreadId: ref.threadId, runId });
          setBusy(false);
        }}
      >
        Fork
      </button>
      <ChatBannerLane
        environmentId={ref.environmentId}
        providerStatus={null}
        providerStatusBannerKey={null}
        setDismissedProviderStatusBannerKey={() => undefined}
        onOpenProviderSetup={() => undefined}
        threadId={ref.threadId}
        threadError={entries.fork?.message ?? null}
        localThreadErrorEntry={entries.fork}
        threadErrorClass={null}
        threadErrorCode={null}
        threadErrorBannerKey={null}
        setThreadError={setError}
        setThreadErrorBannerDismissTick={setDismissTick}
      />
    </>
  );
}
function surface(locale: "en" | "zh-CN", props: { absent?: boolean; unavailable?: boolean } = {}) {
  fixture.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Probe {...props} />
    </WebI18nContext>
  );
}
const missingEnglish =
  "The fork was created, but its thread data did not reach this client. Reconnect and try opening it from the sidebar.";
it.each(["failure", "missing"] as const)(
  "keeps owned fork %s notice current without another operation",
  async (stage) => {
    setup();
    let finishFork!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    let finishShell!: (ready: boolean) => void;
    if (stage === "failure")
      fixture.fork.mockReturnValue(
        new Promise((resolve) => {
          finishFork = resolve;
        }),
      );
    else {
      fixture.fork.mockResolvedValue(AsyncResult.success(undefined));
      fixture.wait.mockReturnValue(
        new Promise((resolve) => {
          finishShell = resolve;
        }),
      );
    }
    await using screen = await render(surface("en"));
    await screen.getByRole("button", { name: "Fork", exact: true }).click();
    await expect.element(screen.getByRole("button", { name: "Fork", exact: true })).toBeDisabled();
    if (stage === "missing") await expect.poll(() => fixture.wait.mock.calls.length).toBe(1);
    await screen.rerender(surface("zh-CN"));
    if (stage === "failure") finishFork(AsyncResult.failure(Cause.fail(null)));
    else finishShell(false);
    await expect.element(screen.getByRole("button", { name: "Fork", exact: true })).toBeEnabled();
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale));
      const expected =
        stage === "failure"
          ? locale === "en"
            ? "Failed to fork this response."
            : "从此回复创建分支失败。"
          : locale === "en"
            ? missingEnglish
            : "分支会话已创建，但其数据未能到达此客户端。请重新连接，然后尝试从侧边栏打开。";
      await expect.poll(() => screen.container.textContent).toContain(expected);
    }
    expect(fixture.fork).toHaveBeenCalledTimes(1);
    const target = fixture.fork.mock.calls[0]![0].input.targetThreadId;
    expect(target).toEqual(expect.any(String));
    expect(fixture.fork).toHaveBeenCalledWith({
      environmentId: ref.environmentId,
      input: {
        sourceThreadId: ref.threadId,
        targetThreadId: target,
        runId,
        title: "Literal $& {title} fork",
      },
    });
    expect(fixture.wait).toHaveBeenCalledTimes(stage === "missing" ? 1 : 0);
    if (stage === "missing")
      expect(fixture.wait).toHaveBeenCalledWith({
        environmentId: ref.environmentId,
        threadId: target,
      });
    expect(screen.router?.state.location.pathname).toBe("/");
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
  },
);
it.each(["Failed to fork this response.", missingEnglish, "", " \n "])(
  "preserves raw fork failure %j",
  async (message) => {
    setup();
    let finish!: (result: unknown) => void;
    fixture.fork.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await using screen = await render(surface("en"));
    await screen.getByRole("button", { name: "Fork", exact: true }).click();
    await expect.element(screen.getByRole("button", { name: "Fork", exact: true })).toBeDisabled();
    finish(AsyncResult.failure(Cause.fail(new Error(message))));
    await expect.element(screen.getByRole("button", { name: "Fork", exact: true })).toBeEnabled();
    await screen.rerender(surface("zh-CN"));
    if (message) await expect.poll(() => screen.container.textContent).toContain(message);
    else expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
    expect(fixture.fork).toHaveBeenCalledTimes(1);
    expect(fixture.wait).not.toHaveBeenCalled();
  },
);
it.each(["absent", "unavailable"] as const)("does not fork when %s", async (guard) => {
  setup();
  await using screen = await render(surface("en", { [guard]: true }));
  await screen.getByRole("button", { name: "Fork", exact: true }).click();
  expect(fixture.fork).not.toHaveBeenCalled();
  expect(fixture.wait).not.toHaveBeenCalled();
});
it("keeps interrupted fork silent and does not wait for a shell", async () => {
  setup();
  let finish!: (result: unknown) => void;
  fixture.fork.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en"));
  await screen.getByRole("button", { name: "Fork", exact: true }).click();
  await expect.element(screen.getByRole("button", { name: "Fork", exact: true })).toBeDisabled();
  finish(AsyncResult.failure(Cause.interrupt()));
  await expect.element(screen.getByRole("button", { name: "Fork", exact: true })).toBeEnabled();
  expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
  expect(fixture.fork).toHaveBeenCalledTimes(1);
  expect(fixture.wait).not.toHaveBeenCalled();
});

it("opens a successful fork only after its shell arrives", async () => {
  setup();
  fixture.fork.mockResolvedValue(AsyncResult.success(undefined));
  let finish!: (ready: boolean) => void;
  fixture.wait.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en"));
  await screen.getByRole("button", { name: "Fork", exact: true }).click();
  await expect.poll(() => fixture.wait.mock.calls.length).toBe(1);
  expect(screen.router?.state.location.pathname).toBe("/");
  const target = fixture.fork.mock.calls[0]![0].input.targetThreadId;
  finish(true);
  await expect
    .poll(() => screen.router?.state.location.pathname)
    .toBe(`/${ref.environmentId}/${target}`);
  expect(fixture.fork).toHaveBeenCalledTimes(1);
  expect(fixture.wait).toHaveBeenCalledTimes(1);
});

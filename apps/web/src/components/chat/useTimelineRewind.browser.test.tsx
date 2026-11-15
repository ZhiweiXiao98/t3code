import "~/index.css";
import { useRef, useState } from "react";
import {
  EnvironmentId,
  ThreadId,
  RunId,
  MessageId,
  ChatAttachmentId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { environmentThreadDetails } from "../../state/threads";
import { Atom, AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { useComposerDraftStore } from "../../composerDraftStore";
import { makeThreadFixture, makeThreadProjectionFixture } from "../../test-fixtures";
import { makeThreadErrorSetter, type LocalThreadErrorEntry } from "../ChatView.logic";
import { ChatBannerLane } from "./ChatBannerLane";
const fixture = vi.hoisted(() => ({
  prepareDefault: undefined as
    | typeof import("../ChatView.logic").prepareRevertedMessageAttachments
    | undefined,
  prepare: vi.fn(),
  connection: vi.fn(),
  allowed: true,
  localApi: true,
  confirm: vi.fn(),
  fork: vi.fn(),
  wait: vi.fn(),
  rewind: vi.fn(),
  query: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("../ChatView.logic", async (original) => {
  const actual = await original<typeof import("../ChatView.logic")>();
  fixture.prepareDefault = actual.prepareRevertedMessageAttachments;
  fixture.prepare.mockImplementation(actual.prepareRevertedMessageAttachments);
  return { ...actual, prepareRevertedMessageAttachments: fixture.prepare };
});
vi.mock("../../localApi", async (original) => {
  const actual = await original<typeof import("../../localApi")>();
  const api = actual.createLocalApi();
  return { ...actual, readLocalApi: () => (fixture.localApi ? api : undefined) };
});
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  readEnvironmentScope: () => fixture.allowed,
  readPreparedConnection: fixture.connection,
}));
vi.mock("./ChatOverlayHosts", async (original) => ({
  ...(await original<typeof import("./ChatOverlayHosts")>()),
  openRevertConfirm: fixture.confirm,
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
  fixture.allowed = true;
  fixture.localApi = true;
  fixture.confirm.mockReset();
  if (!fixture.prepareDefault) throw new Error("Preparation mock is not initialized");
  fixture.prepare.mockReset().mockImplementation(fixture.prepareDefault);
  fixture.connection.mockReset().mockReturnValue(null);
  fixture.fork.mockReset().mockResolvedValue(AsyncResult.failure(Cause.fail(null)));
  fixture.wait.mockReset().mockResolvedValue(false);
  fixture.rewind.mockReset();
  fixture.query.mockReset();
}
function Probe({
  absent = false,
  unavailable = false,
  reconnectLabel,
  eligibility,
  attachmentCase,
  unknownAttachment = false,
  fileAttachment = false,
  fileName = "literal-file-$&-{file}.txt",
}: {
  absent?: boolean;
  unavailable?: boolean;
  reconnectLabel?: string;
  eligibility?: "unsupported" | "running" | "sending";
  attachmentCase?: "owned" | "raw" | "empty";
  unknownAttachment?: boolean;
  fileAttachment?: boolean;
  fileName?: string;
}) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismissTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const promptRef = useRef("");
  const composerRef = useRef(null);
  const attachmentComposerRef = useRef({ hasPendingAttachments: () => attachmentCase === "owned" });
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
    timelineMessages:
      eligibility || attachmentCase || reconnectLabel !== undefined
        ? [
            {
              id: MessageId.make("rewind-message"),
              role: "user",
              text: "Literal $& {prompt}",
              attachments: unknownAttachment
                ? [
                    {
                      type: "future-attachment",
                      id: ChatAttachmentId.make("unknown-attachment"),
                      name: "literal-$&-{file}",
                      mimeType: "application/x-future",
                      sizeBytes: 1,
                    },
                  ]
                : fileAttachment
                  ? [
                      {
                        type: "file",
                        id: ChatAttachmentId.make("opaque-file"),
                        name: fileName,
                        mimeType: "text/plain",
                        sizeBytes: 1,
                      },
                    ]
                  : [],
              runId: null,
              streaming: false,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ]
        : [],
    phase: eligibility === "running" ? "running" : "ready",
    isSendBusy: eligibility === "sending",
    isRevertingCheckpoint: false,
    supportsConversationRollback: eligibility !== "unsupported",
    activeEnvironmentUnavailable: unavailable,
    activeEnvironmentUnavailableLabel: reconnectLabel ?? null,
    promptRef,
    composerRef: attachmentCase ? (attachmentComposerRef as never) : composerRef,
    composerDraftTarget: ref,
    setThreadError: setError,
  });
  return (
    <>
      {attachmentCase ? (
        <button
          type="button"
          onClick={() => actions.onConfirmRevertStable(1, MessageId.make("rewind-message"), false)}
        >
          Confirm revert
        </button>
      ) : null}
      {eligibility || reconnectLabel !== undefined ? (
        <button
          type="button"
          onClick={() => actions.onRevertTimelineTurnStable(1, MessageId.make("rewind-message"))}
        >
          Revert
        </button>
      ) : null}
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
function surface(
  locale: "en" | "zh-CN",
  props: {
    absent?: boolean;
    unavailable?: boolean;
    reconnectLabel?: string;
    eligibility?: "unsupported" | "running" | "sending";
    attachmentCase?: "owned" | "raw" | "empty";
    unknownAttachment?: boolean;
    fileAttachment?: boolean;
    fileName?: string;
  } = {},
) {
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

it.each(["unsupported", "running", "sending"] as const)(
  "keeps owned rewind eligibility %s current without operations",
  async (eligibility) => {
    setup();
    await using screen = await render(surface("en", { eligibility }));
    await screen.getByRole("button", { name: "Revert", exact: true }).click();
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, { eligibility }));
      await expect
        .poll(() => screen.container.textContent)
        .toContain(
          eligibility === "unsupported"
            ? locale === "en"
              ? "This provider does not support reverting conversation history. Start a new thread instead."
              : "此提供商不支持还原对话历史。请新建会话。"
            : locale === "en"
              ? "Interrupt the current turn before reverting checkpoints."
              : "请先中断当前轮次，再还原检查点。",
        );
    }
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(fixture.confirm).not.toHaveBeenCalled();
  },
);
it.each(["scope", "local-api", "absent"] as const)(
  "keeps rewind eligibility silent behind %s guard",
  async (guard) => {
    setup();
    fixture.localApi = guard !== "local-api";
    await using screen = await render(
      surface("en", { eligibility: "unsupported", absent: guard === "absent" }),
    );
    fixture.allowed = guard !== "scope";
    await screen.getByRole("button", { name: "Revert", exact: true }).click();
    expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.confirm).not.toHaveBeenCalled();
  },
);

it.each(["owned", "raw", "empty"] as const)(
  "keeps rewind attachment preflight %s",
  async (attachmentCase) => {
    setup();
    const source = "Wait for attachments to finish preparing before rewinding.";
    if (attachmentCase !== "owned")
      fixture.connection.mockImplementation(() => {
        throw new Error(attachmentCase === "raw" ? source : "");
      });
    const originalKeys = useComposerDraftStore.getState().rewindingThreadKeys;
    const originalDraft = useComposerDraftStore.getState().getComposerDraft(ref);
    using _restore = {
      [Symbol.dispose]: () => useComposerDraftStore.setState({ rewindingThreadKeys: originalKeys }),
    };
    await using screen = await render(surface("en", { attachmentCase }));
    await screen.getByRole("button", { name: "Confirm revert", exact: true }).click();
    await expect
      .poll(() => useComposerDraftStore.getState().rewindingThreadKeys.has("fork"))
      .toBe(false);
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, { attachmentCase }));
      if (attachmentCase === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            attachmentCase === "owned" && locale === "zh-CN"
              ? "请等待附件准备完成后再回退。"
              : source,
          );
    }
    expect(fixture.connection).toHaveBeenCalledTimes(attachmentCase === "owned" ? 0 : 1);
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(originalDraft);
  },
);

it.each(["null", "undefined", "raw", "empty"] as const)(
  "keeps rewind catch %s notice current",
  async (kind) => {
    setup();
    const source = "Failed to revert thread state.";
    fixture.connection.mockImplementation(() => {
      throw kind === "null"
        ? null
        : kind === "undefined"
          ? undefined
          : new Error(kind === "raw" ? source : "");
    });
    const originalKeys = useComposerDraftStore.getState().rewindingThreadKeys;
    const originalDraft = useComposerDraftStore.getState().getComposerDraft(ref);
    using _restore = {
      [Symbol.dispose]: () => useComposerDraftStore.setState({ rewindingThreadKeys: originalKeys }),
    };
    await using screen = await render(surface("en", { attachmentCase: "raw" }));
    await screen.getByRole("button", { name: "Confirm revert", exact: true }).click();
    await expect.poll(() => fixture.connection.mock.calls.length).toBe(1);
    await expect
      .poll(() => useComposerDraftStore.getState().rewindingThreadKeys.has("fork"))
      .toBe(false);
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, { attachmentCase: "raw" }));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            (kind === "null" || kind === "undefined") && locale === "zh-CN"
              ? "还原会话状态失败。"
              : source,
          );
    }
    expect(fixture.connection).toHaveBeenCalledExactlyOnceWith(ref.environmentId);
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(originalDraft);
  },
);

it.each(["owned", "raw", "empty"] as const)(
  "keeps rewind capacity %s notice current",
  async (kind) => {
    setup();
    const source = "Make room for this message's attachments in the composer before rewinding.";
    const original = useComposerDraftStore.getState();
    using _restore = { [Symbol.dispose]: () => useComposerDraftStore.setState(original, true) };
    const files = Array.from({ length: PROVIDER_SEND_TURN_MAX_ATTACHMENTS }, (_, index) => ({
      type: "file" as const,
      id: ChatAttachmentId.make(`capacity-${index}`),
      name: `literal-$&-{file}-${index}.txt`,
      mimeType: "text/plain",
      sizeBytes: 1,
      file: new File(["x"], `literal-$&-{file}-${index}.txt`, { type: "text/plain" }),
    }));
    expect(original.addFiles(ref, files)).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS);
    const before = useComposerDraftStore.getState().getComposerDraft(ref);
    expect(before?.files).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS);
    fixture.connection.mockReturnValue({ httpBaseUrl: "https://example.invalid" });
    if (kind === "owned")
      fixture.prepare.mockResolvedValueOnce([
        new File(["y"], "restored-$&-{file}.txt", { type: "text/plain" }),
      ]);
    else fixture.prepare.mockRejectedValueOnce(new Error(kind === "raw" ? source : ""));
    await using screen = await render(surface("en", { attachmentCase: "raw" }));
    await screen.getByRole("button", { name: "Confirm revert", exact: true }).click();
    await expect.poll(() => fixture.prepare.mock.calls.length).toBe(1);
    await expect
      .poll(() => useComposerDraftStore.getState().rewindingThreadKeys.has("fork"))
      .toBe(false);
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, { attachmentCase: "raw" }));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            kind === "owned" && locale === "zh-CN"
              ? "请先在输入框中为此消息的附件腾出空间，再回退会话。"
              : source,
          );
    }
    expect(fixture.connection).toHaveBeenCalledExactlyOnceWith(ref.environmentId);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(before);
  },
);

it.each(["owned", "raw", "empty"] as const)(
  "keeps rewind changed %s notice current",
  async (kind) => {
    setup();
    const source = "The thread has changed. Select a message to rewind again.";
    const original = useComposerDraftStore.getState();
    using _restore = { [Symbol.dispose]: () => useComposerDraftStore.setState(original, true) };
    const before = original.getComposerDraft(ref);
    fixture.connection.mockReturnValue({ httpBaseUrl: "https://example.invalid" });
    if (kind === "owned") fixture.prepare.mockResolvedValueOnce([]);
    else fixture.prepare.mockRejectedValueOnce(new Error(kind === "raw" ? source : ""));
    const projection = makeThreadProjectionFixture();
    const atom = Atom.make({ data: Option.some({ ...projection, runs: [] }) });
    using projectionRead = vi
      .spyOn(environmentThreadDetails, "stateAtom")
      .mockReturnValue(atom as never);
    await using screen = await render(surface("en", { attachmentCase: "raw" }));
    await screen.getByRole("button", { name: "Confirm revert", exact: true }).click();
    await expect.poll(() => fixture.prepare.mock.calls.length).toBe(1);
    await expect
      .poll(() => useComposerDraftStore.getState().rewindingThreadKeys.has("fork"))
      .toBe(false);
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, { attachmentCase: "raw" }));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            kind === "owned" && locale === "zh-CN"
              ? "会话已更改。请重新选择要回退到的消息。"
              : source,
          );
    }
    expect(projectionRead).toHaveBeenCalledTimes(kind === "owned" ? 1 : 0);
    expect(fixture.connection).toHaveBeenCalledExactlyOnceWith(ref.environmentId);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(before);
  },
);

it.each(["owned", "raw", "empty"] as const)(
  "keeps rewind timeout %s notice current",
  async (kind) => {
    setup();
    const source = "Timed out waiting for the thread to rewind.";
    const original = useComposerDraftStore.getState();
    using _restore = { [Symbol.dispose]: () => useComposerDraftStore.setState(original, true) };
    const before = original.getComposerDraft(ref);
    fixture.connection.mockReturnValue({ httpBaseUrl: "https://example.invalid" });
    if (kind === "owned") fixture.prepare.mockResolvedValueOnce([]);
    else fixture.prepare.mockRejectedValueOnce(new Error(kind === "raw" ? source : ""));
    fixture.rewind.mockResolvedValue(AsyncResult.success(undefined));
    const projection = makeThreadProjectionFixture();
    const atom = Atom.make({
      data: Option.some({
        ...projection,
        thread: { ...projection.thread, id: ref.threadId },
        runs: [
          {
            id: RunId.make("timeout-witness"),
            threadId: ref.threadId,
            ordinal: 2,
            providerInstanceId: projection.thread.providerInstanceId,
            modelSelection: projection.thread.modelSelection,
            providerThreadId: null,
            userMessageId: MessageId.make("witness-message"),
            rootNodeId: null,
            activeAttemptId: null,
            status: "completed" as const,
            requestedAt: projection.updatedAt,
            startedAt: projection.updatedAt,
            completedAt: projection.updatedAt,
            checkpointId: null,
            contextHandoffId: null,
          },
        ],
      }),
    });
    using _projection = vi
      .spyOn(environmentThreadDetails, "stateAtom")
      .mockReturnValue(atom as never);
    await using screen = await render(surface("en", { attachmentCase: "raw" }));
    const realTimeout = globalThis.setTimeout.bind(globalThis);
    let fired = false;
    let fire: (() => void) | undefined;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    using _timeout = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback, delay, ...args) => {
        const id = realTimeout(callback, delay, ...args);
        if (delay === 120_000 && typeof callback === "function") {
          timeoutId = id;
          fire = () => {
            fired = true;
            callback(...args);
          };
        }
        return id;
      });
    using clear = vi.spyOn(globalThis, "clearTimeout");
    using _timerCleanup = {
      [Symbol.dispose]: () => {
        if (!fired) fire?.();
        if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
      },
    };
    await screen.getByRole("button", { name: "Confirm revert", exact: true }).click();
    await expect.poll(() => fixture.prepare.mock.calls.length).toBe(1);
    if (kind === "owned") {
      await expect.poll(() => fixture.rewind.mock.calls.length).toBe(1);
      expect(useComposerDraftStore.getState().rewindingThreadKeys.has("fork")).toBe(true);
      expect(fire).toBeTypeOf("function");
      await screen.rerender(surface("zh-CN", { attachmentCase: "raw" }));
      fire!();
    }
    await expect
      .poll(() => useComposerDraftStore.getState().rewindingThreadKeys.has("fork"))
      .toBe(false);
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, { attachmentCase: "raw" }));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(kind === "owned" && locale === "zh-CN" ? "等待会话回退超时。" : source);
    }
    if (kind === "owned") expect(clear).toHaveBeenCalledWith(timeoutId);
    expect(fixture.rewind).toHaveBeenCalledTimes(kind === "owned" ? 1 : 0);
    expect(fixture.connection).toHaveBeenCalledExactlyOnceWith(ref.environmentId);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(before);
  },
);

it.each(["owned", "raw", "empty"] as const)(
  "keeps rewind unknown attachment %s notice current",
  async (kind) => {
    setup();
    const source = "This message has an attachment that cannot be restored.";
    const original = useComposerDraftStore.getState();
    using _restore = { [Symbol.dispose]: () => useComposerDraftStore.setState(original, true) };
    const before = original.getComposerDraft(ref);
    fixture.connection.mockReturnValue({ httpBaseUrl: "https://example.invalid" });
    if (kind !== "owned")
      fixture.prepare.mockRejectedValueOnce(new Error(kind === "raw" ? source : ""));
    await using screen = await render(
      surface("en", { attachmentCase: "raw", unknownAttachment: true }),
    );
    using fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected fetch"));
    await screen.getByRole("button", { name: "Confirm revert", exact: true }).click();
    await expect.poll(() => fixture.prepare.mock.calls.length).toBe(1);
    await expect
      .poll(() => useComposerDraftStore.getState().rewindingThreadKeys.has("fork"))
      .toBe(false);
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, { attachmentCase: "raw", unknownAttachment: true }));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            kind === "owned" && locale === "zh-CN" ? "此消息包含无法恢复的附件。" : source,
          );
    }
    expect(fixture.connection).toHaveBeenCalledExactlyOnceWith(ref.environmentId);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.query).not.toHaveBeenCalled();
    // Background discovery retries are unrelated; no other fetch is allowed.
    for (const [request, init] of fetch.mock.calls) {
      const url = request instanceof Request ? request.url : String(request);
      expect(url).toBe(new URL("/.well-known/t3/environment", window.location.origin).href);
      expect(init?.method ?? (request instanceof Request ? request.method : "GET")).toBe("GET");
    }
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(before);
  },
);

it.each(["owned", "raw", "empty"] as const)(
  "keeps rewind invalid URL %s notice current",
  async (kind) => {
    setup();
    const source = "The environment returned an invalid attachment URL.";
    const original = useComposerDraftStore.getState();
    using _restore = { [Symbol.dispose]: () => useComposerDraftStore.setState(original, true) };
    const before = original.getComposerDraft(ref);
    fixture.connection.mockReturnValue({ httpBaseUrl: "https://example.invalid" });
    fixture.query.mockResolvedValue(
      kind === "owned"
        ? AsyncResult.success({ relativeUrl: "http://[", expiresAt: 1 })
        : AsyncResult.failure(Cause.fail(new Error(kind === "raw" ? source : ""))),
    );
    await using screen = await render(
      surface("en", { attachmentCase: "raw", fileAttachment: true }),
    );
    using fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected fetch"));
    await screen.getByRole("button", { name: "Confirm revert", exact: true }).click();
    await expect.poll(() => fixture.query.mock.calls.length).toBe(1);
    await expect
      .poll(() => useComposerDraftStore.getState().rewindingThreadKeys.has("fork"))
      .toBe(false);
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, { attachmentCase: "raw", fileAttachment: true }));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            kind === "owned" && locale === "zh-CN" ? "环境返回了无效的附件 URL。" : source,
          );
    }
    expect(fixture.connection).toHaveBeenCalledExactlyOnceWith(ref.environmentId);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.query).toHaveBeenCalledExactlyOnceWith({
      environmentId: ref.environmentId,
      input: {
        resource: {
          _tag: "attachment",
          attachmentId: "opaque-file",
          fileName: "literal-file-$&-{file}.txt",
          mimeType: "text/plain",
        },
      },
    });
    for (const [request, init] of fetch.mock.calls) {
      const url = request instanceof Request ? request.url : String(request);
      expect(url).toBe(new URL("/.well-known/t3/environment", window.location.origin).href);
      expect(init?.method ?? (request instanceof Request ? request.method : "GET")).toBe("GET");
    }
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(before);
  },
);

it.each(["owned", "raw", "empty"] as const)(
  "keeps rewind HTTP restore %s notice current",
  async (kind) => {
    setup();
    const name = "{name}/$&:\n.txt";
    const source = `Could not restore attachment: ${name}`;
    const original = useComposerDraftStore.getState();
    using _restore = { [Symbol.dispose]: () => useComposerDraftStore.setState(original, true) };
    const before = original.getComposerDraft(ref);
    fixture.connection.mockReturnValue({ httpBaseUrl: "https://example.invalid" });
    fixture.query.mockResolvedValue(
      AsyncResult.success({ relativeUrl: "/api/assets/opaque", expiresAt: 1 }),
    );
    const props = { attachmentCase: "raw" as const, fileAttachment: true, fileName: name };
    await using screen = await render(surface("en", props));
    let resolve: (value: Response) => void = () => undefined;
    let reject: (reason: Error) => void = () => undefined;
    const response = new Promise<Response>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    using fetch = vi.spyOn(globalThis, "fetch").mockImplementation((request) => {
      const url = request instanceof Request ? request.url : String(request);
      return url === "https://example.invalid/api/assets/opaque"
        ? response
        : Promise.reject(new Error("Unexpected fetch"));
    });
    using _settleResponse = {
      [Symbol.dispose]: () => resolve(new Response("cleanup", { status: 404 })),
    };
    await screen.getByRole("button", { name: "Confirm revert", exact: true }).click();
    await expect
      .poll(
        () =>
          fetch.mock.calls.filter(
            ([request]) => String(request) === "https://example.invalid/api/assets/opaque",
          ).length,
      )
      .toBe(1);
    expect(useComposerDraftStore.getState().rewindingThreadKeys.has("fork")).toBe(true);
    await screen.rerender(surface("zh-CN", props));
    if (kind === "owned") resolve(new Response("opaque body", { status: 404 }));
    else reject(new Error(kind === "raw" ? source : ""));
    await expect
      .poll(() => useComposerDraftStore.getState().rewindingThreadKeys.has("fork"))
      .toBe(false);
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, props));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(kind === "owned" && locale === "zh-CN" ? `无法恢复附件：${name}` : source);
    }
    expect(fixture.query).toHaveBeenCalledExactlyOnceWith({
      environmentId: ref.environmentId,
      input: {
        resource: {
          _tag: "attachment",
          attachmentId: "opaque-file",
          fileName: name,
          mimeType: "text/plain",
        },
      },
    });
    let attachmentFetches = 0;
    for (const [request, init] of fetch.mock.calls) {
      const url = request instanceof Request ? request.url : String(request);
      if (url === "https://example.invalid/api/assets/opaque") {
        attachmentFetches++;
        expect(init?.signal).toBeInstanceOf(AbortSignal);
      } else expect(url).toBe(new URL("/.well-known/t3/environment", window.location.origin).href);
      expect(init?.method ?? (request instanceof Request ? request.method : "GET")).toBe("GET");
    }
    expect(attachmentFetches).toBe(1);
    expect(fixture.connection).toHaveBeenCalledExactlyOnceWith(ref.environmentId);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.rewind).not.toHaveBeenCalled();
    expect(fixture.fork).not.toHaveBeenCalled();
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(before);
  },
);

it("keeps owned reconnect label current without another rewind", async () => {
  setup();
  fixture.localApi = true;
  const label = "literal $& {environment}\nremote";
  await using screen = await render(surface("en", { unavailable: true, reconnectLabel: label }));
  await screen.getByRole("button", { name: "Revert", exact: true }).click();
  await expect
    .poll(() => screen.container.textContent)
    .toContain(`Reconnect ${label} before reverting checkpoints.`);
  for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
    await screen.rerender(
      surface(locale, { unavailable: true, reconnectLabel: "new environment label" }),
    );
    await expect
      .poll(() => screen.container.textContent)
      .toContain(
        locale === "en"
          ? `Reconnect ${label} before reverting checkpoints.`
          : `请重新连接 ${label} 后再还原检查点。`,
      );
  }
  expect(fixture.confirm).not.toHaveBeenCalled();
  expect(fixture.query).not.toHaveBeenCalled();
  expect(fixture.rewind).not.toHaveBeenCalled();
  expect(fixture.fork).not.toHaveBeenCalled();
});

it("keeps transport-like reconnect labels suppressed", async () => {
  setup();
  fixture.localApi = true;
  await using screen = await render(
    surface("en", { unavailable: true, reconnectLabel: "literal SocketCloseError label" }),
  );
  await screen.getByRole("button", { name: "Revert", exact: true }).click();
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(
      surface(locale, { unavailable: true, reconnectLabel: "literal SocketCloseError label" }),
    );
    expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
  }
  expect(fixture.confirm).not.toHaveBeenCalled();
  expect(fixture.query).not.toHaveBeenCalled();
  expect(fixture.rewind).not.toHaveBeenCalled();
});

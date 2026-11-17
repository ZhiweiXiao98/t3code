import { useRef, useState } from "react";
import {
  EnvironmentId,
  ThreadId,
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
  RuntimeRequestId,
  ChatAttachmentId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import type { ChatMessage } from "../../types";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { makeThreadFixture } from "../../test-fixtures";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { environmentPresentations } from "../../state/presentation";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { makeThreadErrorSetter, type LocalThreadErrorEntry } from "../ChatView.logic";
import type { ChatComposerHandle } from "./ChatComposer";
import { ChatBannerLane } from "./ChatBannerLane";
import { draftSendState } from "./chatViewSend";
import { useComposerSend } from "./useComposerSend";
const fixture = await vi.hoisted(async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    locale: "en" as "en" | "zh-CN",
    transition: vi.fn(),
    capture: vi.fn(),
    dock: vi.fn(),
    configs: Atom.make(
      new Map<
        string,
        { environment: { capabilities: { fileAttachments: { maxUploadBytes: number } } } }
      >(),
    ).pipe(Atom.keepAlive),
    allowed: true,
    start: vi.fn(),
    multiple: vi.fn(),
    prepare: vi.fn(),
    navigate: vi.fn(),
    newThread: vi.fn(),
    reset: vi.fn(),
    cursor: vi.fn(),
    track: vi.fn(),
    release: vi.fn(),
    dispatch: vi.fn(),
    context: vi.fn(),
    pendingChange: vi.fn(),
    persist: vi.fn(),
    advance: vi.fn(),
    feedback: vi.fn(),
    decline: vi.fn(),
    respond: vi.fn(),
    upload: vi.fn(),
    waitUploads: vi.fn(),
    refreshUploads: vi.fn(),
    lookup: vi.fn(),
    lookupDefault: undefined as
      | typeof import("../../lib/attachmentUploadQueue").getUploadedAttachments
      | undefined,
  };
});
vi.mock("@t3tools/client-runtime/state/thread-requests", async (original) => ({
  ...(await original<typeof import("@t3tools/client-runtime/state/thread-requests")>()),
  sendApprovalFeedback: fixture.feedback,
  declinePendingApprovals: fixture.decline,
}));
vi.mock("../../state/server", async (original) => ({
  ...(await original<typeof import("../../state/server")>()),
  environmentServerConfigsAtom: fixture.configs,
}));
vi.mock("./draftHeroTransition", async (original) => ({
  ...(await original<typeof import("./draftHeroTransition")>()),
  runMobileComposerTransition: fixture.transition,
}));
vi.mock("../../i18n/readWebI18n", async () => {
  const { translateWebMessage } = await import("../../i18n/messages");
  return {
    readWebI18n: () => ({
      locale: fixture.locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(fixture.locale, key, values),
    }),
  };
});
vi.mock("../../lib/attachmentUploadQueue", async (original) => {
  const actual = await original<typeof import("../../lib/attachmentUploadQueue")>();
  fixture.lookupDefault = actual.getUploadedAttachments;
  fixture.lookup.mockImplementation(actual.getUploadedAttachments);
  return {
    ...actual,
    startAttachmentUpload: fixture.upload,
    retryAttachmentUpload: fixture.upload,
    awaitAttachmentUploads: fixture.waitUploads,
    refreshExpiredAttachmentUploads: fixture.refreshUploads,
    getUploadedAttachments: fixture.lookup,
  };
});
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  readEnvironmentScope: () => fixture.allowed,
}));
vi.mock("../../state/peerLinks", async (original) => ({
  ...(await original<typeof import("../../state/peerLinks")>()),
  useLinkedEnvironments: () => new Map(),
}));
vi.mock("../../hooks/useSettings", async (original) => ({
  ...(await original<typeof import("../../hooks/useSettings")>()),
  useClientSettingsHydrated: () => true,
}));
vi.mock("../../hooks/useHandleNewThread", async (original) => ({
  ...(await original<typeof import("../../hooks/useHandleNewThread")>()),
  useNewThreadHandler: () => fixture.newThread,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => fixture.navigate,
}));
vi.mock("../../state/use-orchestration-command", async (original) => ({
  ...(await original<typeof import("../../state/use-orchestration-command")>()),
  useOrchestrationCommand: () => fixture.start,
}));
vi.mock("./useMultipleModelSend", async (original) => ({
  ...(await original<typeof import("./useMultipleModelSend")>()),
  useMultipleModelSend: () => fixture.multiple,
}));
vi.mock("./chatViewSend", async (original) => ({
  ...(await original<typeof import("./chatViewSend")>()),
  prepareTurnAttachments: fixture.prepare,
}));
vi.mock("../../state/presentation", async (original) => {
  const actual = await original<typeof import("../../state/presentation")>();
  const { Atom } = await import("effect/reactivity");
  return {
    ...actual,
    environmentPresentations: {
      ...actual.environmentPresentations,
      presentationsAtom: Atom.make(
        new Map([
          [
            "guard-env",
            {
              serverConfig: { environment: { capabilities: { requiredWorktreeBootstrap: false } } },
            },
          ],
        ]),
      ).pipe(Atom.keepAlive),
    },
  };
});
vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));
const ref = {
  environmentId: EnvironmentId.make("guard-env"),
  threadId: ThreadId.make("guard-thread"),
};
const selection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5",
};
const thread = makeThreadFixture({
  id: ref.threadId,
  environmentId: ref.environmentId,
  worktreePath: null,
});
const project = {
  id: ProjectId.make("guard-project"),
  environmentId: ref.environmentId,
  title: "project",
  workspaceRoot: "/literal/workspace",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
type Guard = "server" | "branch" | "feedback" | "permission" | "uploads" | "send-failure";
const approval = {
  requestId: RuntimeRequestId.make("feedback-request"),
  requestKind: "command" as const,
  createdAt: "2026-11-15T00:00:00Z",
  responseCapability: "live" as const,
  supportsFeedback: true,
};
const terminalContext = {
  id: "literal-context",
  threadId: ref.threadId,
  terminalId: "literal-terminal",
  terminalLabel: "$& {terminal}",
  lineStart: 1,
  lineEnd: 1,
  text: "literal terminal output",
  createdAt: "2026-11-15T00:00:00Z",
};

const prompt = "literal $& {prompt}";
function Probe({
  guard,
  routeKey,
  draftId,
  blocked,
}: {
  guard: Guard;
  routeKey: string;
  draftId: DraftId;
  blocked: boolean;
}) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismiss] = useState(0);
  const [done, setDone] = useState(false);
  const [optimistic, setOptimistic] = useState<ChatMessage[]>([]);
  const isServerScenario = guard === "feedback" || guard === "uploads" || guard === "send-failure";
  const [pending, setPending] = useState(false);
  const [docked, setDocked] = useState<string | null>(null);
  const target = isServerScenario ? ref : draftId;
  const errorKey = isServerScenario ? routeKey : draftId;
  const currentRouteThreadKeyRef = useRef<string | null>(routeKey);
  const promptRef = useRef(prompt);
  const composerImagesRef = useRef([]);
  const composerFiles = useComposerDraftStore((state) => state.getComposerDraft(target)?.files);
  const composerFilesRef = useRef(composerFiles ?? []);
  const composerTerminalContextsRef = useRef(guard === "feedback" ? [terminalContext] : []);
  const feedbackUploadsInFlightRef = useRef(new Set<string>());
  const composerRef = useRef<ChatComposerHandle>({
    focusAtEnd: () => undefined,
    focusAt: () => undefined,
    addDroppedFiles: () => undefined,
    addDroppedFolders: () => undefined,
    hasPendingAttachments: () => false,
    insertTextAtEnd: () => false,
    pasteTextAtEnd: () => false,
    citeAssistantText: () => false,
    replyToResponse: () => false,
    openModelPicker: () => undefined,
    stepReasoningEffort: () => undefined,
    toggleModelPicker: () => undefined,
    openControl: () => undefined,
    isModelPickerOpen: () => false,
    isCaretAtStart: () => true,
    compactContext: () => undefined,
    readSnapshot: () => ({ value: prompt, cursor: 0, expandedCursor: 0, contextIds: [] }),
    resetCursorState: fixture.cursor,
    addTerminalContext: () => undefined,
    validateProviderInput: () => true,
    setMultipleModelSelections: () => undefined,
    getSendContext: () => {
      fixture.context();
      return {
        answeringPendingUserInput: false,
        prompt,
        images: [],
        files: composerFilesRef.current,
        terminalContexts: guard === "feedback" ? [terminalContext] : [],
        previewAnnotations: [],
        reviewComments: [],
        threadContexts: [],
        environmentContexts: [],
        selectedPromptEffort: null,
        selectedModelSelection: selection,
        multipleModelSelections: guard === "server" ? [selection] : null,
        providerAvailable: true,
        selectedProvider: ProviderDriverKind.make("codex"),
        selectedModel: "gpt-5",
        selectedProviderModels: [],
        shownPendingApprovalIds:
          guard === "feedback" || guard === "uploads" ? [approval.requestId] : [],
      };
    },
  });
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: routeKey,
    draftId: isServerScenario ? null : draftId,
    serverThreadRef: isServerScenario ? ref : null,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const send = useComposerSend({
    environmentId: ref.environmentId,
    routeThreadKey: routeKey,
    currentRouteThreadKeyRef,
    draftId: isServerScenario ? null : draftId,
    draftThread: null,
    activeThread: thread,
    activeThreadKey: routeKey,
    activeThreadBranch: guard === "branch" ? null : "main",
    activeProject: project,
    activeProjectIsScratch: false,
    activeProjectDefaultModelSelection: selection,
    activeMessageCount: isServerScenario ? 1 : 0,
    isServerThread: isServerScenario,
    isLocalDraftThread: !isServerScenario,
    isGitRepo: true,
    phase: "ready",
    runtimeMode: "full-access",
    sendEnvMode: "worktree",
    startFromOrigin: false,
    localCheckoutBranchMismatch: null,
    logicalProjectEnvironments: [],
    providerInstanceEntries: [],
    composerRef,
    composerDraftTarget: target,
    promptRef,
    composerImagesRef,
    composerFilesRef,
    composerTerminalContextsRef,
    feedbackUploadsInFlightRef,
    queuedRunEdit: {
      editingRunId: null,
      isEditing: false,
      isSaving: false,
      draftTarget: target,
      editingAttachments: [],
      beginEdit: () => undefined,
      cancelEdit: async () => undefined,
      removeEditingAttachment: () => undefined,
      saveEdit: async () => undefined,
    },
    isRevertingCheckpoint: false,
    threadDetailLoading: blocked,
    activeEnvironmentUnavailable: false,
    isSendBusy: false,
    sendQueuesBehindSetup: false,
    isDraftHeroState: guard === "permission",
    panelAnimationsActive: guard === "permission",
    panelAnimationDurationMs: 0,
    keepFullHistory: false,
    freshSessionAvailable: false,
    resumeCompactionTokens: null,
    usageLimitsKey: null,
    usageLimitsOffered: false,
    openUsageLimits: () => false,
    clearUsageLimitsFor: () => undefined,
    needsLoadBalancing: false,
    loadBalancing: {
      pending: false,
      failed: false,
      environmentId: null,
      refresh: () => undefined,
      refreshSelection: async () => null,
    },
    readPendingEnvironmentChange: fixture.pendingChange,
    refreshBeforeSend: () => null,
    pendingApprovals:
      guard === "uploads"
        ? [{ ...approval, supportsFeedback: false }]
        : guard === "feedback"
          ? [approval]
          : [],
    respondingRequestIds: [],
    activePendingUserInput: null,
    onAdvanceActivePendingUserInput: fixture.advance,
    onRespondToApproval: fixture.respond,
    beginLocalDispatch: fixture.dispatch,
    resetLocalDispatch: fixture.reset,
    beginWorktreeSetup: () => undefined,
    captureDraftHeroComposerRect: fixture.capture,
    setDockedDraftHeroThreadKey: (value) => {
      fixture.dock(value);
      setDocked(value);
    },
    setSetupQueueSendThreadKey: () => undefined,
    setOptimisticUserMessages: setOptimistic,
    optimisticBlobPreviews: { track: fixture.track, release: fixture.release },
    setFeedbackSubmissionsByThreadKey: () => undefined,
    setThreadError: setError,
    setKeepFullHistory: () => undefined,
    anchorNewTurn: () => undefined,
    acknowledgeActiveThreadWoke: () => undefined,
    sideChatDisabledReason: null,
    handleNewThreadInActiveProject: fixture.newThread,
    persistThreadSettingsForNextTurn: fixture.persist,
    linkCheckoutPullRequest: () => undefined,
  });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await send.onSend();
          setDone(true);
          setPending(false);
        }}
      >
        Send
      </button>
      <output>{done ? "settled" : "idle"}</output>
      <output data-testid="optimistic">{optimistic.length}</output>
      <output data-testid="dock">{docked ?? "undocked"}</output>
      <ChatBannerLane
        environmentId={ref.environmentId}
        providerStatus={null}
        providerStatusDismissalKey={null}
        onOpenProviderSetup={() => undefined}
        threadId={ref.threadId}
        threadError={entries[errorKey]?.message ?? null}
        localThreadErrorEntry={entries[errorKey]}
        threadErrorClass={null}
        threadErrorCode={null}
        threadErrorBannerKey={null}
        setThreadError={setError}
        setThreadErrorBannerDismissTick={setDismiss}
      />
    </>
  );
}
function surface(locale: "en" | "zh-CN", props: Parameters<typeof Probe>[0]) {
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
for (const guard of ["server", "branch", "feedback"] as const)
  it.each(["owned", "denied", "loading"] as const)(
    `keeps early send ${guard} %s notice current`,
    async (kind) => {
      for (const mock of [
        fixture.start,
        fixture.multiple,
        fixture.prepare,
        fixture.navigate,
        fixture.newThread,
        fixture.reset,
        fixture.cursor,
        fixture.track,
        fixture.release,
        fixture.dispatch,
        fixture.context,
        fixture.pendingChange,
        fixture.persist,
        fixture.advance,
        fixture.feedback,
        fixture.decline,
        fixture.respond,
        fixture.upload,
      ])
        mock.mockReset();
      fixture.allowed = true;
      fixture.pendingChange.mockReturnValue(null);
      const routeKey = `guard-${guard}-${kind}`;
      const draftId = DraftId.make(routeKey);
      const original = useComposerDraftStore.getState();
      const state = draftSendState(routeKey);
      const lock = state.sendInFlight.current;
      using _restore = {
        [Symbol.dispose]: () => {
          useComposerDraftStore.setState(original, true);
          state.sendInFlight.current = lock;
        },
      };
      state.sendInFlight.current = false;
      const target = guard === "feedback" ? ref : draftId;
      useComposerDraftStore.getState().setPrompt(target, prompt);
      if (guard === "feedback")
        useComposerDraftStore.getState().setTerminalContexts(target, [terminalContext]);
      const draft = useComposerDraftStore.getState().getComposerDraft(target);
      if (guard === "feedback") expect(draft?.terminalContexts).toEqual([terminalContext]);
      const props = { guard, routeKey, draftId, blocked: kind === "loading" };
      await using screen = await render(surface("en", props));
      fixture.allowed = kind !== "denied";
      expect(
        appAtomRegistry.get(environmentPresentations.presentationsAtom).get(ref.environmentId)
          ?.serverConfig?.environment.capabilities.requiredWorktreeBootstrap,
      ).toBe(false);
      await screen.getByRole("button", { name: "Send", exact: true }).click();
      await expect.poll(() => screen.container.textContent).toContain("settled");
      const source =
        guard === "feedback"
          ? "Send approval feedback without attachments or added context."
          : guard === "server"
            ? "Update this server before starting multiple models."
            : "Select a base branch before sending in New worktree mode.";
      const chinese =
        guard === "feedback"
          ? "发送审批反馈时，请勿附带附件或额外上下文。"
          : guard === "server"
            ? "启动多个模型前，请更新此服务器。"
            : "请先选择基础分支，再以新工作树模式发送。";
      if (kind === "owned") await expect.poll(() => screen.container.textContent).toContain(source);
      for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
        await screen.rerender(surface(locale, props));
        expect(
          appAtomRegistry.get(environmentPresentations.presentationsAtom).get(ref.environmentId)
            ?.serverConfig?.environment.capabilities.requiredWorktreeBootstrap,
        ).toBe(false);
        if (kind === "owned")
          await expect
            .poll(() => screen.container.textContent)
            .toContain(locale === "en" ? source : chinese);
        else expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      }
      expect(fixture.context).toHaveBeenCalledTimes(
        kind === "owned" && guard === "feedback" ? 2 : 1,
      );
      expect(useComposerDraftStore.getState().getComposerDraft(target)).toBe(draft);
      expect(state.sendInFlight.current).toBe(false);
      for (const mock of [
        fixture.start,
        fixture.multiple,
        fixture.prepare,
        fixture.navigate,
        fixture.newThread,
        fixture.reset,
        fixture.cursor,
        fixture.track,
        fixture.release,
        fixture.dispatch,
        fixture.persist,
        fixture.advance,
        fixture.feedback,
        fixture.decline,
        fixture.respond,
        fixture.upload,
      ])
        expect(mock).not.toHaveBeenCalled();
    },
  );

it.each(["permission", "file-priority"] as const)(
  "keeps docked send %s notice current",
  async (kind) => {
    for (const mock of [
      fixture.start,
      fixture.multiple,
      fixture.prepare,
      fixture.navigate,
      fixture.newThread,
      fixture.reset,
      fixture.cursor,
      fixture.track,
      fixture.release,
      fixture.dispatch,
      fixture.context,
      fixture.pendingChange,
      fixture.persist,
      fixture.advance,
      fixture.feedback,
      fixture.decline,
      fixture.respond,
      fixture.upload,
      fixture.transition,
      fixture.capture,
      fixture.dock,
    ])
      mock.mockReset();
    fixture.allowed = true;
    fixture.pendingChange.mockReturnValue(null);
    const routeKey = `docked-${kind}`;
    const draftId = DraftId.make(routeKey);
    const original = useComposerDraftStore.getState();
    const state = draftSendState(routeKey);
    const lock = state.sendInFlight.current;
    const configs = appAtomRegistry.get(fixture.configs);
    using _restore = {
      [Symbol.dispose]: () => {
        useComposerDraftStore.setState(original, true);
        state.sendInFlight.current = lock;
        appAtomRegistry.set(fixture.configs, configs);
        fixture.allowed = true;
      },
    };
    state.sendInFlight.current = false;
    useComposerDraftStore.getState().setPrompt(draftId, prompt);
    appAtomRegistry.set(
      fixture.configs,
      new Map([
        [
          ref.environmentId,
          { environment: { capabilities: { fileAttachments: { maxUploadBytes: 1024 } } } },
        ],
      ]),
    );
    if (kind === "file-priority")
      expect(
        useComposerDraftStore.getState().addFiles(draftId, [
          {
            type: "file",
            id: ChatAttachmentId.make("permission-file"),
            name: "$& {file}.txt",
            mimeType: "text/plain",
            sizeBytes: 1,
            file: new File(["x"], "$& {file}.txt", { type: "text/plain" }),
          },
        ]),
      ).toHaveLength(1);
    const draft = useComposerDraftStore.getState().getComposerDraft(draftId);
    let update: (() => void | Promise<void>) | undefined;
    let finish!: () => void;
    const transition = new Promise<void>((resolve) => {
      finish = resolve;
    });
    fixture.transition.mockImplementation((callback: () => void | Promise<void>) => {
      update = callback;
      return transition;
    });
    const props = { guard: "permission" as const, routeKey, draftId, blocked: false };
    await using screen = await render(surface("en", props));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        fixture.allowed = false;
        await act(async () => {
          const callback = update;
          update = undefined;
          await callback?.();
          finish();
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.transition.mock.calls.length).toBe(1);
    await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    expect(state.sendInFlight.current).toBe(true);
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.dock).not.toHaveBeenCalled();
    expect(fixture.upload).toHaveBeenCalledTimes(kind === "file-priority" ? 1 : 0);
    await screen.rerender(surface("zh-CN", props));
    fixture.allowed = false;
    if (kind === "file-priority") appAtomRegistry.set(fixture.configs, new Map());
    await act(async () => {
      const callback = update;
      update = undefined;
      if (!callback) throw new Error("Missing real dock callback");
      await callback();
      finish();
    });
    await expect.poll(() => screen.container.textContent).toContain("settled");
    await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    const rawFileReason = "正在等待服务器，暂时无法发送文件附件";
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, props));
      await expect
        .poll(() => screen.container.textContent)
        .toContain(
          kind === "file-priority"
            ? rawFileReason
            : locale === "en"
              ? "This connection cannot change threads."
              : "此连接无权修改会话。",
        );
    }
    expect(fixture.capture).toHaveBeenCalledTimes(1);
    expect(fixture.dock).toHaveBeenCalledTimes(2);
    expect(fixture.dock.mock.calls[0]?.[0]).toBe(routeKey);
    expect(screen.container.querySelector('[data-testid="dock"]')?.textContent).toBe("undocked");
    expect(state.sendInFlight.current).toBe(false);
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)).toBe(draft);
    expect(fixture.transition).toHaveBeenCalledTimes(1);
    expect(fixture.upload).toHaveBeenCalledTimes(kind === "file-priority" ? 1 : 0);
    for (const mock of [
      fixture.start,
      fixture.multiple,
      fixture.prepare,
      fixture.navigate,
      fixture.newThread,
      fixture.reset,
      fixture.cursor,
      fixture.track,
      fixture.release,
      fixture.dispatch,
      fixture.persist,
      fixture.advance,
      fixture.feedback,
      fixture.decline,
      fixture.respond,
    ])
      expect(mock).not.toHaveBeenCalled();
  },
);

it.each(["owned", "capability-priority"] as const)(
  "keeps pending send uploads %s notice current",
  async (kind) => {
    for (const mock of [
      fixture.start,
      fixture.multiple,
      fixture.prepare,
      fixture.navigate,
      fixture.newThread,
      fixture.reset,
      fixture.cursor,
      fixture.track,
      fixture.release,
      fixture.dispatch,
      fixture.context,
      fixture.pendingChange,
      fixture.persist,
      fixture.advance,
      fixture.feedback,
      fixture.decline,
      fixture.respond,
      fixture.upload,
      fixture.refreshUploads,
      fixture.transition,
      fixture.capture,
      fixture.dock,
    ])
      mock.mockReset();
    if (!fixture.lookupDefault) throw new Error("Missing actual attachment lookup");
    fixture.lookup.mockReset().mockImplementation(fixture.lookupDefault);
    fixture.allowed = true;
    fixture.pendingChange.mockReturnValue(null);
    const routeKey = `pending-uploads-${kind}`;
    const draftId = DraftId.make(routeKey);
    const original = useComposerDraftStore.getState();
    const state = draftSendState(routeKey);
    const lock = state.sendInFlight.current;
    const configs = appAtomRegistry.get(fixture.configs);
    using _restore = {
      [Symbol.dispose]: () => {
        useComposerDraftStore.setState(original, true);
        state.sendInFlight.current = lock;
        appAtomRegistry.set(fixture.configs, configs);
      },
    };
    state.sendInFlight.current = false;
    useComposerDraftStore.getState().setPrompt(ref, prompt);
    appAtomRegistry.set(
      fixture.configs,
      new Map([
        [
          ref.environmentId,
          { environment: { capabilities: { fileAttachments: { maxUploadBytes: 1024 } } } },
        ],
      ]),
    );
    const file = {
      type: "file" as const,
      id: ChatAttachmentId.make(`send-upload-${kind}`),
      name: "$& {upload}.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
      file: new File(["x"], "$& {upload}.txt", { type: "text/plain" }),
    };
    expect(useComposerDraftStore.getState().addFiles(ref, [file])).toHaveLength(1);
    const draft = useComposerDraftStore.getState().getComposerDraft(ref);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    fixture.waitUploads.mockReset();
    fixture.refreshUploads.mockReturnValue(pending);
    const props = { guard: "uploads" as const, routeKey, draftId, blocked: false };
    await using screen = await render(surface("en", props));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        appAtomRegistry.set(fixture.configs, new Map());
        await act(async () => {
          finish();
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.refreshUploads.mock.calls.length).toBe(1);
    await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    expect(state.sendInFlight.current).toBe(true);
    expect(fixture.lookup).not.toHaveBeenCalled();
    expect(fixture.refreshUploads).toHaveBeenCalledExactlyOnceWith({
      environmentId: ref.environmentId,
      images: [file],
      draftTarget: ref,
    });
    expect(fixture.refreshUploads.mock.calls[0]?.[0].images[0]).toBe(file);
    expect(fixture.upload).toHaveBeenCalledExactlyOnceWith({
      environmentId: ref.environmentId,
      image: file,
      draftTarget: ref,
    });
    await screen.rerender(surface("zh-CN", props));
    if (kind === "capability-priority") appAtomRegistry.set(fixture.configs, new Map());
    await act(async () => {
      finish();
    });
    await expect.poll(() => screen.container.textContent).toContain("settled");
    await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, props));
      await expect
        .poll(() => screen.container.textContent)
        .toContain(
          kind === "capability-priority"
            ? "正在等待服务器，暂时无法发送文件附件"
            : locale === "en"
              ? "Retry or remove failed uploads before sending."
              : "请重试或移除上传失败的附件后再发送。",
        );
    }
    expect(fixture.lookup).toHaveBeenCalledTimes(kind === "owned" ? 1 : 0);
    if (kind === "owned") {
      expect(fixture.lookup).toHaveBeenCalledWith({
        environmentId: ref.environmentId,
        images: [file],
      });
      expect(fixture.lookup.mock.results[0]?.value).toBeNull();
    }
    expect(fixture.dock).toHaveBeenCalledTimes(1);
    expect(screen.container.querySelector('[data-testid="dock"]')?.textContent).toBe("undocked");
    expect(state.sendInFlight.current).toBe(false);
    expect(useComposerDraftStore.getState().getComposerDraft(ref)).toBe(draft);
    expect(fixture.refreshUploads).toHaveBeenCalledExactlyOnceWith({
      environmentId: ref.environmentId,
      images: [file],
      draftTarget: ref,
    });
    expect(fixture.waitUploads).not.toHaveBeenCalled();
    expect(fixture.upload).toHaveBeenCalledTimes(1);
    for (const mock of [
      fixture.start,
      fixture.multiple,
      fixture.prepare,
      fixture.navigate,
      fixture.newThread,
      fixture.reset,
      fixture.cursor,
      fixture.track,
      fixture.release,
      fixture.dispatch,
      fixture.persist,
      fixture.advance,
      fixture.feedback,
      fixture.decline,
      fixture.respond,
      fixture.transition,
      fixture.capture,
    ])
      expect(mock).not.toHaveBeenCalled();
  },
);

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "restores settled send %s failure with current notice",
  async (kind) => {
    for (const mock of [
      fixture.start,
      fixture.multiple,
      fixture.prepare,
      fixture.navigate,
      fixture.newThread,
      fixture.reset,
      fixture.cursor,
      fixture.track,
      fixture.release,
      fixture.dispatch,
      fixture.context,
      fixture.pendingChange,
      fixture.persist,
      fixture.advance,
      fixture.feedback,
      fixture.decline,
      fixture.respond,
      fixture.upload,
      fixture.waitUploads,
      fixture.transition,
      fixture.capture,
      fixture.dock,
    ])
      mock.mockReset();
    fixture.allowed = true;
    fixture.pendingChange.mockReturnValue(null);
    fixture.prepare.mockResolvedValue([]);
    const routeKey = `settled-failure-${kind}`;
    const draftId = DraftId.make(routeKey);
    const original = useComposerDraftStore.getState();
    const state = draftSendState(routeKey);
    const lock = state.sendInFlight.current;
    using _restore = {
      [Symbol.dispose]: () => {
        useComposerDraftStore.setState(original, true);
        state.sendInFlight.current = lock;
      },
    };
    state.sendInFlight.current = false;
    useComposerDraftStore.getState().setPrompt(ref, prompt);
    const before = useComposerDraftStore.getState().getComposerDraft(ref);
    let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    const pending = new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
      finish = resolve;
    });
    fixture.persist.mockReturnValue(pending);
    const props = { guard: "send-failure" as const, routeKey, draftId, blocked: false };
    await using screen = await render(surface("en", props));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => fixture.persist.mock.calls.length).toBe(1);
    await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    expect(state.sendInFlight.current).toBe(true);
    expect(useComposerDraftStore.getState().getComposerDraft(ref)?.prompt ?? "").toBe("");
    expect(screen.container.querySelector('[data-testid="optimistic"]')?.textContent).toBe("1");
    expect(fixture.track).toHaveBeenCalledTimes(1);
    expect(fixture.release).not.toHaveBeenCalled();
    expect(fixture.cursor).toHaveBeenCalledTimes(1);
    expect(fixture.reset).not.toHaveBeenCalled();
    expect(fixture.persist).toHaveBeenCalledWith({
      threadId: ref.threadId,
      createdAt: expect.any(String),
      runtimeMode: "full-access",
      interactionMode: "default",
    });
    await screen.rerender(surface("zh-CN", props));
    const source = "Failed to send message.";
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(kind === "owned" ? null : new Error(kind === "empty" ? "" : source)),
        ),
      );
    });
    await expect.poll(() => screen.container.textContent).toContain("settled");
    await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, props));
      if (kind === "empty" || kind === "interrupted")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(kind === "owned" && locale === "zh-CN" ? "发送消息失败。" : source);
    }
    const restored = useComposerDraftStore.getState().getComposerDraft(ref);
    expect(restored).not.toBe(before);
    expect(restored?.prompt).toBe(prompt);
    expect(restored?.files).toEqual([]);
    expect(restored?.images).toEqual([]);
    expect(screen.container.querySelector('[data-testid="optimistic"]')?.textContent).toBe("0");
    expect(fixture.release).toHaveBeenCalledExactlyOnceWith(fixture.track.mock.calls[0]?.[0]);
    expect(fixture.cursor).toHaveBeenCalledTimes(2);
    expect(fixture.cursor.mock.calls[1]?.[0]).toEqual({
      cursor: prompt.length,
      prompt,
      detectTrigger: true,
    });
    expect(fixture.reset).toHaveBeenCalledTimes(1);
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
    expect(fixture.prepare).toHaveBeenCalledTimes(1);
    expect(fixture.persist).toHaveBeenCalledTimes(1);
    expect(state.sendInFlight.current).toBe(false);
    expect(fixture.dock).toHaveBeenCalledTimes(1);
    expect(screen.container.querySelector('[data-testid="dock"]')?.textContent).toBe("undocked");
    for (const mock of [
      fixture.start,
      fixture.multiple,
      fixture.navigate,
      fixture.newThread,
      fixture.advance,
      fixture.feedback,
      fixture.decline,
      fixture.respond,
      fixture.upload,
      fixture.waitUploads,
      fixture.transition,
      fixture.capture,
    ])
      expect(mock).not.toHaveBeenCalled();
  },
);

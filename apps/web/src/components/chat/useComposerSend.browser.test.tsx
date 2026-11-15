import { useRef, useState } from "react";
import {
  EnvironmentId,
  ThreadId,
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
  RuntimeRequestId,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
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
const fixture = vi.hoisted(() => ({
  allowed: true,
  start: vi.fn(),
  multiple: vi.fn(),
  prepare: vi.fn(),
  navigate: vi.fn(),
  newThread: vi.fn(),
  reset: vi.fn(),
  dispatch: vi.fn(),
  context: vi.fn(),
  pendingChange: vi.fn(),
  persist: vi.fn(),
  advance: vi.fn(),
  feedback: vi.fn(),
  decline: vi.fn(),
  respond: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@t3tools/client-runtime/state/thread-requests", async (original) => ({
  ...(await original<typeof import("@t3tools/client-runtime/state/thread-requests")>()),
  sendApprovalFeedback: fixture.feedback,
  declinePendingApprovals: fixture.decline,
}));
vi.mock("../../state/server", async (original) => {
  const actual = await original<typeof import("../../state/server")>();
  const { Atom } = await import("effect/reactivity");
  return { ...actual, environmentServerConfigsAtom: Atom.make(new Map()).pipe(Atom.keepAlive) };
});
vi.mock("../../lib/attachmentUploadQueue", async (original) => ({
  ...(await original<typeof import("../../lib/attachmentUploadQueue")>()),
  startAttachmentUpload: fixture.upload,
  retryAttachmentUpload: fixture.upload,
}));
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
type Guard = "server" | "branch" | "feedback";
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
  const target = guard === "feedback" ? ref : draftId;
  const errorKey = guard === "feedback" ? routeKey : draftId;
  const currentRouteThreadKeyRef = useRef<string | null>(routeKey);
  const promptRef = useRef(prompt);
  const composerImagesRef = useRef([]);
  const composerFilesRef = useRef([]);
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
    openModelPicker: () => undefined,
    stepReasoningEffort: () => undefined,
    toggleModelPicker: () => undefined,
    openControl: () => undefined,
    isModelPickerOpen: () => false,
    isCaretAtStart: () => true,
    compactContext: () => undefined,
    readSnapshot: () => ({ value: prompt, cursor: 0, expandedCursor: 0, contextIds: [] }),
    resetCursorState: fixture.reset,
    addTerminalContext: () => undefined,
    validateProviderInput: () => true,
    setMultipleModelSelections: () => undefined,
    getSendContext: () => {
      fixture.context();
      return {
        answeringPendingUserInput: false,
        prompt,
        images: [],
        files: [],
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
        shownPendingApprovalIds: guard === "feedback" ? [approval.requestId] : [],
      };
    },
  });
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: routeKey,
    draftId: guard === "feedback" ? null : draftId,
    serverThreadRef: guard === "feedback" ? ref : null,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const send = useComposerSend({
    environmentId: ref.environmentId,
    routeThreadKey: routeKey,
    currentRouteThreadKeyRef,
    draftId: guard === "feedback" ? null : draftId,
    draftThread: null,
    activeThread: thread,
    activeThreadKey: routeKey,
    activeThreadBranch: guard === "branch" ? null : "main",
    activeProject: project,
    activeProjectDefaultModelSelection: selection,
    activeMessageCount: guard === "feedback" ? 1 : 0,
    isServerThread: guard === "feedback",
    isLocalDraftThread: guard !== "feedback",
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
    isDraftHeroState: false,
    panelAnimationsActive: false,
    panelAnimationDurationMs: 0,
    keepFullHistory: false,
    freshSessionAvailable: false,
    resumeCompactionTokens: null,
    usageLimitsKey: null,
    usageLimitsOffered: false,
    openUsageLimits: () => false,
    clearUsageLimitsFor: () => undefined,
    needsLoadBalancing: false,
    loadBalancing: { pending: false, failed: false, environmentId: null, refresh: () => undefined },
    readPendingEnvironmentChange: fixture.pendingChange,
    pendingApprovals: guard === "feedback" ? [approval] : [],
    respondingRequestIds: [],
    activePendingProgress: null,
    onAdvanceActivePendingUserInput: fixture.advance,
    onRespondToApproval: fixture.respond,
    beginLocalDispatch: fixture.dispatch,
    resetLocalDispatch: fixture.reset,
    beginWorktreeSetup: () => undefined,
    captureDraftHeroComposerRect: () => undefined,
    setDockedDraftHeroThreadKey: () => undefined,
    setSetupQueueSendThreadKey: () => undefined,
    setOptimisticUserMessages: () => undefined,
    optimisticBlobPreviews: { track: () => undefined, release: () => undefined },
    setFeedbackSubmissionsByThreadKey: () => undefined,
    setThreadError: setError,
    setKeepFullHistory: () => undefined,
    anchorNewTurn: () => undefined,
    acknowledgeActiveThreadWoke: () => undefined,
    sideChatDisabledReason: null,
    handleNewThreadInActiveProject: fixture.newThread,
    persistThreadSettingsForNextTurn: fixture.persist,
  });
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          await send.onSend();
          setDone(true);
        }}
      >
        Send
      </button>
      <output>{done ? "settled" : "idle"}</output>
      <ChatBannerLane
        environmentId={ref.environmentId}
        providerStatus={null}
        providerStatusBannerKey={null}
        setDismissedProviderStatusBannerKey={() => undefined}
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
        kind === "owned" ? (guard === "feedback" ? 2 : 1) : 0,
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

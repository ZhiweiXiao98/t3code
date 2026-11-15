import { useRef, useState } from "react";
import {
  EnvironmentId,
  ThreadId,
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
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
type Guard = "server" | "branch";
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
  const currentRouteThreadKeyRef = useRef<string | null>(routeKey);
  const promptRef = useRef(prompt);
  const composerImagesRef = useRef([]);
  const composerFilesRef = useRef([]);
  const composerTerminalContextsRef = useRef([]);
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
        terminalContexts: [],
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
        shownPendingApprovalIds: [],
      };
    },
  });
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: routeKey,
    draftId,
    serverThreadRef: null,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const send = useComposerSend({
    environmentId: ref.environmentId,
    routeThreadKey: routeKey,
    currentRouteThreadKeyRef,
    draftId,
    draftThread: null,
    activeThread: thread,
    activeThreadKey: routeKey,
    activeThreadBranch: guard === "server" ? "main" : null,
    activeProject: project,
    activeProjectDefaultModelSelection: selection,
    activeMessageCount: 0,
    isServerThread: false,
    isLocalDraftThread: true,
    isGitRepo: true,
    phase: "ready",
    runtimeMode: "full-access",
    sendEnvMode: "worktree",
    startFromOrigin: false,
    localCheckoutBranchMismatch: null,
    logicalProjectEnvironments: [],
    providerInstanceEntries: [],
    composerRef,
    composerDraftTarget: draftId,
    promptRef,
    composerImagesRef,
    composerFilesRef,
    composerTerminalContextsRef,
    feedbackUploadsInFlightRef,
    queuedRunEdit: {
      editingRunId: null,
      isEditing: false,
      isSaving: false,
      draftTarget: draftId,
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
    pendingApprovals: [],
    respondingRequestIds: [],
    activePendingProgress: null,
    onAdvanceActivePendingUserInput: fixture.advance,
    onRespondToApproval: async () => undefined,
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
        threadError={entries[draftId]?.message ?? null}
        localThreadErrorEntry={entries[draftId]}
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
for (const guard of ["server", "branch"] as const)
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
      useComposerDraftStore.getState().setPrompt(draftId, prompt);
      const draft = useComposerDraftStore.getState().getComposerDraft(draftId);
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
        guard === "server"
          ? "Update this server before starting multiple models."
          : "Select a base branch before sending in New worktree mode.";
      const chinese =
        guard === "server"
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
      expect(fixture.context).toHaveBeenCalledTimes(kind === "owned" ? 1 : 0);
      expect(useComposerDraftStore.getState().getComposerDraft(draftId)).toBe(draft);
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
      ])
        expect(mock).not.toHaveBeenCalled();
    },
  );

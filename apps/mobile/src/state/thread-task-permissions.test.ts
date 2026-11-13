import {
  AuthOrchestrationOperateScope,
  DEFAULT_SERVER_SETTINGS,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  ComposerContextId,
  EnvironmentId,
  ThreadId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  RuntimeRequestId,
  TurnItemId,
  type ModelSelection,
  type OrchestrationV2ThreadProjection,
  type OrchestrationMessageContext,
  type RuntimeMode,
  type ServerConfig,
} from "@t3tools/contracts";
import {
  v2Now,
  v2Projection,
} from "../../../../packages/client-runtime/src/state/orchestrationV2TestFixtures";
import type { QueuedRunEdit } from "./queued-run-edit";
import type { ComposerDraft } from "./use-composer-drafts";
import type { MobileLocale } from "../i18n/mobileStrings";
import type { DraftComposerImageAttachment } from "../lib/composerImages";
import type { PendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import { sendApprovalFeedback } from "@t3tools/client-runtime/state/thread-requests";
import { Cause, DateTime } from "effect";
import { AsyncResult, type Atom } from "effect/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  edit: null as QueuedRunEdit | null,
  prepareAttachments: vi.fn<typeof import("../lib/attachmentUpload").prepareTurnAttachments>(),
  finishSave: vi.fn<(success: boolean) => boolean>(),
  editQueuedRun: vi.fn(),
  grantedEnvironments: new Set<string>(),
  connectionState: "connected",
  draft: {
    text: "Keep my draft",
    attachments: [] as DraftComposerImageAttachment[],
    context: undefined as OrchestrationMessageContext | undefined,
    modelSelection: undefined as ModelSelection | undefined,
    runtimeMode: undefined as RuntimeMode | undefined,
  },
  serverConfig: null as ServerConfig | null,
  projection: null as OrchestrationV2ThreadProjection | null,
  pendingRequests: { approvals: [], userInputs: [] } as PendingThreadRequests,
  enqueue: vi.fn(async () => undefined),
  freshPending: false,
  compactDue: false,
  setFreshPending: vi.fn(),
  clearDraft: vi.fn(),
  approve: vi.fn(),
  answer: vi.fn(),
  feedback: vi.fn(),
  updateSettings: vi.fn(),
  question: {
    id: "language",
    header: "Language",
    question: "Which language?",
    options: [{ label: "TypeScript", description: "Use the existing code" }],
    multiSelect: false,
  },
  thread: {
    id: "thread",
    environmentId: "secondary",
    lineage: {
      rootThreadId: "thread",
      parentThreadId: null,
      relationshipToParent: null as "subagent" | null,
      sideChat: false,
    },
    worktreePath: null as string | null,
    projectId: "project",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    runtime: null,
    latestRun: null as unknown,
  },
}));

vi.mock("react", () => ({
  useCallback: <A>(callback: A) => callback,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: <A>(current: A) => ({ current }),
  useMemo: <A>(factory: () => A) => factory(),
  useState: <A>(initial: A | (() => A)) => [
    typeof initial === "function" ? (initial as () => A)() : initial,
    vi.fn(),
  ],
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));
vi.mock("@t3tools/client-runtime/state/context-window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/client-runtime/state/context-window")>()),
  shouldCompactBeforeSend: () => state.compactDue,
}));
vi.mock("../lib/attachmentUpload", () => ({ prepareTurnAttachments: state.prepareAttachments }));
vi.mock("../lib/uuid", () => ({ uuidv4: () => "uuid" }));
vi.mock("./queued-run-edit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queued-run-edit")>()),
  useQueuedRunEdit: () => state.edit,
  getQueuedRunEdit: () => state.edit,
  startQueuedRunEditSave: () => state.finishSave,
}));
vi.mock("./preferences", async () => {
  const { Atom, AsyncResult } = await import("effect/reactivity");
  return { mobilePreferencesAtom: Atom.make(AsyncResult.success({})) };
});
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@effect/atom-react", async () => {
  const { appAtomRegistry } = await import("./atom-registry");
  return { useAtomValue: <A>(atom: Atom.Atom<A>) => appAtomRegistry.get(atom) };
});
vi.mock("./entities", () => ({ useServerConfigs: () => new Map() }));
vi.mock("./session", () => ({
  readEnvironmentScope: (environmentId: string, scope: string) =>
    scope === AuthOrchestrationOperateScope && state.grantedEnvironments.has(environmentId),
}));
vi.mock("./use-thread-selection", () => ({
  useThreadSelection: () => ({
    selectedThread: state.thread,
    selectedThreadCreation: null,
    selectedEnvironmentRuntime: {
      connectionState: state.connectionState,
      serverConfig: state.serverConfig,
    },
  }),
}));
vi.mock("./use-thread-detail", () => ({
  useSelectedThreadProjection: () =>
    state.projection === null ? null : { projection: state.projection },
  useSelectedThreadVisibleTurnItems: () => [],
  useSelectedThreadPendingRequests: () => state.pendingRequests,
}));
vi.mock("./use-atom-command", () => ({ useAtomCommand: <A>(command: A) => command }));
vi.mock("./threads", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    environmentThreadDetails: {
      queueWorkflowAtom: () => Atom.make(null),
      checkpointSummariesAtom: () => Atom.make([]),
      sequenceAtom: () => Atom.make(0),
      pendingRequestsAtom: () => Atom.make(state.pendingRequests),
    },
    threadEnvironment: {
      respondToApproval: state.approve,
      respondToUserInput: state.answer,
      uploadFeedback: state.feedback,
      editQueuedRun: state.editQueuedRun,
    },
  };
});
vi.mock("./use-thread-outbox", async () => {
  const { Atom } = await import("effect/reactivity");
  return { dispatchingQueuedMessageIdAtom: Atom.make(null), useThreadOutboxMessages: () => ({}) };
});
vi.mock("./thread-outbox", () => ({ enqueueThreadOutboxMessage: state.enqueue }));
vi.mock("./composer-attachment-uploads", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    composerAttachmentUploadsAtom: Atom.make({}),
    composerAttachmentUploadBlockReason: () => null,
    composerAttachmentsStillUploading: () => false,
  };
});
vi.mock("./use-composer-drafts", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    composerDraftsAtom: Atom.make<Record<string, ComposerDraft>>({}),
    composerContextImportsAtom: Atom.make({}),
    getComposerDraftSnapshot: () => state.draft,
    isFreshSessionPending: () => state.freshPending,
    setFreshSessionPending: state.setFreshPending,
    clearComposerDraftContent: state.clearDraft,
    clearComposerDraft: state.clearDraft,
    setComposerDraftText: (_key: string, text: string) => {
      state.draft.text = text;
    },
    updateComposerDraftSettings: state.updateSettings,
    ensureComposerDraftsLoaded: () => {},
    scheduleUnusedComposerAttachmentCleanup: () => {},
    appendComposerDraftAttachments: vi.fn(),
    appendComposerDraftText: vi.fn(),
    mergeComposerDraftContent: vi.fn(),
    removeComposerDraftAttachment: vi.fn(),
    useComposerDraft: () => state.draft,
    useComposerDraftSettings: () => state.draft,
    questionAttachmentDraftsAtom: () => Atom.make({}),
  };
});
vi.mock("../lib/composerImages", () => ({
  convertPastedImagesToAttachments: vi.fn(),
  pickComposerFiles: vi.fn(),
  pickComposerMedia: vi.fn(),
}));
vi.mock("../lib/commandMetadata", () => ({
  makeQueuedMessageMetadata: () => ({
    messageId: "message",
    commandId: "command",
    createdAt: "2026-09-05T00:00:00.000Z",
  }),
}));
vi.mock("../lib/copyTextWithHaptic", () => ({ copyTextWithHaptic: vi.fn() }));
vi.mock("./use-remote-environment-registry", () => ({ setPendingConnectionError: vi.fn() }));

vi.mock("../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, state.locale),
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], state.locale),
  };
});

import { Alert } from "react-native";
import { appAtomRegistry } from "./atom-registry";
import { composerDraftsAtom } from "./use-composer-drafts";
import { questionAttachmentDraftKey } from "./question-attachments";
import { useThreadComposerState } from "./use-thread-composer-state";
import { useSelectedThreadRequests } from "./use-selected-thread-requests";

const NO_SIDE_CHATS = { startSideChat: async () => false };

function composerServerConfig(sideChats = false): ServerConfig {
  return {
    environment: {
      environmentId: EnvironmentId.make("secondary"),
      label: "Settings",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.0-test",
      capabilities: { repositoryIdentity: true, sideChats, questionAttachments: true },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie"],
      sessionCookieName: "t3_session",
    },
    cwd: "/workspace",
    keybindingsConfigPath: "/workspace/keybindings.json",
    keybindings: [],
    issues: [],
    providers: [
      {
        instanceId: ProviderInstanceId.make("codex"),
        driver: ProviderDriverKind.make("codex"),
        enabled: true,
        installed: true,
        version: null,
        status: "ready",
        auth: { status: "authenticated" },
        checkedAt: "2026-09-05T00:00:00.000Z",
        models: [],
        slashCommands: [],
        skills: [],
      },
    ],
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/workspace/logs",
      localTracingEnabled: false,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
      otlpLogsEnabled: false,
    },
    settings: DEFAULT_SERVER_SETTINGS,
  };
}

const literalImage: DraftComposerImageAttachment = {
  id: "local-image",
  type: "image",
  name: "Settings {0} $&.png",
  mimeType: "image/png",
  sizeBytes: 3,
  dataUrl: "data:image/png;base64,YWJj",
  previewUri: "file:///Settings/{0}/$&.png",
};

beforeEach(() => {
  state.locale = "en";
  state.edit = null;
  state.thread.lineage.sideChat = false;
  state.thread.lineage.relationshipToParent = null;
  state.thread.worktreePath = null;
  state.prepareAttachments.mockReset().mockResolvedValue({
    status: "ready",
    attachments: [],
    draftAttachments: [],
    pendingAttachmentIds: [],
  });
  state.finishSave.mockReset().mockReturnValue(true);
  state.editQueuedRun.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  appAtomRegistry.set(composerDraftsAtom, {});
  state.grantedEnvironments = new Set(["primary"]);
  state.connectionState = "connected";
  state.draft = {
    text: "Keep my draft",
    attachments: [],
    context: undefined,
    modelSelection: undefined,
    runtimeMode: undefined,
  };
  state.freshPending = false;
  state.compactDue = false;
  state.thread.latestRun = null;
  state.projection = null;
  state.serverConfig = composerServerConfig();
  state.pendingRequests = {
    approvals: [
      {
        requestId: RuntimeRequestId.make("approval"),
        requestKind: "command",
        createdAt: "2026-09-05T00:00:00.000Z",
        responseCapability: "live",
      },
    ],
    userInputs: [],
  };
  vi.clearAllMocks();
  state.approve.mockResolvedValue(AsyncResult.success(undefined));
  state.answer.mockResolvedValue(AsyncResult.success(undefined));
  state.feedback.mockResolvedValue(AsyncResult.success({ feedbackId: "feedback" }));
});

describe("mobile task permissions", () => {
  it.each(["en", "zh-CN"] as const)(
    "blocks empty and over-limit queued edits without losing the draft in %s",
    async (locale) => {
      state.locale = locale;
      state.grantedEnvironments.add("secondary");
      state.edit = {
        runId: RunId.make("queued-run"),
        messageId: MessageId.make("queued-message"),
        originalText: "Settings",
        existingAttachments: [],
      };
      state.draft.text = "";
      await useThreadComposerState(NO_SIDE_CHATS).onSendMessage();
      expect(vi.mocked(Alert.alert).mock.lastCall?.slice(0, 2)).toEqual(
        locale === "zh-CN"
          ? ["添加消息", "排队中的消息不能为空。"]
          : ["Add a message", "A queued message cannot be left empty."],
      );
      state.draft.text = "Settings {0} $&";
      state.edit = {
        ...state.edit,
        existingAttachments: [
          { type: "image", id: "server-image", name: "Open", mimeType: "image/png", sizeBytes: 3 },
        ],
      };
      state.draft.attachments = Array.from(
        { length: PROVIDER_SEND_TURN_MAX_ATTACHMENTS },
        (_, index) => ({ ...literalImage, id: `image-${index}` }),
      );
      const retained = state.draft;
      await useThreadComposerState(NO_SIDE_CHATS).onSendMessage();
      const countMessage =
        locale === "zh-CN"
          ? `请移除部分附件，使其数量不超过 ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} 个。`
          : `Remove attachments until there are at most ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS}.`;
      expect(vi.mocked(Alert.alert).mock.lastCall?.[1]).toBe(countMessage);
      state.edit = null;
      state.draft.attachments = [...state.draft.attachments, literalImage];
      await useThreadComposerState(NO_SIDE_CHATS).onSendMessage();
      expect(vi.mocked(Alert.alert).mock.lastCall?.[1]).toBe(countMessage);
      expect(state.draft).toBe(retained);
      expect(state.prepareAttachments).not.toHaveBeenCalled();
      expect(state.finishSave).not.toHaveBeenCalled();
      expect(state.editQueuedRun).not.toHaveBeenCalled();
      expect(state.enqueue).not.toHaveBeenCalled();
      expect(state.clearDraft).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "zh-CN"] as const)(
    "preserves queued-edit upload errors and only localizes owned failure advice in %s",
    async (locale) => {
      state.locale = locale;
      state.grantedEnvironments.add("secondary");
      state.edit = {
        runId: RunId.make("queued-run"),
        messageId: MessageId.make("queued-message"),
        originalText: "original",
        existingAttachments: [],
      };
      state.draft.text = "Settings {0} $&\n/side unchanged";
      state.draft.attachments = [literalImage];
      const retained = structuredClone(state.draft);
      for (const failure of [
        new Error("Settings"),
        new Error("Your edit is still in the composer."),
        new Error("{0} $&"),
        new Error(""),
        null,
      ]) {
        state.prepareAttachments.mockRejectedValueOnce(failure);
        await useThreadComposerState(NO_SIDE_CHATS).onSendMessage();
        expect(vi.mocked(Alert.alert).mock.lastCall?.slice(0, 2)).toEqual([
          locale === "zh-CN" ? "无法保存排队中的消息" : "Could not save the queued message",
          failure instanceof Error
            ? failure.message
            : locale === "zh-CN"
              ? "你的编辑仍保留在输入框中。"
              : "Your edit is still in the composer.",
        ]);
        expect(state.finishSave).toHaveBeenLastCalledWith(false);
        expect(state.draft).toEqual(retained);
      }
      expect(state.editQueuedRun).not.toHaveBeenCalled();
      expect(state.clearDraft).not.toHaveBeenCalled();
      vi.mocked(Alert.alert).mockClear();
      state.prepareAttachments.mockResolvedValueOnce({ status: "abandoned" });
      await useThreadComposerState(NO_SIDE_CHATS).onSendMessage();
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(state.editQueuedRun).not.toHaveBeenCalled();
      state.editQueuedRun.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("Settings"))));
      await useThreadComposerState(NO_SIDE_CHATS).onSendMessage();
      expect(vi.mocked(Alert.alert).mock.lastCall?.[1]).toBe(
        locale === "zh-CN"
          ? "这条消息可能已经开始处理。你的编辑仍保留在输入框中。"
          : "It may have already started. Your edit is still in the composer.",
      );
      vi.mocked(Alert.alert).mockClear();
      state.finishSave.mockReturnValueOnce(false);
      await useThreadComposerState(NO_SIDE_CHATS).onSendMessage();
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(state.clearDraft).not.toHaveBeenCalled();
      state.editQueuedRun.mockResolvedValue(AsyncResult.success(undefined));
      state.prepareAttachments.mockResolvedValueOnce({
        status: "ready",
        attachments: [
          {
            type: "image",
            id: "uploaded",
            name: literalImage.name,
            mimeType: literalImage.mimeType,
            sizeBytes: literalImage.sizeBytes,
          },
        ],
        draftAttachments: [literalImage],
        pendingAttachmentIds: ["uploaded"],
      });
      await useThreadComposerState(NO_SIDE_CHATS).onSendMessage();
      expect(state.editQueuedRun).toHaveBeenLastCalledWith({
        environmentId: "secondary",
        input: {
          threadId: "thread",
          runId: "queued-run",
          text: retained.text,
          edit: {
            messageId: "queued-message",
            attachments: [
              {
                type: "image",
                id: "uploaded",
                name: literalImage.name,
                mimeType: literalImage.mimeType,
                sizeBytes: literalImage.sizeBytes,
              },
            ],
          },
        },
      });
      expect(state.clearDraft).toHaveBeenCalledOnce();
      expect(state.finishSave).toHaveBeenLastCalledWith(true);
      expect(state.enqueue).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "zh-CN"] as const)(
    "blocks unavailable and invalid side questions but preserves command dispatch in %s",
    async (locale) => {
      state.locale = locale;
      state.grantedEnvironments.add("secondary");
      state.draft.text = "/side Settings {0} $&";
      const startSideChat = vi.fn(async () => true);
      const reasons = [
        ["nested", "Side chats cannot start side chats.", "旁支对话无法再启动旁支对话。"],
        ["subagent", "Subagent threads cannot start side chats.", "子智能体对话无法启动旁支对话。"],
        [
          "missing",
          "Side chats are not ready yet. Try again in a moment.",
          "旁支对话尚未就绪，请稍后重试。",
        ],
        [
          "unsupported",
          "Update this environment's T3 Code server to use side chats.",
          "请更新此环境的 T3 Code 服务器以使用旁支对话。",
        ],
        [
          "worktree",
          "Available once the thread's worktree is set up.",
          "对话的工作树设置完成后即可使用。",
        ],
      ];
      for (const [reason, english, chinese] of reasons) {
        state.thread.lineage.sideChat = reason === "nested";
        state.thread.lineage.relationshipToParent = reason === "subagent" ? "subagent" : null;
        state.serverConfig =
          reason === "missing" ? null : composerServerConfig(reason !== "unsupported");
        state.projection =
          reason === "worktree"
            ? {
                ...v2Projection,
                runs: [
                  {
                    id: RunId.make("preparing"),
                    threadId: v2Projection.thread.id,
                    ordinal: 1,
                    providerInstanceId: v2Projection.thread.modelSelection.instanceId,
                    modelSelection: v2Projection.thread.modelSelection,
                    providerThreadId: null,
                    userMessageId: MessageId.make("message"),
                    rootNodeId: null,
                    activeAttemptId: null,
                    status: "preparing",
                    requestedAt: v2Now,
                    startedAt: null,
                    completedAt: null,
                    checkpointId: null,
                    contextHandoffId: null,
                    workspacePreparation: { type: "worktree", baseRef: "Settings {0} $&" },
                  },
                ],
              }
            : null;
        const composer = useThreadComposerState({ startSideChat });
        const message = locale === "zh-CN" ? chinese : english;
        expect(composer.sideChatUnavailableReason).toBe(message);
        await composer.onSendMessage();
        expect(vi.mocked(Alert.alert).mock.lastCall?.[1]).toBe(message);
        expect(state.draft.text).toBe("/side Settings {0} $&");
      }
      state.thread.lineage.sideChat = false;
      state.thread.lineage.relationshipToParent = null;
      state.serverConfig = composerServerConfig(true);
      state.projection = null;
      for (const source of ["attachments", "context"] as const) {
        state.draft.attachments = source === "attachments" ? [literalImage] : [];
        state.draft.context =
          source === "context"
            ? {
                version: 1,
                records: [
                  {
                    version: 1,
                    kind: "mention",
                    contextId: ComposerContextId.make("context"),
                    label: "Settings",
                    path: "/Open/{0}/$&",
                  },
                ],
              }
            : undefined;
        const retained = structuredClone(state.draft);
        await useThreadComposerState({ startSideChat }).onSendMessage();
        expect(vi.mocked(Alert.alert).mock.lastCall?.slice(0, 2)).toEqual(
          locale === "zh-CN"
            ? ["旁支对话仅支持文本", "请移除附件和上下文，然后重新发送。"]
            : [
                "Side chats take text only",
                "Remove the attachments and context, then send it again.",
              ],
        );
        expect(state.draft).toEqual(retained);
      }
      state.draft.context = undefined;
      state.draft.text = "/side";
      await useThreadComposerState({ startSideChat }).onSendMessage();
      expect(vi.mocked(Alert.alert).mock.lastCall?.slice(0, 2)).toEqual(
        locale === "zh-CN"
          ? ["提出旁支问题", "请在 /side 后输入问题，然后发送。"]
          : ["Ask a side question", "Type the question after /side, then send it."],
      );
      expect(startSideChat).not.toHaveBeenCalled();
      expect(state.enqueue).not.toHaveBeenCalled();
      expect(state.clearDraft).not.toHaveBeenCalled();
      state.draft.text = "/side Settings {0} $&";
      const beforeDispatch = vi.fn(async () => "responded" as const);
      await useThreadComposerState({ startSideChat }).onSendMessage(undefined, beforeDispatch);
      expect(beforeDispatch).toHaveBeenCalledExactlyOnceWith("/side Settings {0} $&", false);
      expect(startSideChat).not.toHaveBeenCalled();
      expect(state.enqueue).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "zh-CN"] as const)(
    "retains unanswered question attachments until their destination upload is ready in %s",
    async (locale) => {
      state.locale = locale;
      state.grantedEnvironments.add("secondary");
      const requestId = RuntimeRequestId.make(`attachment-question-${locale}`);
      const question = {
        ...state.question,
        options: [{ label: "Settings {0} $&", description: "Open" }],
      };
      state.pendingRequests = {
        approvals: [],
        userInputs: [
          {
            requestId,
            createdAt: "2026-09-05T00:00:00.000Z",
            responseCapability: "live",
            dismissible: false,
            questions: [question],
          },
        ],
      };
      useSelectedThreadRequests().onSelectUserInputOption(requestId, question, "Settings {0} $&");
      const requests = useSelectedThreadRequests();
      const key = questionAttachmentDraftKey(
        EnvironmentId.make("secondary"),
        ThreadId.make("thread"),
        requestId,
        question.id,
      );
      for (const attachment of [
        literalImage,
        {
          ...literalImage,
          uploadedAttachmentId: "uploaded",
          uploadEnvironmentId: EnvironmentId.make("primary"),
        },
      ]) {
        const draft = { text: "Open {0} $&", attachments: [attachment] };
        appAtomRegistry.set(composerDraftsAtom, { [key]: draft });
        await requests.onSubmitUserInput();
        expect(vi.mocked(Alert.alert).mock.lastCall?.slice(0, 2)).toEqual(
          locale === "zh-CN"
            ? ["附件尚未就绪", "请等待上传完成，或重试失败的上传。"]
            : ["Attachments are not ready", "Wait for uploads to finish, or retry failed uploads."],
        );
        expect(appAtomRegistry.get(composerDraftsAtom)[key]).toBe(draft);
        expect(state.answer).not.toHaveBeenCalled();
        expect(state.clearDraft).not.toHaveBeenCalled();
      }
      appAtomRegistry.set(composerDraftsAtom, {
        [key]: {
          text: "Open {0} $&",
          attachments: [
            {
              ...literalImage,
              uploadedAttachmentId: "uploaded",
              uploadEnvironmentId: EnvironmentId.make("secondary"),
            },
          ],
        },
      });
      await requests.onSubmitUserInput();
      expect(state.answer).toHaveBeenCalledExactlyOnceWith({
        environmentId: "secondary",
        input: {
          threadId: "thread",
          requestId,
          answers: { language: "Settings {0} $&" },
          attachmentsByQuestionId: {
            language: [
              {
                type: "image",
                id: "uploaded",
                name: literalImage.name,
                mimeType: literalImage.mimeType,
                sizeBytes: literalImage.sizeBytes,
              },
            ],
          },
        },
      });
    },
  );

  it("consumes an approval reply without queueing a parent message", async () => {
    state.grantedEnvironments.add("secondary");
    const composer = useThreadComposerState(NO_SIDE_CHATS);
    const requests = useSelectedThreadRequests();
    const approval = { ...state.pendingRequests.approvals[0]!, supportsFeedback: true };
    const messageId = await composer.onSendMessage(undefined, async (text) =>
      (await sendApprovalFeedback(approval, text, requests.onRespondToApproval))
        ? "responded"
        : false,
    );
    expect(messageId).toBeNull();
    expect(state.approve).toHaveBeenCalledWith({
      environmentId: "secondary",
      input: {
        threadId: "thread",
        requestId: "approval",
        decision: "decline",
        feedback: "Keep my draft",
      },
    });
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).toHaveBeenCalledOnce();
  });

  it("preserves a draft changed during an approval reply and never sends it to the parent", async () => {
    state.grantedEnvironments.add("secondary");
    const composer = useThreadComposerState(NO_SIDE_CHATS);
    const beforeDispatch = async () => {
      state.draft = { ...state.draft, text: "New feedback" };
      return "responded" as const;
    };
    expect(await composer.onSendMessage(undefined, beforeDispatch)).toBeNull();
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).not.toHaveBeenCalled();
    expect(state.draft.text).toBe("New feedback");
  });

  it("keeps a connected read-only task's draft instead of queueing it with another environment's grant", async () => {
    const composer = useThreadComposerState(NO_SIDE_CHATS);
    expect(await composer.onSendMessage()).toBeNull();
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).not.toHaveBeenCalled();
    composer.onChangeDraftMessage("Edited locally");
    expect(state.draft.text).toBe("Edited locally");
  });

  it("keeps an armed fresh session for the message after an approval redirect", async () => {
    state.grantedEnvironments.add("secondary");
    state.freshPending = true;
    const composer = useThreadComposerState(NO_SIDE_CHATS);
    expect(await composer.onSendMessage(undefined, async () => true)).toBe("message");
    expect(state.enqueue).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ freshContext: true }),
    );
    expect(state.setFreshPending).not.toHaveBeenCalled();
    expect(await composer.onSendMessage()).toBe("message");
    expect(state.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ freshContext: true }));
    expect(state.setFreshPending).toHaveBeenCalledWith("secondary:thread", false);
  });

  it("compacts a stale thread before sending unless a fresh session is armed", async () => {
    state.grantedEnvironments.add("secondary");
    state.projection = {
      thread: {
        ...state.thread,
        activeProviderThreadId: null,
        lineage: { rootThreadId: "thread", parentThreadId: null, relationshipToParent: null },
      },
      runs: [],
      attempts: [],
      nodes: [],
      subagents: [],
      providerSessions: [],
      providerThreads: [],
      providerTurns: [],
      runtimeRequests: [],
      messages: [],
      plans: [],
      turnItems: [],
      checkpointScopes: [],
      checkpoints: [],
      contextHandoffs: [],
      contextTransfers: [],
      visibleTurnItems: [],
      updatedAt: DateTime.makeUnsafe(0),
    } as unknown as OrchestrationV2ThreadProjection;
    state.compactDue = true;
    const composer = useThreadComposerState(NO_SIDE_CHATS);
    await composer.onSendMessage();
    expect(state.enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ compactBeforeSend: true }),
    );
    state.freshPending = true;
    await composer.onSendMessage();
    expect(state.enqueue).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ compactBeforeSend: true }),
    );
    expect(state.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ freshContext: true }));
  });

  it("sends a typed /clear with an approval redirect as that reply's text", async () => {
    state.grantedEnvironments.add("secondary");
    state.serverConfig = {
      ...state.serverConfig,
      environment: { capabilities: { freshContext: true } },
    } as ServerConfig;
    state.thread.latestRun = { runId: "run" };
    state.draft = { ...state.draft, text: "/clear" };
    const composer = useThreadComposerState(NO_SIDE_CHATS);
    const beforeDispatch = vi.fn(async () => "responded" as const);
    expect(await composer.onSendMessage(undefined, beforeDispatch)).toBeNull();
    expect(beforeDispatch).toHaveBeenCalledWith("/clear", false);
    expect(state.setFreshPending).not.toHaveBeenCalled();
  });

  it("starts a side chat for /side instead of sending to the thread", async () => {
    state.grantedEnvironments.add("secondary");
    state.serverConfig = composerServerConfig(true);
    // The thread gets the composer's mode and model only on its next send.
    const selection: ModelSelection = {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
      options: [{ id: "reasoningEffort", value: "xhigh" }],
    };
    state.draft = {
      ...state.draft,
      text: "/side why does this fail?",
      modelSelection: selection,
      runtimeMode: "approval-required",
    };
    const startSideChat = vi.fn(async () => true);
    const composer = useThreadComposerState({ startSideChat });
    expect(composer.sideChatUnavailableReason).toBeNull();
    expect(await composer.onSendMessage()).toBeNull();
    expect(startSideChat).toHaveBeenCalledExactlyOnceWith(
      { environmentId: "secondary", threadId: "thread" },
      "why does this fail?",
      { runtimeMode: "approval-required", modelSelection: selection },
    );
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).toHaveBeenCalled();

    // An attachment added while the side chat starts stays in the draft.
    vi.clearAllMocks();
    startSideChat.mockImplementationOnce(async () => {
      state.draft = {
        ...state.draft,
        attachments: [{ id: "added" } as DraftComposerImageAttachment],
      };
      return true;
    });
    state.draft = { ...state.draft, text: "/side again?", attachments: [] };
    expect(await useThreadComposerState({ startSideChat }).onSendMessage()).toBeNull();
    expect(startSideChat).toHaveBeenCalledOnce();
    expect(state.clearDraft).not.toHaveBeenCalled();
    // A model the send would refuse does not start a side chat either.
    vi.clearAllMocks();
    const disabledConfig = composerServerConfig(true);
    state.serverConfig = {
      ...disabledConfig,
      providers: disabledConfig.providers.map((provider) => ({ ...provider, enabled: false })),
      settings: {
        ...disabledConfig.settings,
        providerInstances: {
          [selection.instanceId]: { driver: ProviderDriverKind.make("codex"), enabled: false },
        },
      },
    };
    state.draft = { ...state.draft, attachments: [] };
    expect(await useThreadComposerState({ startSideChat }).onSendMessage()).toBeNull();
    expect(startSideChat).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledOnce();
  });

  it("rechecks a retained send callback before clearing or queueing the draft", async () => {
    state.grantedEnvironments.add("secondary");
    const composer = useThreadComposerState(NO_SIDE_CHATS);
    state.grantedEnvironments.delete("secondary");
    expect(await composer.onSendMessage()).toBeNull();
    expect(state.clearDraft).not.toHaveBeenCalled();
    expect(state.enqueue).not.toHaveBeenCalled();
    state.grantedEnvironments.add("secondary");
    expect(await composer.onSendMessage()).toBe("message");
    expect(state.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: "secondary",
        threadId: "thread",
        text: "Keep my draft",
      }),
    );
  });

  it("rechecks the target environment before an approval response", async () => {
    state.grantedEnvironments.add("secondary");
    const requests = useSelectedThreadRequests();
    state.grantedEnvironments.delete("secondary");
    await requests.onRespondToApproval(RuntimeRequestId.make("approval"), "accept");
    expect(state.approve).not.toHaveBeenCalled();
    state.grantedEnvironments.add("secondary");
    await requests.onRespondToApproval(RuntimeRequestId.make("approval"), "accept");
    expect(state.approve).toHaveBeenCalledWith({
      environmentId: "secondary",
      input: { threadId: "thread", requestId: "approval", decision: "accept" },
    });
  });

  it("keeps answer drafts editable after revocation while blocking their submission", async () => {
    state.pendingRequests = {
      approvals: [],
      userInputs: [
        {
          requestId: RuntimeRequestId.make("input"),
          createdAt: "2026-09-05T00:00:00.000Z",
          responseCapability: "live",
          dismissible: false,
          questions: [state.question],
        },
      ],
    };
    const requestId = RuntimeRequestId.make("input");
    useSelectedThreadRequests().onSelectUserInputOption(requestId, state.question, "TypeScript");
    state.grantedEnvironments.add("secondary");
    const requests = useSelectedThreadRequests();
    expect(requests.activePendingUserInputAnswers).toEqual({ language: "TypeScript" });
    state.grantedEnvironments.delete("secondary");
    await requests.onSubmitUserInput();
    expect(state.answer).not.toHaveBeenCalled();
    expect(useSelectedThreadRequests().activePendingUserInputAnswers).toEqual({
      language: "TypeScript",
    });
    state.grantedEnvironments.add("secondary");
    await requests.onSubmitUserInput();
    expect(state.answer).toHaveBeenCalledWith({
      environmentId: "secondary",
      input: { threadId: "thread", requestId: "input", answers: { language: "TypeScript" } },
    });
  });
});

describe("mobile handoff preview and submission", () => {
  it("follows project enablement and provider availability for the selected destination", async () => {
    state.grantedEnvironments.add("secondary");
    const instanceId = ProviderInstanceId.make("antigravity");
    const projectId = ProjectId.make(state.thread.projectId);
    const selection = { instanceId, model: "gemini" };
    const provider = {
      instanceId,
      driver: ProviderDriverKind.make("antigravity"),
      enabled: false,
      installed: true,
      auth: { status: "authenticated" as const },
      availability: "available" as "available" | "unavailable",
      models: [{ slug: selection.model }],
      slashCommands: [],
    };
    const projectOverride = { enabled: false };
    state.serverConfig = {
      ...state.serverConfig,
      providers: [provider],
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: { [instanceId]: { driver: provider.driver, enabled: false } },
        projectSettingsOverrides: {
          [projectId]: { providerInstances: { [instanceId]: projectOverride } },
        },
      },
    } as unknown as ServerConfig;
    state.draft.modelSelection = selection;
    const source = v2Projection.thread.modelSelection;
    state.projection = {
      ...v2Projection,
      runs: [
        {
          id: RunId.make("source-run"),
          threadId: v2Projection.thread.id,
          ordinal: 1,
          providerInstanceId: source.instanceId,
          modelSelection: source,
          providerThreadId: null,
          userMessageId: MessageId.make("source-message"),
          rootNodeId: null,
          activeAttemptId: null,
          status: "completed",
          requestedAt: v2Now,
          startedAt: v2Now,
          completedAt: v2Now,
          checkpointId: null,
          contextHandoffId: null,
        },
      ],
      visibleTurnItems: [
        {
          position: 0,
          visibility: "local",
          sourceThreadId: v2Projection.thread.id,
          sourceItemId: TurnItemId.make("reply"),
          item: {
            id: TurnItemId.make("reply"),
            threadId: v2Projection.thread.id,
            runId: RunId.make("source-run"),
            nodeId: null,
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: 1,
            type: "assistant_message",
            messageId: MessageId.make("reply"),
            status: "completed",
            title: null,
            text: "Task started",
            streaming: false,
            startedAt: v2Now,
            completedAt: v2Now,
            updatedAt: v2Now,
          },
        },
      ],
    };

    const disabled = useThreadComposerState(NO_SIDE_CHATS);
    expect(disabled.pendingHandoff).toBeNull();
    expect(await disabled.onSendMessage()).toBeNull();
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).not.toHaveBeenCalled();

    projectOverride.enabled = true;
    expect(useThreadComposerState(NO_SIDE_CHATS).pendingHandoff).toEqual({
      from: [source],
      to: selection,
    });

    provider.availability = "unavailable";
    const unavailable = useThreadComposerState(NO_SIDE_CHATS);
    expect(unavailable.pendingHandoff).toBeNull();
    expect(await unavailable.onSendMessage()).toBeNull();
    expect(state.enqueue).not.toHaveBeenCalled();
    expect(state.clearDraft).not.toHaveBeenCalled();

    provider.availability = "available";
    const available = useThreadComposerState(NO_SIDE_CHATS);
    expect(available.pendingHandoff).toEqual({ from: [source], to: selection });
    expect(await available.onSendMessage()).toBe("message");
    expect(state.enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        modelSelection: selection,
        text: "Keep my draft",
      }),
    );
    expect(state.clearDraft).toHaveBeenCalledTimes(1);
  });
});

import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  ChatAttachmentId,
  MessageId,
  RunId,
  ThreadId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useImperativeHandle, useRef, useState, type RefObject } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { ATTACHMENT_ONLY_BOOTSTRAP_PROMPT } from "@t3tools/shared/composerContextReferences";
import { toastManager } from "../ui/toast";

import { act, render } from "../../../test/render";
import { useComposerDraftStore, useComposerThreadDraft } from "../../composerDraftStore";
import {
  makeThreadErrorSetter,
  type LocalThreadErrorEntry,
  deriveComposerSendState,
} from "../ChatView.logic";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { AppAtomRegistryProvider, appAtomRegistry } from "../../rpc/atomRegistry";
import { useQueuedRunEdit } from "./useQueuedRunEdit";

import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { ChatBannerLane } from "./ChatBannerLane";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";

vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));

interface RunStatus {
  readonly id: RunId;
  readonly status: string;
}

const mocks = await vi.hoisted(async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    prepare: vi.fn(),
    upload: vi.fn(),
    uploadDefault: undefined as
      | typeof import("../../lib/attachmentUploadQueue").startAttachmentUpload
      | undefined,
    waitUploads: vi.fn(),
    waitDefault: undefined as
      | typeof import("../../lib/attachmentUploadQueue").awaitAttachmentUploads
      | undefined,
    lookup: vi.fn(),
    configs: Atom.make(
      new Map<
        string,
        { environment: { capabilities: { fileAttachments: { maxUploadBytes: number } } } }
      >(),
    ).pipe(Atom.keepAlive),
    editQueuedRun: vi.fn<(value: unknown) => Promise<{ readonly _tag: "Success" | "Failure" }>>(),
    // The projection's runs per thread, written by each test to stand in for the server.
    threadRuns: Atom.family((_key: string) =>
      Atom.make<ReadonlyArray<RunStatus> | null>(null).pipe(Atom.keepAlive),
    ),
  };
});

vi.mock("./queuedMessageEdit", async (original) => {
  const actual = await original<typeof import("./queuedMessageEdit")>();
  mocks.prepare.mockImplementation(actual.prepareQueuedEditAttachments);
  return { ...actual, prepareQueuedEditAttachments: mocks.prepare };
});
vi.mock("../../lib/attachmentUploadQueue", async (original) => {
  const actual = await original<typeof import("../../lib/attachmentUploadQueue")>();
  mocks.uploadDefault = actual.startAttachmentUpload;
  mocks.waitDefault = actual.awaitAttachmentUploads;
  mocks.upload.mockImplementation(actual.startAttachmentUpload);
  mocks.waitUploads.mockImplementation(actual.awaitAttachmentUploads);
  mocks.lookup.mockImplementation(actual.getUploadedAttachments);
  return {
    ...actual,
    startAttachmentUpload: mocks.upload,
    awaitAttachmentUploads: mocks.waitUploads,
    getUploadedAttachments: mocks.lookup,
  };
});

vi.mock("../../state/server", async (original) => ({
  ...(await original<typeof import("../../state/server")>()),
  environmentServerConfigsAtom: mocks.configs,
}));

vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: () => mocks.editQueuedRun,
}));

vi.mock("../../hooks/useSettings", async (original) => ({
  ...(await original<typeof import("../../hooks/useSettings")>()),
  useEnvironmentIdentificationMode: () => "none",
}));

const runsKey = (ref: ScopedThreadRef) => `${ref.environmentId}:${ref.threadId}`;

vi.mock("../../state/threads", async (original) => {
  const actual = await original<typeof import("../../state/threads")>();
  const { Atom } = await import("effect/reactivity");
  const key = (ref: ScopedThreadRef) => `${ref.environmentId}:${ref.threadId}`;
  return {
    ...actual,
    threadEnvironment: {
      ...actual.threadEnvironment,
      snapshotAtom: () => Atom.make(null),
      editQueuedRun: {},
    },
    environmentThreadDetails: {
      ...actual.environmentThreadDetails,
      statusAtom: () => Atom.make("ready"),
      quietThreadAtom: (ref: ScopedThreadRef) =>
        Atom.make((get) => {
          const runs = get(mocks.threadRuns(key(ref)));
          return runs === null ? null : { projection: { runs } };
        }),
    },
    environmentThreadShells: {
      ...actual.environmentThreadShells,
      threadShellAtom: () => Atom.make(null),
    },
  };
});

const ENV = EnvironmentId.make("env-1");
const THREAD_A: ScopedThreadRef = { environmentId: ENV, threadId: ThreadId.make("thread-a") };
const THREAD_B: ScopedThreadRef = { environmentId: ENV, threadId: ThreadId.make("thread-b") };
const RUN = RunId.make("run-1");

type HookResult = ReturnType<typeof useQueuedRunEdit>;

function projection(runs: ReadonlyArray<RunStatus>) {
  return { runs, messages: [] } as unknown as ThreadStructure;
}

function setRuns(ref: ScopedThreadRef, status: string) {
  appAtomRegistry.set(mocks.threadRuns(runsKey(ref)), [{ id: RUN, status }]);
}

function Harness(props: {
  readonly threadRef: ScopedThreadRef;
  readonly runStatus: string;
  readonly hookRef: RefObject<HookResult | null>;
}) {
  const promptRef = useRef("");
  const composerRef = useRef(null);
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismiss] = useState(0);
  const setError = makeThreadErrorSetter({
    routeThreadRef: props.threadRef,
    routeThreadKey: "edit",
    draftId: null,
    serverThreadRef: props.threadRef,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const result = useQueuedRunEdit({
    environmentId: ENV,
    routeThreadRef: props.threadRef,
    threadDraftTarget: props.threadRef,
    activeThreadId: props.threadRef.threadId,
    serverProjection: projection([{ id: RUN, status: props.runStatus }]),
    promptRef,
    composerRef,
  });
  useImperativeHandle(props.hookRef, () => result);
  const draft = useComposerThreadDraft(result.draftTarget);
  const sendState = deriveComposerSendState({
    prompt: draft.prompt,
    imageCount: draft.images.length + draft.files.length,
    existingAttachmentCount: result.editingAttachments?.length ?? 0,
    terminalContexts: draft.terminalContexts,
  });
  return (
    <>
      {result.isEditing ? (
        <ComposerPrimaryActions
          compact={false}
          canOperateThread
          pendingAction={null}
          isRunning={false}
          canInterrupt={false}
          isSendBusy={result.isSaving}
          sendDisabledReason={null}
          isEnvironmentUnavailable={false}
          isPreparingWorktree={false}
          hasSendableContent={sendState.hasSendableContent}
          isEditingQueuedMessage
          onSubmitMessage={() =>
            void result.saveEdit(
              { ...savedContent(draft.prompt), images: draft.images, files: draft.files },
              setError,
            )
          }
          onPreviousPendingQuestion={() => {}}
          onInterrupt={() => {}}
        />
      ) : null}
      <ChatBannerLane
        environmentId={ENV}
        providerStatus={null}
        providerStatusBannerKey={null}
        setDismissedProviderStatusBannerKey={() => undefined}
        onOpenProviderSetup={() => undefined}
        threadId={props.threadRef.threadId}
        threadError={entries.edit?.message ?? null}
        localThreadErrorEntry={entries.edit}
        threadErrorClass={null}
        threadErrorCode={null}
        threadErrorBannerKey={null}
        setThreadError={setError}
        setThreadErrorBannerDismissTick={setDismiss}
      />
    </>
  );
}

function view(threadRef: ScopedThreadRef, runStatus: string, hook: { current: HookResult | null }) {
  return (
    <AppAtomRegistryProvider>
      <Harness threadRef={threadRef} runStatus={runStatus} hookRef={hook} />
    </AppAtomRegistryProvider>
  );
}

function setup() {
  mocks.editQueuedRun.mockReset();
  mocks.prepare.mockClear();
  if (!mocks.uploadDefault || !mocks.waitDefault) throw new Error("Upload mocks not initialized");
  mocks.upload.mockReset().mockImplementation(mocks.uploadDefault);
  mocks.waitUploads.mockReset().mockImplementation(mocks.waitDefault);
  mocks.lookup.mockClear();
  appAtomRegistry.set(mocks.configs, new Map());
  useComposerDraftStore.setState({ draftsByThreadKey: {}, draftThreadsByThreadKey: {} });
  setRuns(THREAD_A, "queued");
  setRuns(THREAD_B, "queued");
  return { hook: { current: null as HookResult | null } };
}

function requireHook(hook: { current: HookResult | null }): HookResult {
  if (hook.current === null) throw new Error("hook did not render");
  return hook.current;
}

async function beginChangedEdit(hook: { current: HookResult | null }) {
  await act(() =>
    requireHook(hook).beginEdit({
      runId: RUN,
      messageId: MessageId.make("message-1"),
      text: "original",
      attachments: [],
    }),
  );
  await act(() =>
    useComposerDraftStore.getState().setPrompt(requireHook(hook).draftTarget, "changed"),
  );
}

const savedContent = (prompt: string) => ({
  prompt,
  images: [],
  files: [],
  terminalContexts: [],
  reviewComments: [],
  previewAnnotations: [],
  threadContexts: [],
  environmentContexts: [],
});

const promptOf = (ref: ScopedThreadRef) =>
  useComposerDraftStore.getState().getComposerDraft(ref)?.prompt ?? "";

describe("useQueuedRunEdit", () => {
  it.each(["", "Ultrathink:\n"])(
    "opens attachment-only edits without the placeholder and preserves effort on save (%j)",
    async (prefix) => {
      const { hook } = setup();
      mocks.editQueuedRun.mockResolvedValue({ _tag: "Success" });
      await using screen = await render(view(THREAD_A, "queued", hook));
      using toast = vi.spyOn(toastManager, "add");
      const attachments = [
        {
          type: "image" as const,
          id: ChatAttachmentId.make("kept"),
          name: "kept.png",
          mimeType: "image/png",
          sizeBytes: 10,
        },
      ];
      const request = {
        runId: RUN,
        messageId: MessageId.make("message-1"),
        text: prefix + ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
        attachments,
      };
      await act(() => requireHook(hook).beginEdit(request));
      expect(
        useComposerDraftStore.getState().getComposerDraft(requireHook(hook).draftTarget)?.prompt ??
          "",
      ).toBe(prefix.trimEnd());
      expect(requireHook(hook).editingAttachments?.map(({ attachment }) => attachment)).toEqual(
        attachments,
      );
      await act(() =>
        useComposerDraftStore
          .getState()
          .setRuntimeMode(requireHook(hook).draftTarget, "full-access"),
      );
      await act(() => setRuns(THREAD_A, "running"));
      expect(toast).not.toHaveBeenCalled();
      expect(requireHook(hook).isEditing).toBe(false);
      await act(() => setRuns(THREAD_A, "queued"));
      await act(() => requireHook(hook).beginEdit(request));
      const update = screen.getByRole("button", { name: "Update queued message" });
      await expect.element(update).toBeEnabled();
      await update.click();
      await vi.waitFor(() => expect(mocks.editQueuedRun).toHaveBeenCalledOnce());
      expect(mocks.editQueuedRun).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            text: prefix + ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
            edit: expect.objectContaining({ attachments }),
          }),
        }),
      );
    },
  );

  it("saves an effort-only prompt without claiming removed attachments remain", async () => {
    const { hook } = setup();
    mocks.editQueuedRun.mockResolvedValue({ _tag: "Success" });
    await using screen = await render(view(THREAD_A, "queued", hook));
    await act(() =>
      requireHook(hook).beginEdit({
        runId: RUN,
        messageId: MessageId.make("message-1"),
        text: `Ultrathink:\n${ATTACHMENT_ONLY_BOOTSTRAP_PROMPT}`,
        attachments: [
          {
            type: "image",
            id: ChatAttachmentId.make("removed"),
            name: "removed.png",
            mimeType: "image/png",
            sizeBytes: 10,
          },
        ],
      }),
    );
    await act(() => requireHook(hook).removeEditingAttachment("removed"));
    await screen.getByRole("button", { name: "Update queued message" }).click();
    await vi.waitFor(() => expect(mocks.editQueuedRun).toHaveBeenCalledOnce());
    expect(mocks.editQueuedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          text: "Ultrathink:",
          edit: expect.objectContaining({ attachments: [] }),
        }),
      }),
    );
  });

  it("keeps an open edit when the user leaves the thread and comes back", async () => {
    const { hook } = setup();
    await using screen = await render(view(THREAD_A, "queued", hook));
    await beginChangedEdit(hook);

    await screen.rerender(view(THREAD_B, "queued", hook));
    expect(requireHook(hook).isEditing).toBe(false);
    await screen.rerender(view(THREAD_A, "queued", hook));

    expect(requireHook(hook).editingRunId).toBe(RUN);
    expect(
      useComposerDraftStore.getState().getComposerDraft(requireHook(hook).draftTarget)?.prompt,
    ).toBe("changed");
  });

  it("moves a changed edit into the thread draft when its run starts while the user is away", async () => {
    const { hook } = setup();
    await using screen = await render(view(THREAD_A, "queued", hook));
    await beginChangedEdit(hook);

    await screen.rerender(view(THREAD_B, "queued", hook));
    expect(promptOf(THREAD_A)).toBe("");
    await act(() => setRuns(THREAD_A, "running"));

    expect(promptOf(THREAD_A)).toBe("changed");
  });

  it("does not copy a saved edit into the thread draft when the run starts mid-save", async () => {
    const { hook } = setup();
    let finishSave: (result: { readonly _tag: "Success" }) => void = () => {};
    mocks.editQueuedRun.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    await using screen = await render(view(THREAD_A, "queued", hook));
    await beginChangedEdit(hook);

    // Not inside act(): act would hold the projection update until the save settles.
    const saved = requireHook(hook).saveEdit(savedContent("changed"), () => {});
    await vi.waitFor(() => expect(mocks.editQueuedRun).toHaveBeenCalledOnce());
    // The server applied the edit and then started the run; the projection
    // reports the start before the edit's acknowledgement arrives.
    await act(() => setRuns(THREAD_A, "running"));
    await screen.rerender(view(THREAD_A, "running", hook));
    finishSave({ _tag: "Success" });
    await act(() => saved);

    expect(requireHook(hook).isEditing).toBe(false);
    expect(promptOf(THREAD_A)).toBe("");
  });

  it("leaves a newer edit alone when a save from before navigation finishes", async () => {
    const { hook } = setup();
    let finishSave: (result: { readonly _tag: "Success" }) => void = () => {};
    mocks.editQueuedRun.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    await using screen = await render(view(THREAD_A, "queued", hook));
    await beginChangedEdit(hook);
    // Not inside act(): act would hold the rerenders until the save settles.
    const saved = requireHook(hook).saveEdit(savedContent("changed"), () => {});
    await vi.waitFor(() => expect(mocks.editQueuedRun).toHaveBeenCalledOnce());

    // Leaving the thread unmounts the chat view; coming back mounts a new one.
    await screen.rerender(<AppAtomRegistryProvider>{null}</AppAtomRegistryProvider>);
    await screen.rerender(view(THREAD_A, "queued", hook));
    expect(requireHook(hook).isSaving).toBe(true);
    await beginChangedEdit(hook);
    await act(() =>
      useComposerDraftStore.getState().setPrompt(requireHook(hook).draftTarget, "newer"),
    );

    finishSave({ _tag: "Success" });
    await act(() => saved);

    expect(requireHook(hook).editingRunId).toBe(RUN);
    expect(requireHook(hook).isSaving).toBe(false);
    expect(
      useComposerDraftStore.getState().getComposerDraft(requireHook(hook).draftTarget)?.prompt,
    ).toBe("newer");
  });
});

function localizedView(locale: "en" | "zh-CN", hook: { current: HookResult | null }) {
  return (
    <WebI18nContext.Provider
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, params) => translateWebMessage(locale, key, params),
      }}
    >
      {view(THREAD_A, "queued", hook)}
    </WebI18nContext.Provider>
  );
}

it.each(["failure", "interrupted", "non-error", "raw", "empty"] as const)(
  "keeps queued edit %s fallback current",
  async (kind) => {
    const { hook } = setup();
    const source = "Could not save the edited queued message.";
    let resolve: (value: { readonly _tag: "Failure" }) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    mocks.editQueuedRun.mockReturnValue(
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
    );
    await using screen = await render(localizedView("en", hook));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        resolve(AsyncResult.failure(Cause.fail(null)));
        await act(async () => {
          await Promise.resolve();
        });
        if (hook.current?.isEditing) await act(() => requireHook(hook).cancelEdit());
      },
    };
    await beginChangedEdit(hook);
    await screen.getByRole("button", { name: "Update queued message", exact: true }).click();
    await expect.poll(() => mocks.editQueuedRun.mock.calls.length).toBe(1);
    expect(requireHook(hook).isSaving).toBe(true);
    await expect
      .element(screen.getByRole("button", { name: "Updating queued message", exact: true }))
      .toBeDisabled();
    await screen.rerender(localizedView("zh-CN", hook));
    if (kind === "failure")
      resolve(AsyncResult.failure(Cause.fail(new Error("private upstream detail"))));
    else if (kind === "interrupted") resolve(AsyncResult.failure(Cause.interrupt()));
    else reject(kind === "non-error" ? null : new Error(kind === "raw" ? source : ""));
    await expect.poll(() => requireHook(hook).isSaving).toBe(false);
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(localizedView(locale, hook));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            (kind === "failure" || kind === "interrupted" || kind === "non-error") &&
              locale === "zh-CN"
              ? "无法保存编辑后的队列消息。"
              : source,
          );
    }
    expect(screen.container.textContent).not.toContain("private upstream detail");
    expect(requireHook(hook).isEditing).toBe(true);
    expect(
      useComposerDraftStore.getState().getComposerDraft(requireHook(hook).draftTarget)?.prompt,
    ).toBe("changed");
    expect(mocks.editQueuedRun).toHaveBeenCalledTimes(1);
    expect(mocks.editQueuedRun.mock.calls[0]?.[0]).toMatchObject({
      environmentId: ENV,
      input: {
        threadId: THREAD_A.threadId,
        runId: RUN,
        text: "changed",
        edit: { messageId: "message-1", attachments: [] },
      },
    });
    await act(() => requireHook(hook).cancelEdit());
  },
);

it("keeps queued attachment limit current without starting a save", async () => {
  const { hook } = setup();
  const source = `A message can have at most ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} attachments.`;
  await using screen = await render(localizedView("en", hook));
  await using _cancel = {
    [Symbol.asyncDispose]: async () => {
      await act(() => hook.current?.cancelEdit());
    },
  };
  const attachments = Array.from({ length: PROVIDER_SEND_TURN_MAX_ATTACHMENTS }, (_, index) => ({
    type: "file" as const,
    id: ChatAttachmentId.make(`existing-${index}`),
    name: `literal-$&-{file}-${index}.txt`,
    mimeType: "text/plain",
    sizeBytes: 1,
  }));
  await act(() =>
    requireHook(hook).beginEdit({
      runId: RUN,
      messageId: MessageId.make("limit-message"),
      text: "original",
      attachments,
    }),
  );
  expect(requireHook(hook).editingAttachments).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS);
  const file = {
    type: "file" as const,
    id: ChatAttachmentId.make("new-file"),
    name: "new-$&-{file}.txt",
    mimeType: "text/plain",
    sizeBytes: 1,
    file: new File(["x"], "new-$&-{file}.txt", { type: "text/plain" }),
  };
  await act(() => {
    expect(
      useComposerDraftStore.getState().addFiles(requireHook(hook).draftTarget, [file]),
    ).toHaveLength(1);
  });
  const before = useComposerDraftStore.getState().getComposerDraft(requireHook(hook).draftTarget);
  expect(before?.files).toHaveLength(1);
  await screen.getByRole("button", { name: "Update queued message", exact: true }).click();
  await expect.poll(() => screen.container.textContent).toContain(source);
  for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
    await screen.rerender(localizedView(locale, hook));
    await expect
      .poll(() => screen.container.textContent)
      .toContain(
        locale === "en"
          ? source
          : `每条消息最多可添加 ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} 个附件。`,
      );
    expect(requireHook(hook).isSaving).toBe(false);
    expect(requireHook(hook).isEditing).toBe(true);
    expect(requireHook(hook).editingAttachments).toHaveLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS);
  }
  expect(useComposerDraftStore.getState().getComposerDraft(requireHook(hook).draftTarget)).toBe(
    before,
  );
  expect(mocks.editQueuedRun).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});

it.each(["owned", "raw", "empty"] as const)(
  "keeps queued missing upload %s notice current",
  async (kind) => {
    const { hook } = setup();
    const source = "Retry or remove failed uploads before saving.";
    appAtomRegistry.set(
      mocks.configs,
      new Map([
        [ENV, { environment: { capabilities: { fileAttachments: { maxUploadBytes: 1024 } } } }],
      ]),
    );
    let resolve: () => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    mocks.waitUploads.mockReturnValueOnce(
      new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      }),
    );
    mocks.upload.mockImplementationOnce(() => undefined);
    await using screen = await render(localizedView("en", hook));
    await using _cleanup = {
      [Symbol.asyncDispose]: async () => {
        resolve();
        await act(async () => {
          await Promise.resolve();
        });
        if (hook.current?.isEditing) await act(() => requireHook(hook).cancelEdit());
        appAtomRegistry.set(mocks.configs, new Map());
      },
    };
    await beginChangedEdit(hook);
    const file = {
      type: "file" as const,
      id: ChatAttachmentId.make(`missing-${kind}`),
      name: "literal-$&-{file}.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
      file: new File(["x"], "literal-$&-{file}.txt", { type: "text/plain" }),
    };
    await act(() => {
      expect(
        useComposerDraftStore.getState().addFiles(requireHook(hook).draftTarget, [file]),
      ).toHaveLength(1);
    });
    const before = useComposerDraftStore.getState().getComposerDraft(requireHook(hook).draftTarget);
    expect(
      appAtomRegistry.get(mocks.configs).get(ENV)?.environment.capabilities.fileAttachments
        .maxUploadBytes,
    ).toBe(1024);
    await screen.getByRole("button", { name: "Update queued message", exact: true }).click();
    await expect.poll(() => mocks.waitUploads.mock.calls.length).toBe(1);
    expect(requireHook(hook).isSaving).toBe(true);
    await screen.rerender(localizedView("zh-CN", hook));
    expect(
      appAtomRegistry.get(mocks.configs).get(ENV)?.environment.capabilities.fileAttachments
        .maxUploadBytes,
    ).toBe(1024);
    if (kind === "owned") resolve();
    else reject(new Error(kind === "raw" ? source : ""));
    await expect.poll(() => requireHook(hook).isSaving).toBe(false);
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(localizedView(locale, hook));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(
            kind === "owned" && locale === "zh-CN" ? "保存前请重试或移除上传失败的附件。" : source,
          );
    }
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith({
      environmentId: ENV,
      image: file,
      draftTarget: requireHook(hook).draftTarget,
    });
    expect(mocks.waitUploads).toHaveBeenCalledExactlyOnceWith([file.id]);
    expect(mocks.lookup).toHaveBeenCalledTimes(kind === "owned" ? 1 : 0);
    if (kind === "owned") expect(mocks.lookup.mock.results[0]?.value).toBeNull();
    expect(mocks.editQueuedRun).not.toHaveBeenCalled();
    expect(requireHook(hook).isEditing).toBe(true);
    expect(useComposerDraftStore.getState().getComposerDraft(requireHook(hook).draftTarget)).toBe(
      before,
    );
  },
);

import { useRef, useState } from "react";
import {
  EnvironmentId,
  ThreadId,
  ProjectId,
  ProviderInstanceId,
  ChatAttachmentId,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { appAtomRegistry, AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import {
  makeThreadErrorSetter,
  snapshotComposerSend,
  type LocalThreadErrorEntry,
} from "../ChatView.logic";
import { toastManager } from "../ui/toast";
import { ChatBannerLane } from "./ChatBannerLane";
import { draftFanoutSelectionsAtom, draftSendState } from "./chatViewSend";
import { useMultipleModelSend } from "./useMultipleModelSend";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  start: vi.fn(),
  fanout: vi.fn(),
  release: vi.fn(),
  navigate: vi.fn(),
  reset: vi.fn(),
  block: vi.fn(),
  context: vi.fn(),
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
vi.mock("../../state/use-orchestration-command", async (original) => ({
  ...(await original<typeof import("../../state/use-orchestration-command")>()),
  useOrchestrationCommand: () => fixture.start,
}));
vi.mock("./chatViewSend", async (original) => ({
  ...(await original<typeof import("./chatViewSend")>()),
  startFanoutThread: fixture.fanout,
}));
vi.mock("../../lib/attachmentUploadQueue", async (original) => ({
  ...(await original<typeof import("../../lib/attachmentUploadQueue")>()),
  releaseDraftAttachments: fixture.release,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => fixture.navigate,
}));
vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));
const ref = {
  environmentId: EnvironmentId.make("fanout-env"),
  threadId: ThreadId.make("fanout-thread"),
};
type SendInput = Parameters<ReturnType<typeof useMultipleModelSend>>[0];
function Probe({
  routeKey,
  draftId,
  input,
}: {
  routeKey: string;
  draftId: DraftId;
  input: SendInput;
}) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismiss] = useState(0);
  const [pending, setPending] = useState(false);
  const [settledPrompt, setSettledPrompt] = useState(input.sendSnapshot.messageText);
  const currentRouteThreadKeyRef = useRef<string | null>(routeKey);
  const composerRef = useRef(null);
  const promptRef = useRef(input.sendSnapshot.messageText);
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: routeKey,
    draftId,
    serverThreadRef: null,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const send = useMultipleModelSend({
    environmentId: ref.environmentId,
    routeThreadKey: routeKey,
    currentRouteThreadKeyRef,
    draftId,
    composerDraftTarget: draftId,
    composerRef,
    promptRef,
    runtimeMode: "full-access",
    startFromOrigin: false,
    resetLocalDispatch: fixture.reset,
    setThreadError: setError,
  });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          draftSendState(routeKey).sendInFlight.current = true;
          await send(input);
          setSettledPrompt(promptRef.current);
          setPending(false);
        }}
      >
        Send multiple models
      </button>
      <output data-testid="prompt">{settledPrompt}</output>
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
  fixture.locale = locale;
  return (
    <AppAtomRegistryProvider>
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
    </AppAtomRegistryProvider>
  );
}
it.each(["owned", "raw", "empty"] as const)(
  "keeps multiple-model %s failure current before any start",
  async (kind) => {
    for (const mock of [
      fixture.start,
      fixture.fanout,
      fixture.release,
      fixture.navigate,
      fixture.reset,
      fixture.block,
      fixture.context,
    ])
      mock.mockReset();
    fixture.block.mockReturnValue(null);
    const source = "Failed to send messages.";
    const routeKey = `multiple-model-${kind}`;
    const draftId = DraftId.make(routeKey);
    const state = draftSendState(routeKey);
    const originalLock = state.sendInFlight.current;
    const originalUncertain = state.uncertainSubmissions.current;
    const selectionsAtom = draftFanoutSelectionsAtom(routeKey);
    const originalSelections = appAtomRegistry.get(selectionsAtom);
    const originalStore = useComposerDraftStore.getState();
    using _restore = {
      [Symbol.dispose]: () => {
        state.sendInFlight.current = originalLock;
        state.uncertainSubmissions.current = originalUncertain;
        appAtomRegistry.set(selectionsAtom, originalSelections);
        useComposerDraftStore.setState(originalStore, true);
      },
    };
    const selections = [
      { instanceId: ProviderInstanceId.make("provider-a"), model: "model-a" },
      { instanceId: ProviderInstanceId.make("provider-b"), model: "model-b" },
    ];
    appAtomRegistry.set(selectionsAtom, selections);
    const prompt = "literal $& {prompt}";
    originalStore.setPrompt(draftId, prompt);
    const file = {
      type: "file" as const,
      id: ChatAttachmentId.make(`fanout-file-${kind}`),
      name: "literal-$&-{file}.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
      file: new File(["x"], "literal-$&-{file}.txt", { type: "text/plain" }),
    };
    expect(originalStore.addFiles(draftId, [file])).toHaveLength(1);
    const before = useComposerDraftStore.getState().getComposerDraft(draftId);
    const sendSnapshot = snapshotComposerSend({
      prompt,
      images: [],
      files: [file],
      terminalContexts: [],
      sendableTerminalContexts: [],
      previewAnnotations: [],
      reviewComments: [],
      threadContexts: [],
      environmentContexts: [],
    });
    let reject: (reason: unknown) => void = () => undefined;
    const attachmentsPromise = new Promise<never>((_resolve, no) => {
      reject = no;
    });
    // A failed click must still permit teardown without an unhandled rejection.
    void attachmentsPromise.catch(() => undefined);
    const input: SendInput = {
      threadId: ref.threadId,
      project: {
        id: ProjectId.make("fanout-project"),
        environmentId: ref.environmentId,
        title: "Literal project",
        workspaceRoot: "/workspace/project",
        defaultModelSelection: null,
        scripts: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      branch: "main",
      selections,
      targets: selections.map((selection) => ({ selection, text: prompt })),
      sendSnapshot,
      createdAt: "2026-01-01T00:00:00.000Z",
      attachmentsPromise,
      usesAttachmentUploads: true,
      readFileBlockReason: fixture.block,
      buildOutgoingMessageContext: fixture.context,
      isCurrentSend: () => true,
    };
    const props = { routeKey, draftId, input };
    using toast = vi.spyOn(toastManager, "add");
    await using screen = await render(surface("en", props));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          reject(new Error("cleanup"));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Send multiple models", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: "Send multiple models", exact: true }))
      .toBeDisabled();
    expect(state.sendInFlight.current).toBe(true);
    await screen.rerender(surface("zh-CN", props));
    reject(kind === "owned" ? null : new Error(kind === "raw" ? source : ""));
    await expect
      .element(screen.getByRole("button", { name: "Send multiple models", exact: true }))
      .toBeEnabled();
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, props));
      if (kind === "empty")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(kind === "owned" && locale === "zh-CN" ? "发送消息失败。" : source);
    }
    expect(state.sendInFlight.current).toBe(false);
    expect(state.uncertainSubmissions.current).toBe(originalUncertain);
    expect(fixture.reset).toHaveBeenCalledTimes(1);
    expect(appAtomRegistry.get(selectionsAtom)).toBe(selections);
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)).toBe(before);
    await expect.element(screen.getByTestId("prompt")).toHaveTextContent(prompt);
    for (const mock of [
      fixture.start,
      fixture.fanout,
      fixture.release,
      fixture.navigate,
      fixture.block,
      fixture.context,
      toast,
    ])
      expect(mock).not.toHaveBeenCalled();
  },
);

import "~/index.css";
import { useRef, useState } from "react";
import {
  EnvironmentId,
  ThreadId,
  RuntimeRequestId,
  NodeId,
  TurnItemId,
  ProviderSessionId,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { makeThreadProjectionFixture } from "../../test-fixtures";
import { makeThreadErrorSetter, type LocalThreadErrorEntry } from "../ChatView.logic";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useAttachmentUploadStore } from "../../lib/attachmentUploadQueue";
import { questionAttachmentDraftId } from "../../questionAttachments";
import { ChatBannerLane } from "./ChatBannerLane";

const fixture = vi.hoisted(() => ({
  approval: vi.fn(),
  input: vi.fn(),
  dismiss: vi.fn(),
  allowed: true,
  uploaded: vi.fn(),
}));
vi.mock("../../lib/attachmentUploadQueue", async (original) => ({
  ...(await original<typeof import("../../lib/attachmentUploadQueue")>()),
  getUploadedAttachments: fixture.uploaded,
  refreshExpiredAttachmentUploads: async () => undefined,
}));
vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  readEnvironmentScope: () => fixture.allowed,
}));
vi.mock("../../state/use-orchestration-command", async (original) => {
  const { threadEnvironment } = await import("../../state/threads");
  return {
    ...(await original<typeof import("../../state/use-orchestration-command")>()),
    useOrchestrationCommand: (command: unknown) =>
      command === threadEnvironment.respondToApproval ? fixture.approval : fixture.input,
  };
});
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: () => fixture.dismiss,
}));
import { usePendingThreadRequests } from "./usePendingThreadRequests";
const ref = {
  environmentId: EnvironmentId.make("pending-fixture"),
  threadId: ThreadId.make("pending-thread"),
};
const requestId = RuntimeRequestId.make("pending-request");
function projection(
  approval: boolean,
  live = true,
  dismissible = false,
): OrchestrationV2ThreadProjection {
  const base = makeThreadProjectionFixture();
  return {
    ...base,
    thread: { ...base.thread, id: ref.threadId },
    runtimeRequests: [
      {
        id: requestId,
        nodeId: NodeId.make("pending-node"),
        providerTurnId: null,
        nativeRequestRef: null,
        kind: approval ? "command" : "user_input",
        status: "pending",
        responseCapability: live
          ? dismissible
            ? { type: "message" }
            : { type: "live", providerSessionId: ProviderSessionId.make("fixture-session") }
          : { type: "not_resumable", reason: "Fixture offline" },
        createdAt: base.updatedAt,
        resolvedAt: null,
      },
    ],
    turnItems: approval
      ? []
      : [
          {
            id: TurnItemId.make("pending-item"),
            threadId: ref.threadId,
            runId: null,
            nodeId: NodeId.make("pending-node"),
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: 0,
            status: "completed",
            title: null,
            startedAt: base.updatedAt,
            completedAt: base.updatedAt,
            updatedAt: base.updatedAt,
            type: "user_input_request",
            requestId,
            questions: [
              {
                id: "question",
                header: "Literal $& {question}",
                question: "Choose",
                initialAnswer: "Literal $& {answer}",
                options: [],
                multiSelect: false,
              },
            ],
          },
        ],
  };
}
function setup() {
  fixture.allowed = true;
  fixture.uploaded.mockReset().mockReturnValue(null);
  for (const command of [fixture.approval, fixture.input, fixture.dismiss])
    command.mockReset().mockResolvedValue(AsyncResult.failure(Cause.fail(null)));
}
function Probe({
  value,
  action,
}: {
  value: OrchestrationV2ThreadProjection;
  action: "approval" | "input" | "dismiss";
}) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismissTick] = useState(0);
  const promptRef = useRef("");
  const composerRef = useRef(null);
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "pending",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const state = usePendingThreadRequests({
    environmentId: ref.environmentId,
    activeThreadId: ref.threadId,
    serverProjection: value,
    supportsQuestionAttachments: true,
    composerDraftTarget: ref,
    setComposerDraftPrompt: () => undefined,
    promptRef,
    composerRef,
    setThreadError: setError,
  });
  const busy =
    action === "approval" ? state.respondingRequestIds.length > 0 : state.activePendingIsResponding;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (action === "approval") void state.onRespondToApproval(requestId, "accept");
          else if (action === "dismiss") void state.onDismissUserInput(requestId);
          else state.onAdvanceActivePendingUserInput();
        }}
      >
        Respond
      </button>
      <ChatBannerLane
        environmentId={ref.environmentId}
        providerStatus={null}
        providerStatusBannerKey={null}
        setDismissedProviderStatusBannerKey={() => undefined}
        onOpenProviderSetup={() => undefined}
        threadId={ref.threadId}
        threadError={entries.pending?.message ?? null}
        localThreadErrorEntry={entries.pending}
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
  value: OrchestrationV2ThreadProjection,
  action: "approval" | "input" | "dismiss",
) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Probe value={value} action={action} />
    </WebI18nContext>
  );
}
const cases = [
  ["approval", "Failed to submit approval decision.", "提交审批决定失败。"],
  ["input", "Failed to submit user input.", "提交用户输入失败。"],
  ["dismiss", "Failed to dismiss the question.", "忽略问题失败。"],
] as const;
it.each(cases)(
  "keeps owned pending %s failure current without another response",
  async (action, english, chinese) => {
    setup();
    let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    fixture[action].mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const value = projection(action === "approval", true, action === "dismiss");
    await using screen = await render(surface("en", value, action));
    await screen.getByRole("button", { name: "Respond" }).click();
    await expect.element(screen.getByRole("button", { name: "Respond" })).toBeDisabled();
    await screen.rerender(surface("zh-CN", value, action));
    finish(AsyncResult.failure(Cause.fail(null)));
    await expect.element(screen.getByRole("button", { name: "Respond" })).toBeEnabled();
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, value, action));
      await expect
        .poll(() => screen.container.textContent)
        .toContain(locale === "en" ? english : chinese);
    }
    expect(fixture[action]).toHaveBeenCalledTimes(1);
    expect(fixture[action]).toHaveBeenCalledWith({
      environmentId: ref.environmentId,
      input: {
        threadId: ref.threadId,
        requestId,
        ...(action === "approval"
          ? { decision: "accept" }
          : action === "input"
            ? { answers: { question: "Literal $& {answer}" } }
            : {}),
      },
    });
  },
);
it.each(cases)("preserves raw pending %s collision", async (action, english) => {
  setup();
  fixture[action].mockResolvedValue(AsyncResult.failure(Cause.fail(new Error(english))));
  const value = projection(action === "approval", true, action === "dismiss");
  await using screen = await render(surface("en", value, action));
  await screen.getByRole("button", { name: "Respond" }).click();
  await screen.rerender(surface("zh-CN", value, action));
  await expect.poll(() => screen.container.textContent).toContain(english);
  expect(fixture[action]).toHaveBeenCalledTimes(1);
});
it.each(["approval", "input"] as const)("keeps %s permission denial silent", async (action) => {
  setup();
  fixture.allowed = false;
  await using screen = await render(surface("en", projection(action === "approval"), action));
  await screen.getByRole("button", { name: "Respond" }).click();
  expect(fixture[action]).not.toHaveBeenCalled();
});

it("keeps owned attachment wait current without submitting or consuming the draft", async () => {
  setup();
  const previousDrafts = useComposerDraftStore.getState();
  const previousUploads = useAttachmentUploadStore.getState();
  using _restore = {
    [Symbol.dispose]() {
      useComposerDraftStore.setState(previousDrafts, true);
      useAttachmentUploadStore.setState(previousUploads, true);
    },
  };
  const target = questionAttachmentDraftId(ref.environmentId, ref.threadId, requestId, "question");
  useComposerDraftStore.getState().addFiles(
    target,
    [
      {
        type: "file",
        id: "literal-file",
        name: "Literal $& {file}.txt",
        mimeType: "text/plain",
        sizeBytes: 1,
        file: null,
        uploadedAttachmentId: "fixture-attachment",
        uploadEnvironmentId: ref.environmentId,
      },
    ],
    { appendReference: false },
  );
  useAttachmentUploadStore.setState({
    uploadsByImageId: {
      "literal-file": {
        status: "ready",
        environmentId: ref.environmentId,
        attachmentId: "fixture-attachment",
      },
    },
  });
  const value = projection(false);
  await using screen = await render(surface("en", value, "input"));
  await screen.getByRole("button", { name: "Respond" }).click();
  await expect.poll(() => fixture.uploaded.mock.calls.length).toBe(1);
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale, value, "input"));
    await expect
      .poll(() => screen.container.textContent)
      .toContain(
        locale === "en"
          ? "Wait for attachments to finish uploading, or remove failed uploads."
          : "请等待附件上传完成，或移除上传失败的附件。",
      );
  }
  expect(fixture.input).not.toHaveBeenCalled();
  expect(fixture.uploaded).toHaveBeenCalledTimes(1);
  expect(useComposerDraftStore.getState().getComposerDraft(target)?.files[0]?.name).toBe(
    "Literal $& {file}.txt",
  );
});
it.each(["empty", "interrupted"] as const)(
  "keeps pending input %s failure silent",
  async (kind) => {
    setup();
    let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    fixture.input.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await using screen = await render(surface("en", projection(false), "input"));
    await screen.getByRole("button", { name: "Respond" }).click();
    await expect.poll(() => fixture.input.mock.calls.length).toBe(1);
    await expect.element(screen.getByRole("button", { name: "Respond" })).toBeDisabled();
    finish(
      AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(new Error(""))),
    );
    await expect.element(screen.getByRole("button", { name: "Respond" })).toBeEnabled();
    expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
  },
);

it.each(["approval", "input"] as const)("keeps non-resumable %s unanswered", async (action) => {
  setup();
  await using screen = await render(
    surface("en", projection(action === "approval", false), action),
  );
  if (action === "approval") await screen.getByRole("button", { name: "Respond" }).click();
  else await expect.element(screen.getByRole("button", { name: "Respond" })).toBeDisabled();
  expect(fixture[action]).not.toHaveBeenCalled();
});

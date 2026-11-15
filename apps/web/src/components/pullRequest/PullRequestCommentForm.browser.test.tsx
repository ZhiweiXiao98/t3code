import { createRef } from "react";
import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestDetailView,
  type PullRequestRef,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { PullRequestCommentForm } from "./PullRequestCommentForm";
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  queue: vi.fn<(submit: (text: string) => void) => void>(),
  cancel: vi.fn(),
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("~/speech/useTextFieldSpeech", () => ({
  TextFieldSpeechControls: () => null,
  useTextFieldSpeech: () => ({
    blocksSubmission: true,
    submitAfterDictation: mocks.queue,
    cancel: mocks.cancel,
  }),
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => mocks.post }));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: mocks.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = mocks.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
const detail: PullRequestDetailView = {
  provider: SourceControlProviderKind.make("github"),
  projectId: ProjectId.make("project"),
  projectTitle: "Project",
  workspaceRoot: "/workspace",
  repository: "owner/repo",
  number: 1,
  title: "Test pull request",
  body: "Original description",
  url: "https://github.com/owner/repo/pull/1",
  author: { login: "author", name: null, avatarUrl: null },
  viewer: "author",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  headBranch: "feature",
  baseBranch: "main",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  reviewers: [],
  labels: [],
  checks: [{ name: "Unit tests", status: "success", description: null, url: null }],
  comments: [],
  commentCount: 0,
  commentsTruncated: false,
  reviewThreads: [],
  commits: [],
  mergeCapabilities: { merge: false, squash: false, rebase: false },
  capabilities: {
    diff: true,
    comment: true,
    search: true,
    actions: [],
    mergeMethods: [],
    review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
    reviewers: { request: false, listCandidates: false },
    edit: { changeRequest: true, comment: true },
  },
  viewerPermissions: {
    actions: [],
    comment: true,
    resolve: false,
    verdicts: [],
    requestReviewers: false,
  },
};

const reference: PullRequestRef = {
  projectId: detail.projectId,
  repository: detail.repository,
  number: detail.number,
};

function setup() {
  mocks.post.mockReset();
  mocks.queue.mockReset();
  mocks.cancel.mockClear();
  mocks.toast.mockClear();
  mocks.locale = "en";
}
function fixture() {
  const ref = createRef<HTMLTextAreaElement>();
  const commented = vi.fn();
  const close = vi.fn();
  const action = vi.fn().mockResolvedValue({ commentPosted: false });
  return {
    commented,
    close,
    action,
    surface: (locale: "en" | "zh-CN", actionPending = false) => {
      mocks.locale = locale;
      return (
        <WebI18nContext
          value={{
            locale,
            appLocale: locale,
            setAppLocale: () => {},
            t: (key, values) => translateWebMessage(locale, key, values),
          }}
        >
          <PullRequestCommentForm
            active
            environmentId={EnvironmentId.make("comment-env")}
            reference={reference}
            detail={detail}
            actionPending={actionPending}
            textareaRef={ref}
            onCommentAction={action}
            onCommented={commented}
            onClose={close}
          />
        </WebI18nContext>
      );
    },
  };
}
it.each([
  ["owned", null],
  ["raw", new Error("Could not post the comment")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)("uses settlement locale for comment posting failure: %s", async (kind, failure) => {
  setup();
  const f = fixture();
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result = import("@t3tools/client-runtime/state/runtime").AtomCommandResult<void, unknown>;
  let finish = (_result: Result) => {};
  mocks.post.mockReturnValueOnce(
    new Promise<Result>((resolve) => {
      finish = resolve;
    }),
  );
  const draft = "  Literal $& {comment}\nbody  ";
  await using screen = await render(f.surface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await userEvent.fill(screen.getByRole("textbox"), draft);
  await screen.getByRole("button", { name: "Comment", exact: true }).click();
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  await act(async () => {
    mocks.queue.mock.calls[0]![0](draft);
  });
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith({
    environmentId: EnvironmentId.make("comment-env"),
    input: { ...reference, body: draft.trim() },
  });
  const posting = screen.getByRole("button", { name: "Posting...", exact: true });
  await expect.element(posting).toBeDisabled();
  await expect.element(screen.getByRole("textbox")).toBeDisabled();
  await act(async () => {
    posting.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  expect(mocks.toast).not.toHaveBeenCalled();
  await screen.rerender(f.surface("zh-CN"));
  await act(async () => {
    finish(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure)));
    await Promise.resolve();
  });
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({ type: "error", title: "无法发布评论" });
  await expect.element(screen.getByRole("button", { name: "评论", exact: true })).toBeEnabled();
  await expect.element(screen.getByRole("textbox")).toBeEnabled();
  await expect.element(screen.getByRole("textbox")).toHaveValue(draft);
  expect(f.commented).not.toHaveBeenCalled();
  expect(f.close).not.toHaveBeenCalled();
  expect(f.action).not.toHaveBeenCalled();
  await screen.rerender(f.surface("en"));
  expect(mocks.toast).toHaveBeenCalledTimes(1);
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("keeps blank completion and pending action comment guards", async () => {
  setup();
  const f = fixture();
  await using screen = await render(f.surface("en"));
  await screen.getByRole("button", { name: "Comment", exact: true }).click();
  await act(async () => {
    mocks.queue.mock.calls[0]![0]("  \n ");
  });
  expect(mocks.post).not.toHaveBeenCalled();
  await screen.rerender(f.surface("en", true));
  const button = screen.getByRole("button", { name: "Comment", exact: true });
  await expect.element(button).toBeDisabled();
  await expect.element(screen.getByRole("textbox")).toBeDisabled();
  await act(async () => {
    button.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(f.action).not.toHaveBeenCalled();
  expect(f.close).not.toHaveBeenCalled();
  expect(f.commented).not.toHaveBeenCalled();
});

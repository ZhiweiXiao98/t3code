import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { readableFailure } from "./pullRequestDetail.logic";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { createRef, useRef, useState } from "react";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { PullRequestReviewForm } from "./PullRequestReviewForm";
import { pullRequestReviewKey, usePullRequestReviewStore } from "./pullRequestReviewStore";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
  submit: vi.fn().mockResolvedValue({ _tag: "Success" }),
  queue: vi.fn<(submit: (text: string) => void) => void>(),
}));
vi.mock("~/speech/useTextFieldSpeech", () => ({
  TextFieldSpeechControls: () => null,
  useTextFieldSpeech: () => ({ blocksSubmission: true, submitAfterDictation: mocks.queue }),
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => mocks.submit }));
vi.mock(import("~/state/pullRequests"), async (original) => ({
  ...(await original()),
  pullRequestEnvironment: { submitReview: {} } as never,
}));

it("submits only the line comments still in the draft when dictation finishes", async () => {
  mocks.submit.mockReset().mockResolvedValue({ _tag: "Success" });
  mocks.queue.mockReset();
  const reference = { projectId: ProjectId.make("test"), repository: "test/repo", number: 1 };
  const key = pullRequestReviewKey(reference);
  const store = usePullRequestReviewStore.getState();
  store.clear(key);
  store.addComment(key, {
    id: "removed",
    body: "Do not post",
    path: "a.ts",
    position: { kind: "added", newLine: 1 },
  });
  await using screen = await render(
    <PullRequestReviewForm
      active
      environmentId={EnvironmentId.make("test")}
      reference={reference}
      completionScope={null}
      term="pull request"
      verdicts={["comment"]}
      requestChangesSummaryRequired={false}
      textareaRef={createRef()}
      pending={false}
      onPendingChange={vi.fn()}
      onSubmitted={vi.fn()}
    />,
  );
  await screen.getByRole("button", { name: "Submit review" }).click();
  await act(() => store.clear(key));
  await act(() => mocks.queue.mock.calls[0]![0]("Dictated summary"));
  expect(mocks.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ body: "Dictated summary", comments: [] }),
    }),
  );
});

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
const reviewRef = {
  projectId: ProjectId.make("review-project"),
  repository: "literal/repo",
  number: 42,
};
const reviewKey = pullRequestReviewKey(reviewRef);
function PendingReview({
  onSubmitted,
  onPending,
}: {
  onSubmitted: () => void;
  onPending: (pending: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <PullRequestReviewForm
      active
      environmentId={EnvironmentId.make("review-env")}
      reference={reviewRef}
      completionScope={null}
      term="pull request"
      verdicts={["comment"]}
      requestChangesSummaryRequired={false}
      textareaRef={textareaRef}
      pending={pending}
      onPendingChange={(value) => {
        onPending(value);
        setPending(value);
      }}
      onSubmitted={onSubmitted}
    />
  );
}
function reviewSurface(
  locale: "en" | "zh-CN",
  submitted: () => void,
  pending: (value: boolean) => void,
) {
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
      <PendingReview onSubmitted={submitted} onPending={pending} />
    </WebI18nContext>
  );
}
it.each([
  ["owned", null],
  ["raw", new Error("The review could not be submitted")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)("uses settlement locale for review submission failure: %s", async (kind, failure) => {
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  mocks.submit.mockReset();
  mocks.queue.mockReset();
  mocks.toast.mockClear();
  const before = usePullRequestReviewStore.getState();
  using _store = {
    [Symbol.dispose]() {
      usePullRequestReviewStore.setState(before, true);
    },
  };
  const summary = "Literal $& {review}\nsummary";
  const comment = {
    id: "literal-comment",
    body: "Literal $& {line}",
    path: "src/a.ts",
    position: { kind: "added" as const, newLine: 1 },
  };
  before.clear(reviewKey);
  before.setSummary(reviewKey, summary);
  before.addComment(reviewKey, comment);
  const drafts = usePullRequestReviewStore.getState().drafts[reviewKey];
  type Result = import("@t3tools/client-runtime/state/runtime").AtomCommandResult<void, unknown>;
  let finish = (_result: Result) => {};
  mocks.submit.mockReturnValueOnce(
    new Promise<Result>((resolve) => {
      finish = resolve;
    }),
  );
  const submitted = vi.fn();
  const pending = vi.fn();
  await using screen = await render(reviewSurface("en", submitted, pending));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await screen.getByRole("button", { name: "Submit review", exact: true }).click();
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  await act(async () => {
    mocks.queue.mock.calls[0]![0](summary);
  });
  expect(mocks.submit).toHaveBeenCalledExactlyOnceWith({
    environmentId: EnvironmentId.make("review-env"),
    input: { ...reviewRef, verdict: "comment", body: summary, comments: [comment] },
  });
  expect(pending).toHaveBeenCalledExactlyOnceWith(true);
  const submitButton = screen.getByRole("button", { name: "Submitting...", exact: true });
  await expect.element(submitButton).toBeDisabled();
  await act(async () => {
    submitButton
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  await screen.rerender(reviewSurface("zh-CN", submitted, pending));
  const result: Result = AsyncResult.failure(
    kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure),
  );
  await act(async () => {
    finish(result);
    await Promise.resolve();
  });
  const hint = "托管平台拒绝了此审查。草稿仍保留，你可以重试。";
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法提交评审",
    description:
      kind === "raw"
        ? "The review could not be submitted"
        : kind === "interrupted"
          ? readableFailure(squashAtomCommandFailure(result), hint)
          : hint,
  });
  expect(pending.mock.calls).toEqual([[true], [false]]);
  expect(submitted).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("button", { name: "提交评审", exact: true })).toBeEnabled();
  expect(usePullRequestReviewStore.getState().drafts[reviewKey]).toBe(drafts);
  expect(usePullRequestReviewStore.getState().summaries[reviewKey]).toBe(summary);
  await screen.rerender(reviewSurface("en", submitted, pending));
  expect(mocks.toast).toHaveBeenCalledTimes(1);
  expect(mocks.submit).toHaveBeenCalledTimes(1);
});
it("does not submit an empty review after dictation completes", async () => {
  mocks.submit.mockReset();
  mocks.queue.mockReset();
  mocks.toast.mockClear();
  const before = usePullRequestReviewStore.getState();
  using _store = {
    [Symbol.dispose]() {
      usePullRequestReviewStore.setState(before, true);
    },
  };
  before.clear(reviewKey);
  before.setSummary(reviewKey, "");
  const submitted = vi.fn();
  const pending = vi.fn();
  await using screen = await render(reviewSurface("en", submitted, pending));
  await screen.getByRole("button", { name: "Submit review", exact: true }).click();
  await act(async () => {
    mocks.queue.mock.calls[0]![0]("  ");
  });
  expect(mocks.submit).not.toHaveBeenCalled();
  expect(pending).not.toHaveBeenCalled();
  expect(submitted).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
});

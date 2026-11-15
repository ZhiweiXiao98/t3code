import { pullRequestEnvironment } from "~/state/pullRequests";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestDetailView,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import "../../index.css";
import { PullRequestTimelineTab } from "./PullRequestTimelineTab";

const COMMITS = 2000;

const detail: PullRequestDetailView = {
  provider: SourceControlProviderKind.make("github"),
  projectId: ProjectId.make("project"),
  projectTitle: "Project",
  workspaceRoot: "/workspace",
  repository: "owner/repo",
  number: 1,
  title: "Huge pull request",
  body: "",
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
  checks: [],
  comments: [],
  commentCount: 0,
  commentsTruncated: false,
  reviewThreads: [],
  commits: Array.from({ length: COMMITS }, (_, index) => ({
    oid: `${index.toString(16).padStart(7, "0")}${"0".repeat(33)}`,
    messageHeadline: `Commit number ${index}`,
    committedDate: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
  })),
  mergeCapabilities: { merge: false, squash: false, rebase: false },
  capabilities: {
    diff: true,
    comment: true,
    search: true,
    actions: [],
    mergeMethods: [],
    review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
    reviewers: { request: false, listCandidates: false },
    edit: { changeRequest: false, comment: false },
  },
  viewerPermissions: {
    actions: [],
    comment: false,
    resolve: false,
    verdicts: [],
    requestReviewers: false,
  },
};

it("mounts only the timeline rows near the viewport of a huge pull request", async () => {
  await using screen = await render(
    <div style={{ height: 600 }}>
      <PullRequestTimelineTab
        scrollerRef={() => {}}
        detail={detail}
        environmentId={EnvironmentId.make("environment")}
        reference={detail}
        order="oldest"
        onOpenCommit={() => {}}
        onRefresh={() => {}}
      />
    </div>,
  );
  await expect.element(screen.getByText("Commit number 0")).toBeVisible();
  const mounted = screen.container.querySelectorAll("button").length;
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(COMMITS / 10);
});

it.each(["review", "issue-comment", "resolved-reply"] as const)(
  "reveals a linked %s below the virtual viewport",
  async (kind) => {
    const url = `${detail.url}#${kind === "review" ? "pullrequestreview-123" : kind === "issue-comment" ? "issuecomment-123" : "discussion_r123"}`;
    const linkedDetail: PullRequestDetailView = {
      ...detail,
      comments:
        kind === "resolved-reply"
          ? []
          : [
              {
                id: "linked",
                kind,
                author: detail.author,
                body: "Linked reply",
                createdAt: "2026-10-01T00:00:00Z",
                url,
                path: null,
                reviewState: kind === "review" ? "CHANGES_REQUESTED" : null,
              },
            ],
      reviewThreads:
        kind !== "resolved-reply"
          ? []
          : [
              {
                id: "thread",
                path: "src/test.ts",
                line: 5,
                side: "right",
                isResolved: true,
                isOutdated: false,
                comments: [
                  {
                    id: "root",
                    author: detail.author,
                    body: "Root comment",
                    createdAt: "2026-10-01T00:00:00Z",
                    url: `${detail.url}#discussion_r122`,
                  },
                  {
                    id: "reply",
                    author: detail.author,
                    body: "Linked reply",
                    createdAt: "2026-10-01T00:01:00Z",
                    url,
                  },
                ],
              },
            ],
    };
    const settled = vi.fn();
    await using screen = await render(
      <div style={{ height: 600 }}>
        <PullRequestTimelineTab
          scrollerRef={() => {}}
          detail={linkedDetail}
          environmentId={EnvironmentId.make("environment")}
          reference={detail}
          order="oldest"
          onOpenCommit={() => {}}
          onRefresh={() => {}}
          revealUrl={url}
          onRevealSettled={settled}
        />
      </div>,
    );
    await expect.element(screen.getByText("Linked reply", { exact: true })).toBeVisible();
    await vi.waitFor(() => expect(settled).toHaveBeenCalledWith(url));
    await screen.rerender(
      <div style={{ height: 600 }}>
        <PullRequestTimelineTab
          scrollerRef={() => {}}
          detail={linkedDetail}
          environmentId={EnvironmentId.make("environment")}
          reference={detail}
          order="oldest"
          onOpenCommit={() => {}}
          onRefresh={() => {}}
          onRevealSettled={settled}
        />
      </div>,
    );
    await expect.element(screen.getByText("Linked reply", { exact: true })).toBeVisible();
  },
);

it("localizes owned timeline verbs while preserving comment text and author", async () => {
  const body = "commented {literal}/$&";
  const localizedDetail: PullRequestDetailView = {
    ...detail,
    commits: [],
    comments: [
      {
        id: "opaque",
        kind: "issue-comment",
        author: { login: "reviewed", name: null, avatarUrl: null },
        body,
        createdAt: detail.createdAt,
        url: `${detail.url}#issuecomment-7`,
        path: null,
        reviewState: null,
      },
    ],
  };
  const surface = (locale: "en" | "zh-CN", revealUrl?: string) => (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <div style={{ height: 600 }}>
        <PullRequestTimelineTab
          scrollerRef={() => {}}
          detail={localizedDetail}
          environmentId={EnvironmentId.make("environment")}
          reference={detail}
          order="oldest"
          {...(revealUrl ? { revealUrl } : {})}
          onOpenCommit={() => {}}
          onRefresh={() => {}}
        />
      </div>
    </WebI18nContext>
  );
  await using screen = await render(surface("en", `${detail.url}#issuecomment-999`));
  await userEvent.click(screen.getByRole("button", { name: /^1 comments\b/ }));
  await expect.element(screen.getByText("commented", { exact: true })).toBeVisible();
  await screen.rerender(surface("zh-CN"));
  await expect.element(screen.getByText("发表了评论", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("已加载的动态中没有此链接对应的项目。")).toBeVisible();
  await expect.element(screen.getByText(body, { exact: true })).toBeVisible();
  await expect.element(screen.getByText("reviewed", { exact: true })).toBeVisible();
  await screen.rerender(surface("en"));
  await expect.element(screen.getByText("commented", { exact: true })).toBeVisible();
});

const editing = vi.hoisted(() => ({
  update: vi.fn(),
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: editing.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = editing.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
vi.mock(import("~/state/use-atom-command"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    useAtomCommand: ((command: unknown, options: unknown) =>
      command === pullRequestEnvironment.updateComment
        ? editing.update
        : actual.useAtomCommand(
            command as never,
            options as never,
          )) as typeof actual.useAtomCommand,
  };
});
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
  useEnvironmentScope: () => true,
}));
const editableDetail: PullRequestDetailView = {
  ...detail,
  commits: [],
  commentCount: 1,
  capabilities: { ...detail.capabilities, edit: { changeRequest: false, comment: true } },
  comments: [
    {
      id: "timeline-comment",
      kind: "issue-comment",
      path: null,
      reviewState: null,
      author: detail.author,
      body: "Original timeline comment",
      createdAt: detail.createdAt,
      url: `${detail.url}#issuecomment-42`,
    },
  ],
};
function editSurface(locale: "en" | "zh-CN", refresh: () => void, allowed = true) {
  editing.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <div style={{ height: 600 }}>
        <PullRequestTimelineTab
          scrollerRef={() => {}}
          detail={
            allowed
              ? editableDetail
              : {
                  ...editableDetail,
                  capabilities: {
                    ...editableDetail.capabilities,
                    edit: { changeRequest: false, comment: false },
                  },
                }
          }
          environmentId={EnvironmentId.make("environment")}
          reference={detail}
          order="oldest"
          onOpenCommit={() => {}}
          onRefresh={refresh}
        />
      </div>
    </WebI18nContext>
  );
}
it.each([
  ["owned", null],
  ["raw", new Error("Could not save the comment")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)("uses settlement locale for timeline comment failure: %s", async (kind, failure) => {
  editing.update.mockReset();
  editing.toast.mockClear();
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result = import("@t3tools/client-runtime/state/runtime").AtomCommandResult<void, unknown>;
  let finish = (_result: Result) => {};
  editing.update.mockReturnValueOnce(
    new Promise<Result>((resolve) => {
      finish = resolve;
    }),
  );
  const refresh = vi.fn();
  const draft = "Literal $& {timeline}\ncomment";
  await using screen = await render(editSurface("en", refresh));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await userEvent.click(screen.getByRole("button", { name: /^1 comments\b/ }));
  await userEvent.click(screen.getByRole("button", { name: "Edit comment", exact: true }));
  await userEvent.fill(screen.getByRole("textbox", { name: "Edit comment", exact: true }), draft);
  await userEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await expect
    .element(screen.getByRole("button", { name: "Saving...", exact: true }))
    .toBeDisabled();
  expect(editing.update).toHaveBeenCalledExactlyOnceWith({
    environmentId: EnvironmentId.make("environment"),
    input: { ...detail, commentId: "timeline-comment", kind: "issue-comment", body: draft },
  });
  expect(editing.toast).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  await screen.rerender(editSurface("zh-CN", refresh));
  await act(async () => {
    finish(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure)));
    await Promise.resolve();
  });
  expect(editing.toast).toHaveBeenCalledExactlyOnceWith({ type: "error", title: "无法保存评论" });
  await expect.element(screen.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await expect
    .element(screen.getByRole("textbox", { name: "编辑评论", exact: true }))
    .toHaveValue(draft);
  expect(refresh).not.toHaveBeenCalled();
  await screen.rerender(editSurface("en", refresh));
  expect(editing.toast).toHaveBeenCalledTimes(1);
  expect(editing.update).toHaveBeenCalledTimes(1);
});
it("keeps timeline comment edit capability and Escape controls", async () => {
  editing.update.mockReset();
  editing.toast.mockClear();
  const refresh = vi.fn();
  await using screen = await render(editSurface("en", refresh, false));
  await userEvent.click(screen.getByRole("button", { name: /^1 comments\b/ }));
  await expect
    .element(screen.getByRole("button", { name: "Edit comment", exact: true }))
    .not.toBeInTheDocument();
  await screen.rerender(editSurface("en", refresh));
  await userEvent.click(screen.getByRole("button", { name: "Edit comment", exact: true }));
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Edit comment", exact: true }),
    "Discard {literal}",
  );
  await userEvent.keyboard("{Escape}");
  await expect
    .element(screen.getByRole("textbox", { name: "Edit comment", exact: true }))
    .not.toBeInTheDocument();
  expect(editing.update).not.toHaveBeenCalled();
  expect(editing.toast).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});

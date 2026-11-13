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

import { render } from "../../../test/render";
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

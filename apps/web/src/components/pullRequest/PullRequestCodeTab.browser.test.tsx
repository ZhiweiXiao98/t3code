import type { ReactNode } from "react";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestDetailView,
  type PullRequestDiffResult,
  type PullRequestRef,
  type PullRequestReviewThread,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { getClientSettings, __setClientSettingsForTests } from "../../hooks/useSettings";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";

const { diffAtom, pagedDiffAtom } = await vi.hoisted(async () => {
  const { AsyncResult, Atom } = await import("effect/reactivity");
  const filePatch = (path: string) =>
    [
      `diff --git a/${path} b/${path}`,
      "index 1111111..2222222 100644",
      `--- a/${path}`,
      `+++ b/${path}`,
      "@@ -1,6 +1,6 @@",
      "-before()",
      "+after()",
      " one()",
      " two()",
      " three()",
      " four()",
      " five()",
      "",
    ].join("\n");
  const firstPage: PullRequestDiffResult = {
    patch: filePatch("a.ts"),
    truncated: false,
    nextCursor: null,
  };
  const pages: Record<string, PullRequestDiffResult> = {
    first: {
      patch: Array.from({ length: 40 }, (_, index) =>
        filePatch(index === 1 ? "early-1.test.ts" : `early-${index}.ts`),
      ).join(""),
      truncated: true,
      nextCursor: "page-2",
    },
    "page-2": {
      patch: filePatch("late.test.ts"),
      truncated: false,
      nextCursor: null,
    },
  };
  return {
    // An environment query whose refetch returns equal content hands back the previous value
    // itself, so a refresh publishes a new result around the very same page.
    diffAtom: Atom.make(() => AsyncResult.success(firstPage)),
    pagedDiffAtom: Atom.family((cursor: string) =>
      Atom.make(() => AsyncResult.success(pages[cursor]!)),
    ),
  };
});

const mocks = vi.hoisted(() => ({
  loadComments: vi.fn(),
  resolution: vi.fn(),
  reply: vi.fn(),
  edit: vi.fn(),
  speechQueue: vi.fn<(submit: (text: string) => void) => void>(),
  speechCancel: vi.fn(),
  writeAllowed: true,
  otherCommand: vi.fn(),
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
  paged: false,
  diffCommits: [] as Array<string | undefined>,
  viewedPaths: null as ReadonlySet<string> | null,
  viewedListeners: new Set<() => void>(),
}));

function deliverViewedPaths(paths: ReadonlySet<string> | null) {
  mocks.viewedPaths = paths;
  for (const listener of mocks.viewedListeners) listener();
}

vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: unknown) =>
    command === pullRequestEnvironment.threadComments
      ? mocks.loadComments
      : command === pullRequestEnvironment.setThreadResolution
        ? mocks.resolution
        : command === pullRequestEnvironment.replyToThread
          ? mocks.reply
          : command === pullRequestEnvironment.updateComment
            ? mocks.edit
            : mocks.otherCommand) as never,
}));
vi.mock("~/speech/useTextFieldSpeech", async (original) => ({
  ...(await original<typeof import("~/speech/useTextFieldSpeech")>()),
  TextFieldSpeechControls: () => null,
  SpeechTextField: ({
    children,
  }: {
    children: (speech: {
      freezesEditor: boolean;
      blocksSubmission: boolean;
      preparing: boolean;
      state: { phase: "idle" };
      submitAfterDictation: typeof mocks.speechQueue;
      cancel: typeof mocks.speechCancel;
    }) => ReactNode;
  }) =>
    children({
      freezesEditor: false,
      blocksSubmission: true,
      preparing: false,
      state: { phase: "idle" },
      submitAfterDictation: mocks.speechQueue,
      cancel: mocks.speechCancel,
    }),
}));
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: () => mocks.writeAllowed,
  readEnvironmentScope: () => mocks.writeAllowed,
}));
vi.mock(import("./usePullRequestFilesViewed"), async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    mocks.viewedListeners.add(listener);
    return () => mocks.viewedListeners.delete(listener);
  };
  return {
    usePullRequestFilesViewed: () => {
      const viewedPaths = useSyncExternalStore(subscribe, () => mocks.viewedPaths);
      return {
        enabled: viewedPaths !== null,
        isViewed: (path: string) => viewedPaths?.has(path) === true,
        isStale: () => false,
        setViewed: (path: string, viewed: boolean) => {
          const next = new Set(mocks.viewedPaths);
          if (viewed) next.add(path);
          else next.delete(path);
          deliverViewedPaths(next);
        },
        truncated: false,
        error: null,
        refresh: () => {},
      };
    },
  };
});
vi.mock(import("~/state/pullRequests"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    pullRequestEnvironment: {
      ...actual.pullRequestEnvironment,
      diff: (({ input }: { input: { cursor?: string; commit?: string } }) => {
        mocks.diffCommits.push(input.commit);
        return mocks.paged ? pagedDiffAtom(input.cursor ?? "first") : diffAtom;
      }) as never,
    },
  };
});

import { act, render } from "../../../test/render";
import PullRequestCodeTab from "./PullRequestCodeTab";

const detail: PullRequestDetailView = {
  provider: SourceControlProviderKind.make("github"),
  projectId: ProjectId.make("project"),
  projectTitle: "Project",
  workspaceRoot: "/workspace",
  repository: "owner/repo",
  number: 1,
  title: "Test pull request",
  body: "",
  url: "https://github.com/owner/repo/pull/1",
  author: { login: "author", name: null, avatarUrl: null },
  viewer: "author",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 1,
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
  commits: [],
  mergeCapabilities: { merge: false, squash: false, rebase: false },
  capabilities: {
    diff: true,
    comment: false,
    search: true,
    actions: [],
    mergeMethods: [],
    review: {
      inlineComment: false,
      reply: false,
      resolve: false,
      verdicts: [],
    },
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

function setup({ paged }: { paged: boolean }) {
  window.localStorage.removeItem("t3code.diffHideTestFiles");
  __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
  mocks.paged = paged;
  mocks.diffCommits = [];
  mocks.viewedPaths = null;
  mocks.viewedListeners.clear();
}

const tab = (
  refreshToken: number,
  revealRequest: {
    readonly path: string;
    readonly nonce: number;
  } | null = null,
  revealUrl?: string,
  onRevealSettled?: (url: string) => void,
) => (
  <PullRequestCodeTab
    scrollerRef={() => {}}
    environmentId={EnvironmentId.make("environment")}
    reference={detail}
    detail={detail}
    selectedCommitOid={null}
    onSelectedCommitChange={() => {}}
    onRefresh={() => {}}
    refreshToken={refreshToken}
    revealRequest={revealRequest}
    revealUrl={revealUrl}
    onRevealSettled={onRevealSettled}
  />
);

it("keeps the diff after a refresh that brings back the same page", async () => {
  setup({ paged: false });
  const container = document.createElement("div");
  container.className = "flex h-[700px] w-[900px]";
  await using screen = await render(tab(0), { container });
  await expect.element(screen.getByText("1 file", { exact: true })).toBeVisible();

  await screen.rerender(tab(1));

  await expect
    .element(screen.getByText("This pull request has no file changes."))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("1 file", { exact: true })).toBeVisible();
});

it("restores saved Viewed folds, follows cleared marks, and allows explicit expansion", async () => {
  setup({ paged: false });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    diffFilesCollapsed: false,
  });
  using _preferences = {
    [Symbol.dispose]() {
      __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
    },
  };
  mocks.viewedPaths = new Set(["a.ts"]);
  const container = document.createElement("div");
  container.className = "flex h-[700px] w-[900px]";
  await using screen = await render(tab(0), { container });
  await expect.element(screen.getByRole("checkbox", { name: "Viewed" })).toBeChecked();
  await expect
    .element(screen.getByRole("button", { name: "Expand diff", exact: true }))
    .toHaveAttribute("aria-expanded", "false");

  await screen.getByRole("button", { name: "Expand diff", exact: true }).click();
  await expect.element(screen.getByText("three()", { exact: true })).toBeVisible();
  screen.getByRole("checkbox", { name: "Viewed" }).element().focus();
  await userEvent.keyboard(" ");
  await expect.element(screen.getByRole("checkbox", { name: "Viewed" })).not.toBeChecked();
  await expect.element(screen.getByText("three()", { exact: true })).toBeVisible();
  screen.getByRole("checkbox", { name: "Viewed" }).element().focus();
  await userEvent.keyboard(" ");
  await expect
    .element(screen.getByRole("button", { name: "Expand diff", exact: true }))
    .toHaveAttribute("aria-expanded", "false");

  deliverViewedPaths(new Set());
  await expect.element(screen.getByRole("checkbox", { name: "Viewed" })).not.toBeChecked();
  await expect.element(screen.getByText("three()", { exact: true })).toBeVisible();
  deliverViewedPaths(new Set(["a.ts"]));
  await expect
    .element(screen.getByRole("button", { name: "Expand diff", exact: true }))
    .toHaveAttribute("aria-expanded", "false");
  await screen.getByRole("button", { name: "Expand all files", exact: true }).click();
  await expect.element(screen.getByText("three()", { exact: true })).toBeVisible();

  await screen.rerender(<div />);
  await screen.rerender(tab(1));
  await expect
    .element(screen.getByRole("button", { name: "Expand diff", exact: true }))
    .toHaveAttribute("aria-expanded", "false");
});

// regression: #13279 a Viewed answer that lands after a link reveals a file must not fold it
it("keeps a revealed file open when its Viewed mark loads afterwards", async () => {
  setup({ paged: false });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    diffFilesCollapsed: false,
  });
  using _preferences = {
    [Symbol.dispose]() {
      __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
    },
  };
  mocks.viewedPaths = new Set();
  const container = document.createElement("div");
  container.className = "flex h-[700px] w-[900px]";
  await using screen = await render(tab(0, { path: "a.ts", nonce: 1 }), {
    container,
  });
  await expect.element(screen.getByText("three()", { exact: true })).toBeVisible();

  deliverViewedPaths(new Set(["a.ts"]));
  await expect.element(screen.getByRole("checkbox", { name: "Viewed" })).toBeChecked();

  await expect
    .element(screen.getByRole("button", { name: "Collapse diff" }))
    .toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByText("three()", { exact: true })).toBeVisible();
});

function pagedContainer() {
  const container = document.createElement("div");
  container.className = "flex h-[500px] w-[900px]";
  return container;
}

async function expectFileHeaderShown(
  screen: Awaited<ReturnType<typeof render>>,
  container: HTMLElement,
  path: string,
) {
  const header = screen.getByText(path, { exact: true }).first();
  await expect.element(header).toBeInTheDocument();
  await vi.waitFor(() => {
    const bounds = container.querySelector(".diff-render-surface")!.getBoundingClientRect();
    const { top, bottom } = header.element().getBoundingClientRect();
    expect(top).toBeGreaterThanOrEqual(bounds.top);
    expect(bottom).toBeLessThanOrEqual(bounds.bottom);
  });
}

it("scrolls to a file asked for as the tab opens", async () => {
  setup({ paged: true });
  const container = pagedContainer();
  await using screen = await render(tab(0, { path: "early-39.ts", nonce: 1 }), {
    container,
  });

  await expectFileHeaderShown(screen, container, "early-39.ts");
});

it("pages forward to a file asked for that is not loaded yet, then scrolls to it", async () => {
  setup({ paged: true });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    diffFilesCollapsed: true,
  });
  using _preferences = {
    [Symbol.dispose]() {
      window.localStorage.removeItem("t3code.diffHideTestFiles");
      __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
    },
  };
  const container = pagedContainer();
  await using screen = await render(tab(0), { container });
  await expect.element(screen.getByText("early-0.ts", { exact: true }).first()).toBeVisible();
  await screen.getByRole("button", { name: "Hide test files" }).click();

  const url = `${detail.url}/files#diff-${bytesToHex(sha256(new TextEncoder().encode("late.test.ts")))}R4-R5`;
  const settled = vi.fn();
  await screen.rerender(tab(0, null, url, settled));

  await expectFileHeaderShown(screen, container, "late.test.ts");
  await expect.element(screen.getByText("three()", { exact: true })).toBeVisible();
  await vi.waitFor(() => expect(settled).toHaveBeenCalledWith(url));
  // A settled link keeps its test file past the filter, and a later click reveals it again.
  await screen.rerender(tab(0, { path: "early-0.ts", nonce: 1 }));
  await expectFileHeaderShown(screen, container, "early-0.ts");
  await screen.rerender(tab(0, { path: "early-0.ts", nonce: 1 }, url, settled));
  await expectFileHeaderShown(screen, container, "late.test.ts");
});

it("never requests the diff of a selected commit the pull request no longer has", async () => {
  setup({ paged: false });
  const container = document.createElement("div");
  container.className = "flex h-[700px] w-[900px]";
  // The timeline can open a commit that a force-push removed from the pull request.
  await using screen = await render(
    <PullRequestCodeTab
      scrollerRef={() => {}}
      environmentId={EnvironmentId.make("environment")}
      reference={detail}
      detail={{
        ...detail,
        commits: [
          {
            oid: "kept",
            messageHeadline: "Kept commit",
            committedDate: "2026-09-01T00:00:00Z",
          },
        ],
      }}
      selectedCommitOid="gone"
      onSelectedCommitChange={() => {}}
      onRefresh={() => {}}
    />,
    { container },
  );

  await expect.element(screen.getByText("1 file", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Diff scope: All commits" }))
    .toBeVisible();
  expect(mocks.diffCommits).not.toContain("gone");
});

it("answers a commit's diff link only once that commit's diff is shown", async () => {
  setup({ paged: false });
  const container = document.createElement("div");
  container.className = "flex h-[700px] w-[900px]";
  const oid = "c".repeat(40);
  const withCommit = {
    ...detail,
    commits: [
      {
        oid,
        messageHeadline: "Linked commit",
        committedDate: "2026-09-01T00:00:00Z",
      },
    ],
  };
  const url = `${detail.url}/commits/${oid}#diff-${bytesToHex(sha256(new TextEncoder().encode("a.ts")))}R2`;
  const settled = vi.fn();
  const scoped = (selectedCommitOid: string | null, revealUrl?: string) => (
    <PullRequestCodeTab
      scrollerRef={() => {}}
      environmentId={EnvironmentId.make("environment")}
      reference={detail}
      detail={withCommit}
      selectedCommitOid={selectedCommitOid}
      onSelectedCommitChange={() => {}}
      onRefresh={() => {}}
      revealUrl={revealUrl}
      onRevealSettled={settled}
    />
  );
  await using screen = await render(scoped(null), { container });
  await expect.element(screen.getByText("1 file", { exact: true })).toBeVisible();

  // The panel selects the link's commit after this tab has already seen the link.
  await screen.rerender(scoped(null, url));
  expect(settled).not.toHaveBeenCalled();
  await screen.rerender(scoped(oid, url));
  await vi.waitFor(() => expect(settled).toHaveBeenCalledWith(url));
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
const commentsReference: PullRequestRef = {
  projectId: detail.projectId,
  repository: detail.repository,
  number: detail.number,
};
const orphan: PullRequestReviewThread = {
  id: "literal-thread",
  path: "absent-file.ts",
  line: null,
  side: "right",
  isResolved: false,
  isOutdated: false,
  commentCount: 2,
  nextCommentsCursor: "literal-$&-{cursor}",
  comments: [
    {
      id: "existing-comment",
      author: detail.author,
      body: "Literal $& {existing} comment",
      createdAt: detail.createdAt,
      url: null,
    },
  ],
};
function commentsSurface(
  locale: "en" | "zh-CN",
  refresh: () => void,
  hasCursor = true,
  resolution?: {
    resolved: boolean;
    capability: boolean;
    permission: boolean;
    threadAllowed: boolean;
  },
  actions?: { reply: boolean; commentPermission: boolean; edit: boolean },
) {
  mocks.locale = locale;
  const { nextCommentsCursor: _cursor, ...withoutCursor } = orphan;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <PullRequestCodeTab
        scrollerRef={() => {}}
        environmentId={EnvironmentId.make("environment")}
        reference={commentsReference}
        detail={{
          ...detail,
          ...(resolution
            ? {
                capabilities: {
                  ...detail.capabilities,
                  review: {
                    ...detail.capabilities.review,
                    resolve: resolution.capability,
                  },
                },
                viewerPermissions: {
                  ...detail.viewerPermissions,
                  resolve: resolution.permission,
                },
              }
            : {}),
          ...(actions
            ? {
                capabilities: {
                  ...detail.capabilities,
                  review: {
                    ...detail.capabilities.review,
                    reply: actions.reply,
                  },
                  edit: {
                    changeRequest: false,
                    ...detail.capabilities.edit,
                    comment: actions.edit,
                  },
                },
                viewerPermissions: {
                  ...detail.viewerPermissions,
                  comment: actions.commentPermission,
                },
              }
            : {}),
          reviewThreads: [
            {
              ...(hasCursor ? orphan : withoutCursor),
              ...(resolution
                ? {
                    isResolved: resolution.resolved,
                    canResolve: resolution.threadAllowed,
                  }
                : {}),
            },
          ],
        }}
        selectedCommitOid={null}
        onSelectedCommitChange={() => {}}
        onRefresh={refresh}
        refreshToken={0}
      />
    </WebI18nContext>
  );
}
it.each([
  ["owned", null],
  ["raw", new Error("More comments could not be loaded")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)(
  "uses settlement locale for review-thread comment loading failure: %s",
  async (kind, failure) => {
    const settings = getClientSettings();
    using _settings = {
      [Symbol.dispose]() {
        __setClientSettingsForTests(settings);
      },
    };
    setup({ paged: false });
    mocks.loadComments.mockReset();
    mocks.otherCommand.mockClear();
    mocks.toast.mockClear();
    const { AsyncResult } = await import("effect/reactivity");
    const Cause = await import("effect/Cause");
    type Result = import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
      import("@t3tools/contracts").PullRequestThreadCommentsResult,
      unknown
    >;
    let finish = (_result: Result) => {};
    mocks.loadComments.mockReturnValueOnce(
      new Promise<Result>((resolve) => {
        finish = resolve;
      }),
    );
    const refresh = vi.fn();
    await using screen = await render(commentsSurface("en", refresh), {
      container: pagedContainer(),
    });
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: /^Conversations not on the current diff/ }).click();
    await expect.element(screen.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
    await screen.getByRole("button", { name: "Load more comments", exact: true }).click();
    expect(mocks.loadComments).toHaveBeenCalledExactlyOnceWith({
      environmentId: EnvironmentId.make("environment"),
      input: {
        ...commentsReference,
        threadId: orphan.id,
        cursor: orphan.nextCommentsCursor,
      },
    });
    const loading = screen.getByRole("button", {
      name: "Loading…",
      exact: true,
    });
    await expect.element(loading).toBeDisabled();
    await act(async () => {
      loading.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(mocks.loadComments).toHaveBeenCalledTimes(1);
    await screen.rerender(commentsSurface("zh-CN", refresh));
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => {
      finish(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure)));
      await Promise.resolve();
    });
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法加载更多评论",
    });
    await expect
      .element(screen.getByRole("button", { name: "加载更多评论", exact: true }))
      .toBeEnabled();
    await expect.element(screen.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
    expect(mocks.otherCommand).not.toHaveBeenCalled();
    await screen.rerender(commentsSurface("en", refresh));
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.loadComments).toHaveBeenCalledTimes(1);
  },
);
it("omits comment pagination without a review-thread cursor", async () => {
  const settings = getClientSettings();
  using _settings = {
    [Symbol.dispose]() {
      __setClientSettingsForTests(settings);
    },
  };
  setup({ paged: false });
  mocks.loadComments.mockReset();
  mocks.otherCommand.mockClear();
  mocks.toast.mockClear();
  const refresh = vi.fn();
  await using screen = await render(commentsSurface("en", refresh, false), {
    container: pagedContainer(),
  });
  await screen.getByRole("button", { name: /^Conversations not on the current diff/ }).click();
  await expect.element(screen.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Load more comments", exact: true }))
    .not.toBeInTheDocument();
  expect(mocks.loadComments).not.toHaveBeenCalled();
  expect(mocks.otherCommand).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});

it.each([
  ["resolve owned", false, null],
  ["unresolve owned", true, null],
  ["raw", false, new Error("The conversation could not be updated")],
  ["empty", false, new Error("")],
  ["interrupted", false, undefined],
] as const)(
  "uses settlement locale for review-thread resolution failure: %s",
  async (kind, resolved, failure) => {
    const settings = getClientSettings();
    using _settings = {
      [Symbol.dispose]() {
        __setClientSettingsForTests(settings);
      },
    };
    setup({ paged: false });
    mocks.resolution.mockReset();
    mocks.otherCommand.mockClear();
    mocks.loadComments.mockReset();
    mocks.toast.mockClear();
    const { AsyncResult } = await import("effect/reactivity");
    const Cause = await import("effect/Cause");
    type Result = import("@t3tools/client-runtime/state/runtime").AtomCommandResult<void, unknown>;
    let finish = (_result: Result) => {};
    mocks.resolution.mockReturnValueOnce(
      new Promise<Result>((resolve) => {
        finish = resolve;
      }),
    );
    const refresh = vi.fn();
    const options = {
      resolved,
      capability: true,
      permission: true,
      threadAllowed: true,
    };
    const surface = (locale: "en" | "zh-CN") => commentsSurface(locale, refresh, false, options);
    await using screen = await render(surface("en"), {
      container: pagedContainer(),
    });
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: /^Conversations not on the current diff/ }).click();
    if (resolved) {
      await screen.getByRole("button", { name: /^Resolved ·/ }).click();
    }
    await expect.element(screen.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
    const action = screen.getByRole("button", {
      name: resolved ? "Unresolve" : "Resolve",
      exact: true,
    });
    await expect.element(action).toBeEnabled();
    // The action is inside animated overflow-hidden panels. Visibility/enabled
    // alone does not mean their clipping and hit target have settled yet.
    await expect
      .poll(() => {
        let ancestor: Element | null = action.element().parentElement;
        let panels = 0;
        while (ancestor) {
          if (ancestor.matches('[data-slot="collapsible-panel"]')) {
            panels++;
            if (
              !ancestor.hasAttribute("data-open") ||
              ancestor.hasAttribute("data-starting-style") ||
              ancestor.hasAttribute("data-ending-style") ||
              ancestor
                .getAnimations()
                .some(
                  (animation) =>
                    animation.playState !== "finished" && animation.playState !== "idle",
                )
            ) {
              return false;
            }
          }
          ancestor = ancestor.parentElement;
        }
        return panels > 0;
      })
      .toBe(true);
    // Diagnostic-only: observe delivery without changing the native click or its assertions.
    {
      using listeners = new DisposableStack();
      if (kind === "resolve owned") {
        const retained = action.element();
        const panel = retained.closest('[data-slot="collapsible-panel"]');
        let entries = 0;
        const sample = (stage: string, event?: Event) => {
          if (stage !== "after" && entries >= 7) return;
          entries++;
          try {
            const rect = retained.getBoundingClientRect();
            let currentIsRetained = false;
            try {
              currentIsRetained = action.element() === retained;
            } catch {
              // A missing current node is recorded, never retried or substituted.
            }
            console.info("PR_RESOLUTION_CLICK_DIAGNOSTIC", {
              stage,
              pathContainsRetained: event ? event.composedPath().includes(retained) : null,
              targetIsRetained: event ? event.target === retained : null,
              connected: retained.isConnected,
              disabled: retained.matches(":disabled"),
              currentIsRetained,
              rect: [rect.x, rect.y, rect.width, rect.height].map(Math.round),
              panelStarting: panel?.hasAttribute("data-starting-style") ?? false,
              panelEnding: panel?.hasAttribute("data-ending-style") ?? false,
              panelOpen: panel?.hasAttribute("data-open") ?? false,
              commandCalls: mocks.resolution.mock.calls.length,
            });
          } catch {
            // Diagnostic sampling must never replace the original interaction failure.
          }
        };
        for (const type of ["pointerdown", "pointerup", "click"] as const) {
          const listener = (event: Event) => sample(type, event);
          document.addEventListener(type, listener, true);
          listeners.defer(() => document.removeEventListener(type, listener, true));
        }
        sample("before");
        listeners.defer(() => sample("after"));
      }
      await action.click();
    }
    expect(mocks.resolution).toHaveBeenCalledExactlyOnceWith({
      environmentId: EnvironmentId.make("environment"),
      input: { ...commentsReference, threadId: orphan.id, resolved: !resolved },
    });
    await expect.element(action).toBeDisabled();
    await act(async () => {
      action.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(mocks.resolution).toHaveBeenCalledTimes(1);
    await screen.rerender(surface("zh-CN"));
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => {
      finish(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure)));
      await Promise.resolve();
    });
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法更新对话",
    });
    await expect
      .element(
        screen.getByRole("button", {
          name: resolved ? "标记为未解决" : "标记为已解决",
          exact: true,
        }),
      )
      .toBeEnabled();
    await expect.element(screen.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
    expect(mocks.otherCommand).not.toHaveBeenCalled();
    expect(mocks.loadComments).not.toHaveBeenCalled();
    await screen.rerender(surface("en"));
    await expect
      .element(
        screen.getByRole("button", {
          name: resolved ? "Unresolve" : "Resolve",
          exact: true,
        }),
      )
      .toBeEnabled();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.resolution).toHaveBeenCalledTimes(1);
  },
);
it.each(["capability", "permission", "threadAllowed"] as const)(
  "omits review-thread resolution without %s",
  async (denied) => {
    const settings = getClientSettings();
    using _settings = {
      [Symbol.dispose]() {
        __setClientSettingsForTests(settings);
      },
    };
    setup({ paged: false });
    mocks.resolution.mockReset();
    mocks.toast.mockClear();
    mocks.otherCommand.mockClear();
    const refresh = vi.fn();
    await using screen = await render(
      commentsSurface("en", refresh, false, {
        resolved: false,
        capability: true,
        permission: true,
        threadAllowed: true,
        [denied]: false,
      }),
      { container: pagedContainer() },
    );
    await screen.getByRole("button", { name: /^Conversations not on the current diff/ }).click();
    await expect.element(screen.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Resolve", exact: true }))
      .not.toBeInTheDocument();
    expect(mocks.resolution).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.otherCommand).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  },
);

function actionSurface(
  locale: "en" | "zh-CN",
  refresh: () => void,
  actions = { reply: true, commentPermission: true, edit: true },
) {
  return commentsSurface(locale, refresh, false, undefined, actions);
}
function resetCommentActions() {
  setup({ paged: false });
  mocks.reply.mockReset();
  mocks.edit.mockReset();
  mocks.speechQueue.mockReset();
  mocks.speechCancel.mockClear();
  mocks.toast.mockClear();
  mocks.otherCommand.mockClear();
  mocks.loadComments.mockReset();
  mocks.resolution.mockReset();
  mocks.writeAllowed = true;
}
for (const action of ["reply", "edit"] as const) {
  it.each([
    ["owned", null],
    ["raw", new Error("Literal $& {failure}")],
    ["empty", new Error("")],
    ["interrupted", undefined],
  ] as const)(
    `uses settlement locale for review-thread ${action} failure: %s`,
    async (kind, failure) => {
      const settings = getClientSettings();
      using _settings = {
        [Symbol.dispose]() {
          __setClientSettingsForTests(settings);
          mocks.writeAllowed = true;
        },
      };
      resetCommentActions();
      const { AsyncResult } = await import("effect/reactivity");
      const Cause = await import("effect/Cause");
      type Result = import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
        void,
        unknown
      >;
      let finish = (_result: Result) => {};
      const command = action === "reply" ? mocks.reply : mocks.edit;
      command.mockReturnValueOnce(
        new Promise<Result>((resolve) => {
          finish = resolve;
        }),
      );
      const refresh = vi.fn();
      const container = pagedContainer();
      // Keep scoped locators anchored when transient portal nodes change the surrounding DOM.
      container.dataset.testid = `review-thread-${action}-${kind}`;
      await using screen = await render(actionSurface("en", refresh), {
        container,
      });
      const root = page.getByTestId(container.dataset.testid);
      await using _settle = {
        async [Symbol.asyncDispose]() {
          await act(async () => {
            finish(AsyncResult.failure(Cause.interrupt()));
            await Promise.resolve();
          });
        },
      };
      await root.getByRole("button", { name: /^Conversations not on the current diff/ }).click();
      await expect.element(root.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
      await root
        .getByRole("button", {
          name: action === "reply" ? "Reply" : "Edit comment",
          exact: true,
        })
        .click();
      const draft = "  Literal $& {draft}\nsecond line  ";
      const input = root.getByRole("textbox", {
        name: action === "reply" ? "Reply to this conversation" : "Edit comment",
        exact: true,
      });
      await userEvent.fill(input, draft);
      await root
        .getByRole("button", {
          name: action === "reply" ? "Reply" : "Save",
          exact: true,
        })
        .click();
      if (action === "reply") {
        expect(command).not.toHaveBeenCalled();
        expect(mocks.speechQueue).toHaveBeenCalledTimes(1);
        await act(async () => {
          mocks.speechQueue.mock.calls[0]![0](draft);
          await Promise.resolve();
        });
      }
      expect(command).toHaveBeenCalledExactlyOnceWith({
        environmentId: EnvironmentId.make("environment"),
        input:
          action === "reply"
            ? { ...commentsReference, threadId: orphan.id, body: draft.trim() }
            : {
                ...commentsReference,
                commentId: orphan.comments[0]!.id,
                kind: "review-comment",
                body: draft,
              },
      });
      const pending = root.getByRole("button", {
        name: action === "reply" ? "Reply" : "Saving...",
        exact: true,
      });
      await expect.element(pending).toBeDisabled();
      await act(async () => {
        pending.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
        if (action === "reply") mocks.speechQueue.mock.calls[0]![0](draft);
      });
      expect(command).toHaveBeenCalledTimes(1);
      await screen.rerender(actionSurface("zh-CN", refresh));
      expect(mocks.toast).not.toHaveBeenCalled();
      await act(async () => {
        finish(
          AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure)),
        );
        await Promise.resolve();
      });
      expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: action === "reply" ? "无法发布回复" : "无法保存评论",
      });
      await expect
        .element(
          root.getByRole("textbox", {
            name: action === "reply" ? "回复此对话" : "编辑评论",
            exact: true,
          }),
        )
        .toHaveValue(draft);
      await expect
        .element(
          root.getByRole("button", {
            name: action === "reply" ? "回复" : "保存",
            exact: true,
          }),
        )
        .toBeEnabled();
      if (action === "reply")
        await expect
          .element(root.getByText(orphan.comments[0]!.body, { exact: true }))
          .toBeVisible();
      expect(refresh).not.toHaveBeenCalled();
      expect(mocks.otherCommand).not.toHaveBeenCalled();
      expect(mocks.loadComments).not.toHaveBeenCalled();
      expect(mocks.resolution).not.toHaveBeenCalled();
      expect(action === "reply" ? mocks.edit : mocks.reply).not.toHaveBeenCalled();
      await screen.rerender(actionSurface("en", refresh));
      expect(mocks.toast).toHaveBeenCalledTimes(1);
      expect(command).toHaveBeenCalledTimes(1);
      await root.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect.element(root.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
    },
  );
}
it("preserves review-thread reply blank and cancellation guards", async () => {
  const settings = getClientSettings();
  using _settings = {
    [Symbol.dispose]() {
      __setClientSettingsForTests(settings);
    },
  };
  resetCommentActions();
  const refresh = vi.fn();
  await using screen = await render(actionSurface("en", refresh), {
    container: pagedContainer(),
  });
  await screen.getByRole("button", { name: /^Conversations not on the current diff/ }).click();
  await screen.getByRole("button", { name: "Reply", exact: true }).click();
  await screen.getByRole("button", { name: "Reply", exact: true }).click();
  expect(mocks.speechQueue).toHaveBeenCalledTimes(1);
  await act(async () => {
    mocks.speechQueue.mock.calls[0]![0](" \n ");
  });
  expect(mocks.reply).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect
    .element(
      screen.getByRole("textbox", {
        name: "Reply to this conversation",
        exact: true,
      }),
    )
    .not.toBeInTheDocument();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
it("preserves review-thread edit write-scope and Escape guards", async () => {
  const settings = getClientSettings();
  using _settings = {
    [Symbol.dispose]() {
      __setClientSettingsForTests(settings);
      mocks.writeAllowed = true;
    },
  };
  resetCommentActions();
  const refresh = vi.fn();
  await using screen = await render(actionSurface("en", refresh), {
    container: pagedContainer(),
  });
  await screen.getByRole("button", { name: /^Conversations not on the current diff/ }).click();
  await screen.getByRole("button", { name: "Edit comment", exact: true }).click();
  const input = screen.getByRole("textbox", {
    name: "Edit comment",
    exact: true,
  });
  await userEvent.fill(input, "Unsent literal {edit}");
  const save = screen.getByRole("button", { name: "Save", exact: true });
  await expect.element(save).toBeEnabled();
  mocks.writeAllowed = false;
  await save.click();
  expect(mocks.edit).not.toHaveBeenCalled();
  await screen.rerender(actionSurface("en", refresh));
  await expect.element(save).toBeDisabled();
  await act(async () => {
    save.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    input.element().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
      }),
    );
  });
  expect(mocks.edit).not.toHaveBeenCalled();
  await input.click();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(screen.getByRole("textbox", { name: "Edit comment", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
it.each(["reply", "commentPermission", "edit"] as const)(
  "preserves review-thread %s capability gate",
  async (gate) => {
    const settings = getClientSettings();
    using _settings = {
      [Symbol.dispose]() {
        __setClientSettingsForTests(settings);
      },
    };
    resetCommentActions();
    const refresh = vi.fn();
    await using screen = await render(
      actionSurface("en", refresh, {
        reply: true,
        commentPermission: true,
        edit: true,
        [gate]: false,
      }),
      { container: pagedContainer() },
    );
    await screen.getByRole("button", { name: /^Conversations not on the current diff/ }).click();
    await expect.element(screen.getByText(orphan.comments[0]!.body, { exact: true })).toBeVisible();
    await expect
      .element(
        screen.getByRole("button", {
          name: gate === "edit" ? "Edit comment" : "Reply",
          exact: true,
        }),
      )
      .not.toBeInTheDocument();
    expect(mocks.reply).not.toHaveBeenCalled();
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  },
);
it("hides a resolved conversation behind avatars on its line until they are clicked", async () => {
  setup({ paged: false });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    diffFilesCollapsed: false,
  });
  using _preferences = {
    [Symbol.dispose]() {
      __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
    },
  };
  const container = document.createElement("div");
  container.className = "flex h-[700px] w-[900px]";
  const comment = {
    author: { login: "reviewer", name: null, avatarUrl: null },
    body: "Rename this.",
    createdAt: "2026-09-01T00:00:00Z",
    url: null,
  };
  const withThread = (isResolved: boolean, oldSideToo = false) => (
    <PullRequestCodeTab
      scrollerRef={() => {}}
      environmentId={EnvironmentId.make("environment")}
      reference={detail}
      detail={{
        ...detail,
        capabilities: {
          ...detail.capabilities,
          review: { ...detail.capabilities.review, reply: true },
        },
        viewerPermissions: { ...detail.viewerPermissions, comment: true },
        reviewThreads: [
          {
            id: "thread",
            path: "a.ts",
            line: 3,
            side: "right",
            isResolved,
            isOutdated: false,
            comments: [{ id: "comment", ...comment }],
          },
          ...(oldSideToo
            ? [
                {
                  id: "old-side",
                  path: "a.ts",
                  line: 3,
                  side: "left" as const,
                  isResolved: true,
                  isOutdated: false,
                  comments: [{ id: "old-side-comment", ...comment }],
                },
              ]
            : []),
        ],
      }}
      selectedCommitOid={null}
      onSelectedCommitChange={() => {}}
      onRefresh={() => {}}
    />
  );
  await using screen = await render(withThread(true), { container });
  const marker = screen.getByRole("button", {
    name: "Resolved conversation",
    exact: true,
  });
  const card = (state: string) => screen.getByRole("button", { name: `${state} · 1 comment` });
  const reply = () => screen.getByRole("textbox", { name: "Reply to this conversation" });

  await expect.element(marker).toHaveAttribute("aria-expanded", "false");
  await expect.element(card("Resolved")).not.toBeInTheDocument();

  await marker.click();
  await expect.element(marker).toHaveAttribute("aria-expanded", "true");
  await expect.element(card("Resolved")).toHaveAttribute("aria-expanded", "true");
  await screen.getByRole("button", { name: "Reply", exact: true }).click();
  await reply().fill("Unsent");

  // Hidden conversations stay mounted, so the unsent reply is still there.
  await marker.click();
  await expect.element(card("Resolved")).not.toBeInTheDocument();
  await marker.click();
  await expect.element(reply()).toHaveValue("Unsent");
  await marker.click();

  // Seen open and then resolved, it stays until the avatars are clicked.
  await screen.rerender(withThread(false));
  await expect.element(card("Open")).toBeVisible();
  await screen.rerender(withThread(true));
  await expect.element(card("Resolved")).toBeVisible();

  // Stacked view draws a context row once, so both sides' conversations share the avatars.
  await screen.rerender(withThread(true, true));
  await expect
    .element(screen.getByRole("button", { name: "2 resolved conversations" }))
    .toBeVisible();
});

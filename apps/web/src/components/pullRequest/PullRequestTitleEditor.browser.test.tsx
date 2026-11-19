import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestDetailView,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { readableFailure } from "./pullRequestDetail.logic";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { PullRequestTitleEditor } from "./PullRequestTitleEditor";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  update: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("~/state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  const { pullRequestEnvironment } = await import("../../state/pullRequests");
  return {
    ...actual,
    useAtomCommand: (command: unknown) => {
      if (command === pullRequestEnvironment.update) return fixture.update;
      throw new Error("Unexpected command");
    },
  };
});
vi.mock("../ui/toast", async (original) => {
  const actual = await original<typeof import("../ui/toast")>();
  return {
    ...actual,
    toastManager: { ...actual.toastManager, add: fixture.toast },
  };
});
vi.mock("~/i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../../i18n/readWebI18n")>()),
  readWebI18n: () => {
    const locale = fixture.locale;
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
  title: "Original $& {title}",
  body: "Original description",
  url: "https://github.com/owner/repo/pull/1",
  author: { login: "author", name: null, avatarUrl: null },
  viewer: "author",
  state: "open",
  isDraft: false,
  mergeability: "conflicting",
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
    edit: { changeRequest: true, comment: false },
  },
  viewerPermissions: {
    actions: [],
    comment: false,
    resolve: false,
    verdicts: [],
    requestReviewers: false,
  },
};

const environmentId = EnvironmentId.make("title-editor");
const reference = {
  projectId: detail.projectId,
  repository: detail.repository,
  number: detail.number,
};
function view(canWrite = true) {
  const locale = fixture.locale;
  return (
    <WebI18nContext.Provider
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <PullRequestTitleEditor
        environmentId={environmentId}
        reference={reference}
        pullRequestKey="literal-pr"
        detail={detail}
        canWriteSourceControl={canWrite}
      />
    </WebI18nContext.Provider>
  );
}
function setup() {
  fixture.locale = "en";
  fixture.update.mockReset();
  fixture.toast.mockReset().mockReturnValue("title-toast");
}
const interruptedResult = AsyncResult.failure(Cause.interrupt());
it.each([
  { name: "owned", cause: null, description: "托管服务拒绝了新标题。" },
  {
    name: "raw collision",
    cause: new Error("The host refused the new title."),
    description: "The host refused the new title.",
  },
  {
    name: "raw string",
    cause: "Literal $& {host}",
    description: "Literal $& {host}",
  },
  {
    name: "empty",
    cause: new Error(""),
    description: "托管服务拒绝了新标题。",
  },
  {
    name: "whitespace",
    cause: new Error("  "),
    description: "托管服务拒绝了新标题。",
  },
  {
    name: "interrupted still reported",
    cause: null,
    interrupted: true,
    description: readableFailure(
      squashAtomCommandFailure(interruptedResult),
      "托管服务拒绝了新标题。",
    ),
  },
])("uses settlement locale for pull request title failure: $name", async (entry) => {
  setup();
  let finish!: (result: AtomCommandResult<unknown, unknown>) => void;
  const pending = new Promise<AtomCommandResult<unknown, unknown>>((resolve) => {
    finish = resolve;
  });
  fixture.update.mockReturnValue(pending);
  await using screen = await render(view());
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.fail(null)));
        await Promise.resolve();
      });
    },
  };
  await screen.getByRole("button", { name: "Edit title", exact: true }).click();
  const input = screen.getByRole("textbox", {
    name: "Pull request title",
    exact: true,
  });
  await input.fill("  Literal $& {new title}  ");
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  await expect.element(input).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Edit title", exact: true }))
    .toBeVisible();
  expect(fixture.update).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { ...reference, title: "Literal $& {new title}" },
  });
  fixture.locale = "zh-CN";
  await screen.rerender(view());
  await act(async () => {
    finish(
      "interrupted" in entry ? interruptedResult : AsyncResult.failure(Cause.fail(entry.cause)),
    );
  });
  const retained = screen.getByRole("textbox", {
    name: "变更请求标题",
    exact: true,
  });
  await expect.element(retained).toBeEnabled();
  await expect.element(retained).toHaveValue("Literal $& {new title}");
  expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法保存标题",
    description: entry.description,
  });
  await expect
    .element(screen.getByRole("button", { name: "编辑标题", exact: true }))
    .not.toBeInTheDocument();
  fixture.locale = "en";
  await screen.rerender(view());
  expect(fixture.update).toHaveBeenCalledTimes(1);
  expect(fixture.toast).toHaveBeenCalledTimes(1);
});
it("preserves title permission, unchanged and Escape guards", async () => {
  setup();
  await using screen = await render(view(false));
  await screen.getByRole("button", { name: "Edit title", exact: true }).click();
  const input = screen.getByRole("textbox", {
    name: "Pull request title",
    exact: true,
  });
  await input.fill("Denied change");
  await expect.element(screen.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await input.click();
  await userEvent.keyboard("{Enter}");
  expect(fixture.update).not.toHaveBeenCalled();
  await userEvent.keyboard("{Escape}");
  await screen.rerender(view());
  await screen.getByRole("button", { name: "Edit title", exact: true }).click();
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Edit title", exact: true }))
    .toBeVisible();
  expect(fixture.update).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("heading", { name: detail.title, exact: true }))
    .toBeVisible();
  expect(fixture.toast).not.toHaveBeenCalled();
});

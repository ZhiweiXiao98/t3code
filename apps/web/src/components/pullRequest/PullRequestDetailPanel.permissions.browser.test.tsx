import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import "~/index.css";
import { page } from "vite-plus/test/browser";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import {
  AuthOrchestrationOperateScope,
  AuthSourceControlWriteScope,
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestDetailView,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { act, render } from "../../../test/render";

const { permissions, mocks } = vi.hoisted(() => ({
  mocks: {
    gitlab: false,
    draftAction: false,
    commentAction: false,
    postComment: vi.fn(),
    queue: vi.fn<(submit: (text: string) => void) => void>(),
    cancelSpeech: vi.fn(),
    runAction: vi.fn(),
    acted: vi.fn(),
    refresh: vi.fn(),
    command: vi.fn(),
    newThread: vi.fn(),
    toast: vi.fn(),
    locale: "en" as "en" | "zh-CN",
  },
  permissions: { checkout: true, operate: true },
}));

vi.mock(import("~/hooks/useHandleNewThread"), async (original) => ({
  ...(await original()),
  useNewThreadHandler: () => mocks.newThread,
}));
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: (_environmentId: unknown, scope: unknown) =>
    scope === AuthOrchestrationOperateScope ? permissions.operate : permissions.checkout,
  readEnvironmentScope: (_environmentId: unknown, scope: unknown) =>
    scope === AuthOrchestrationOperateScope ? permissions.operate : permissions.checkout,
}));
vi.mock(import("~/state/sourceControlActions"), async (original) => ({
  ...(await original()),
  usePreparePullRequestThreadAction: (() => ({
    isAllowed: permissions.checkout,
    run: vi.fn(),
    error: null,
  })) as never,
}));
vi.mock(import("./usePullRequestDetail"), async (original) => ({
  ...(await original()),
  usePullRequestDetail: (() => ({
    canWriteSourceControl: permissions.checkout,
    detailQuery: { isPending: false, refresh: mocks.refresh },
    activityQuery: { isPending: false, refresh: mocks.refresh, error: null },
    activity: null,
    sharedSummary: selectedDetail(),
    coreDetail: selectedDetail(),
    detail: selectedDetail(),
  })) as never,
}));
vi.mock(import("~/state/usePullRequestStack"), async (original) => ({
  ...(await original()),
  usePullRequestStack: (() => ({
    data: null,
    isFresh: true,
    isPending: false,
    error: null,
    refresh: vi.fn(),
  })) as never,
}));
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: unknown) =>
    command === pullRequestEnvironment.runAction
      ? mocks.runAction
      : command === pullRequestEnvironment.comment
        ? mocks.postComment
        : mocks.command) as never,
}));

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

import { pullRequestEnvironment } from "~/state/pullRequests";
import { readableFailure } from "./pullRequestDetail.logic";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { PullRequestDetailPanel } from "./PullRequestDetailPanel";

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
    review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
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

const gitlabDetail: PullRequestDetailView = {
  ...detail,
  provider: SourceControlProviderKind.make("gitlab"),
  repository: "group/project",
  number: 42,
  url: "https://gitlab.com/group/project/-/merge_requests/42",
};
const draftDetail: PullRequestDetailView = {
  ...detail,
  capabilities: { ...detail.capabilities, actions: ["draft"] },
  viewerPermissions: { ...detail.viewerPermissions, actions: ["draft"] },
};
const commentDetail: PullRequestDetailView = {
  ...detail,
  state: "closed",
  capabilities: { ...detail.capabilities, comment: true, actions: ["reopen"] },
  viewerPermissions: { ...detail.viewerPermissions, comment: true, actions: ["reopen"] },
};
function selectedDetail() {
  if (mocks.commentAction) return commentDetail;
  if (mocks.draftAction) return draftDetail;
  return mocks.gitlab ? gitlabDetail : detail;
}

const environmentId = EnvironmentId.make("environment");
const draftId = DraftId.make("conflicts-draft");
const panel = (attach = false) => (
  <PullRequestDetailPanel
    environmentId={environmentId}
    reference={{
      projectId: selectedDetail().projectId,
      repository: selectedDetail().repository,
      number: selectedDetail().number,
    }}
    onActed={mocks.acted}
    context="page"
    shortcutsEnabled={false}
    getShortcutContext={() => ({
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
      isWeb: true,
      isDesktop: false,
    })}
    {...(attach ? { composerDraftTarget: draftId } : {})}
  />
);

function setup() {
  mocks.gitlab = false;
  mocks.draftAction = false;
  mocks.commentAction = false;
  permissions.checkout = true;
  permissions.operate = true;
  useComposerDraftStore.setState({ draftsByThreadKey: {} });
}

it.each([AuthSourceControlWriteScope, AuthOrchestrationOperateScope])(
  "disables conflict checkout when the connection loses %s",
  async (scope) => {
    setup();
    await using screen = await render(panel());
    const resolve = screen.getByRole("button", { name: "Resolve conflicts" });
    await expect.element(resolve).toBeEnabled();
    if (scope === AuthSourceControlWriteScope) permissions.checkout = false;
    else permissions.operate = false;
    await screen.rerender(panel());
    await expect.element(resolve).toBeDisabled();
  },
);

it("can still add conflict resolution to an existing composer without checkout scopes", async () => {
  setup();
  permissions.checkout = false;
  permissions.operate = false;
  await using screen = await render(panel(true));
  const resolve = screen.getByRole("button", { name: "Resolve conflicts" });
  await expect.element(resolve).toBeEnabled();
  await act(() => resolve.click());
  const draft = useComposerDraftStore.getState().getComposerDraft(draftId);
  expect(draft?.prompt).toContain("conflicts");
  expect(draft?.prompt).toContain(detail.url);
});

function copySurface(locale: "en" | "zh-CN") {
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
      {panel()}
    </WebI18nContext>
  );
}
it.each([
  ["number success", "number", true, null],
  ["link success", "link", true, null],
  ["number failure", "number", false, null],
  ["link raw failure", "link", false, new Error("Literal $& {native}")],
  ["number empty failure", "number", false, new Error("")],
] as const)(
  "uses settlement locale for detail reference copy: %s",
  async (_name, kind, success, cause) => {
    const state = useComposerDraftStore.getState();
    using _state = {
      [Symbol.dispose]() {
        useComposerDraftStore.setState(state, true);
        mocks.locale = "en";
      },
    };
    setup();
    mocks.command.mockClear();
    mocks.toast.mockClear();
    let finish = () => {};
    let fail = (_cause: unknown) => {};
    const pending = new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    void pending.catch(() => {});
    using write = vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(pending);
    using rich = vi
      .spyOn(navigator.clipboard, "write")
      .mockRejectedValue(new Error("Unexpected rich clipboard write"));
    using external = vi.spyOn(window, "open").mockImplementation(() => null);
    using error = vi.spyOn(console, "error").mockImplementation(() => {});
    await using screen = await render(copySurface("en"));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          fail(new Error("Fixture disposed"));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "More pull request actions", exact: true }).click();
    await page
      .getByRole("menuitem", {
        name: kind === "number" ? /^Copy PR number(?:\s|$)/ : /^Copy link(?:\s|$)/,
      })
      .click();
    expect(write).toHaveBeenCalledExactlyOnceWith(kind === "number" ? "#1" : detail.url);
    expect(mocks.toast).not.toHaveBeenCalled();
    await screen.rerender(copySurface("zh-CN"));
    await act(async () => {
      if (success) finish();
      else fail(cause);
      await Promise.resolve();
    });
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(
      success
        ? {
            type: "success",
            title: kind === "number" ? "已复制拉取请求编号" : "已复制拉取请求链接",
          }
        : {
            type: "error",
            title: kind === "number" ? "复制拉取请求编号失败" : "复制拉取请求链接失败",
            description: "无法将 拉取请求引用 复制到剪贴板。",
          },
    );
    if (success) expect(error).not.toHaveBeenCalled();
    else
      expect(error).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          _tag: "ClipboardWriteError",
          target: "pull request reference",
          cause,
        }),
      );
    expect(rich).not.toHaveBeenCalled();
    expect(external).not.toHaveBeenCalled();
    expect(mocks.command).not.toHaveBeenCalled();
    await screen.rerender(copySurface("en"));
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  },
);

it("localizes the actual unavailable reference clipboard API", async () => {
  const state = useComposerDraftStore.getState();
  const clipboard = navigator.clipboard;
  const descriptor = Object.getOwnPropertyDescriptor(clipboard, "writeText");
  using _restore = {
    [Symbol.dispose]() {
      if (descriptor) Object.defineProperty(clipboard, "writeText", descriptor);
      else Reflect.deleteProperty(clipboard, "writeText");
      useComposerDraftStore.setState(state, true);
      mocks.locale = "en";
    },
  };
  Object.defineProperty(clipboard, "writeText", { configurable: true, value: undefined });
  using fallback = vi.spyOn(document, "execCommand").mockReturnValue(false);
  using rich = vi.spyOn(clipboard, "write").mockRejectedValue(new Error("Unexpected rich write"));
  using error = vi.spyOn(console, "error").mockImplementation(() => {});
  using external = vi.spyOn(window, "open").mockImplementation(() => null);
  setup();
  mocks.toast.mockClear();
  mocks.command.mockClear();
  await using screen = await render(copySurface("zh-CN"));
  await screen.getByRole("button", { name: "更多变更请求操作", exact: true }).click();
  await page.getByRole("menuitem", { name: /^复制 PR 编号(?:\s|$)/ }).click();
  await expect
    .poll(() => mocks.toast.mock.calls)
    .toEqual([
      [
        {
          type: "error",
          title: "复制拉取请求编号失败",
          description: "复制 拉取请求引用 时剪贴板 API 不可用。",
        },
      ],
    ]);
  expect(fallback).toHaveBeenCalledExactlyOnceWith("copy");
  expect(error).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      _tag: "ClipboardApiUnavailableError",
      target: "pull request reference",
      message: "Clipboard API is unavailable while copying pull request reference.",
    }),
  );
  expect(rich).not.toHaveBeenCalled();
  expect(external).not.toHaveBeenCalled();
  expect(mocks.command).not.toHaveBeenCalled();
});

it.each([
  ["number success", "number", true],
  ["link success", "link", true],
  ["number failure", "number", false],
  ["link failure", "link", false],
] as const)("translates GitLab reference copy labels: %s", async (_name, kind, success) => {
  const state = useComposerDraftStore.getState();
  using _state = {
    [Symbol.dispose]() {
      useComposerDraftStore.setState(state, true);
      mocks.gitlab = false;
      mocks.locale = "en";
    },
  };
  setup();
  mocks.gitlab = true;
  mocks.command.mockClear();
  mocks.toast.mockClear();
  const client = sourceControlClients.get(gitlabDetail.provider);
  expect(client.changeRequest.shortLabel).toBe("MR");
  expect(client.changeRequest.singular).toBe("merge request");
  const cause = new Error("Literal $& {GitLab clipboard cause}");
  let finish = () => {};
  let fail = (_cause: unknown) => {};
  const pending = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  void pending.catch(() => {});
  using write = vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(pending);
  using rich = vi
    .spyOn(navigator.clipboard, "write")
    .mockRejectedValue(new Error("Unexpected rich write"));
  using external = vi.spyOn(window, "open").mockImplementation(() => null);
  using error = vi.spyOn(console, "error").mockImplementation(() => {});
  await using screen = await render(copySurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        fail(new Error("Fixture disposed"));
        await Promise.resolve();
      });
    },
  };
  await screen.getByRole("button", { name: "More merge request actions", exact: true }).click();
  await page
    .getByRole("menuitem", {
      name: kind === "number" ? /^Copy MR number(?:\s|$)/ : /^Copy link(?:\s|$)/,
    })
    .click();
  expect(write).toHaveBeenCalledExactlyOnceWith(kind === "number" ? "#42" : gitlabDetail.url);
  expect(mocks.toast).not.toHaveBeenCalled();
  await screen.rerender(copySurface("zh-CN"));
  await act(async () => {
    if (success) finish();
    else fail(cause);
    await Promise.resolve();
  });
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(
    success
      ? { type: "success", title: kind === "number" ? "已复制合并请求编号" : "已复制合并请求链接" }
      : {
          type: "error",
          title: kind === "number" ? "复制合并请求编号失败" : "复制合并请求链接失败",
          description: "无法将 合并请求引用 复制到剪贴板。",
        },
  );
  if (success) expect(error).not.toHaveBeenCalled();
  else
    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        _tag: "ClipboardWriteError",
        target: "merge request reference",
        cause,
      }),
    );
  expect(rich).not.toHaveBeenCalled();
  expect(external).not.toHaveBeenCalled();
  expect(mocks.command).not.toHaveBeenCalled();
  await screen.rerender(copySurface("en"));
  expect(mocks.toast).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(1);
});

it.each([
  ["github pending Chinese", false, "en", "zh-CN", null],
  ["gitlab pending Chinese", true, "en", "zh-CN", new Error("Literal $& {native checkout}")],
  ["github English parity", false, "zh-CN", "en", new Error("")],
] as const)(
  "localizes checkout clipboard description: %s",
  async (_name, gitlab, initialLocale, settledLocale, cause) => {
    const state = useComposerDraftStore.getState();
    using _restore = {
      [Symbol.dispose]() {
        useComposerDraftStore.setState(state, true);
        mocks.gitlab = false;
        mocks.locale = "en";
      },
    };
    setup();
    mocks.gitlab = gitlab;
    mocks.toast.mockClear();
    mocks.command.mockClear();
    let fail = (_cause: unknown) => {};
    const pending = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    void pending.catch(() => {});
    using write = vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(pending);
    using rich = vi
      .spyOn(navigator.clipboard, "write")
      .mockRejectedValue(new Error("Unexpected rich write"));
    using external = vi.spyOn(window, "open").mockImplementation(() => null);
    using error = vi.spyOn(console, "error").mockImplementation(() => {});
    await using screen = await render(copySurface(initialLocale));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          fail(new Error("Fixture disposed"));
          await Promise.resolve();
        });
      },
    };
    await screen
      .getByRole("button", {
        name: initialLocale === "en" ? "Copy checkout command" : "复制检出命令",
        exact: true,
      })
      .click();
    expect(write).toHaveBeenCalledExactlyOnceWith(
      gitlab ? "glab mr checkout 42" : "gh pr checkout 1",
    );
    expect(mocks.toast).not.toHaveBeenCalled();
    await screen.rerender(copySurface(settledLocale));
    await act(async () => {
      fail(cause);
      await Promise.resolve();
    });
    const target =
      initialLocale === "en"
        ? gitlab
          ? "merge request checkout command"
          : "pull request checkout command"
        : "拉取请求检出命令";
    const english = `Failed to copy ${target} to the clipboard.`;
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: settledLocale === "zh-CN" ? "无法复制检出命令" : "Could not copy checkout command",
      description:
        settledLocale === "zh-CN"
          ? gitlab
            ? "无法将 合并请求检出命令 复制到剪贴板。"
            : "无法将 拉取请求检出命令 复制到剪贴板。"
          : english,
    });
    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ _tag: "ClipboardWriteError", target, cause, message: english }),
    );
    expect(rich).not.toHaveBeenCalled();
    expect(external).not.toHaveBeenCalled();
    expect(mocks.command).not.toHaveBeenCalled();
    await screen.rerender(copySurface(initialLocale));
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  },
);
it("localizes the actual unavailable checkout clipboard API", async () => {
  const state = useComposerDraftStore.getState();
  const clipboard = navigator.clipboard;
  const descriptor = Object.getOwnPropertyDescriptor(clipboard, "writeText");
  using _restore = {
    [Symbol.dispose]() {
      if (descriptor) Object.defineProperty(clipboard, "writeText", descriptor);
      else Reflect.deleteProperty(clipboard, "writeText");
      useComposerDraftStore.setState(state, true);
      mocks.locale = "en";
    },
  };
  Object.defineProperty(clipboard, "writeText", { configurable: true, value: undefined });
  using fallback = vi.spyOn(document, "execCommand").mockReturnValue(false);
  using rich = vi.spyOn(clipboard, "write").mockRejectedValue(new Error("Unexpected rich write"));
  using error = vi.spyOn(console, "error").mockImplementation(() => {});
  using external = vi.spyOn(window, "open").mockImplementation(() => null);
  setup();
  mocks.toast.mockClear();
  mocks.command.mockClear();
  await using screen = await render(copySurface("zh-CN"));
  await screen.getByRole("button", { name: "复制检出命令", exact: true }).click();
  await expect
    .poll(() => mocks.toast.mock.calls)
    .toEqual([
      [
        {
          type: "error",
          title: "无法复制检出命令",
          description: "复制 拉取请求检出命令 时剪贴板 API 不可用。",
        },
      ],
    ]);
  expect(fallback).toHaveBeenCalledExactlyOnceWith("copy");
  expect(error).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      _tag: "ClipboardApiUnavailableError",
      target: "拉取请求检出命令",
      message: "Clipboard API is unavailable while copying 拉取请求检出命令.",
    }),
  );
  expect(rich).not.toHaveBeenCalled();
  expect(external).not.toHaveBeenCalled();
  expect(mocks.command).not.toHaveBeenCalled();
});

it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {thread failure}")],
  ["empty", new Error("")],
  ["undefined", undefined],
] as const)("uses settlement locale for ask-thread failure: %s", async (_kind, cause) => {
  const state = useComposerDraftStore.getState();
  using _restore = {
    [Symbol.dispose]() {
      useComposerDraftStore.setState(state, true);
      mocks.locale = "en";
      mocks.newThread.mockReset();
    },
  };
  setup();
  mocks.toast.mockClear();
  mocks.command.mockClear();
  mocks.newThread.mockReset();
  let fail = (_cause: unknown) => {};
  const pending = new Promise<never>((_resolve, reject) => {
    fail = reject;
  });
  void pending.catch(() => {});
  mocks.newThread.mockReturnValueOnce(pending);
  using external = vi.spyOn(window, "open").mockImplementation(() => null);
  using write = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValue(new Error("Unexpected clipboard write"));
  using rich = vi
    .spyOn(navigator.clipboard, "write")
    .mockRejectedValue(new Error("Unexpected rich write"));
  await using screen = await render(copySurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        fail(new Error("Fixture disposed"));
        await Promise.resolve();
      });
    },
  };
  const before = useComposerDraftStore.getState();
  const trigger = screen.getByRole("button", { name: "More pull request actions", exact: true });
  await trigger.click();
  await page.getByRole("menuitem", { name: /^Ask a question(?:\s|$)/ }).click();
  expect(mocks.newThread).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    projectId: detail.projectId,
  });
  await trigger.click();
  const opening = page.getByRole("menuitem", { name: /^Opening\.\.\.(?:\s|$)/ });
  await expect.element(opening).toBeVisible();
  await expect.element(opening).toHaveAttribute("aria-disabled", "true");
  await act(async () => {
    opening.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(mocks.newThread).toHaveBeenCalledTimes(1);
  await screen.rerender(copySurface("zh-CN"));
  expect(mocks.toast).not.toHaveBeenCalled();
  await act(async () => {
    fail(cause);
    await Promise.resolve();
  });
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法打开任务",
    description: "请从项目中重试，或先打开一个任务。",
  });
  const restored = page.getByRole("menuitem", { name: /^提问(?:\s|$)/ });
  await expect.element(restored).toBeVisible();
  await expect.element(restored).not.toHaveAttribute("aria-disabled", "true");
  expect(useComposerDraftStore.getState()).toBe(before);
  expect(mocks.command).not.toHaveBeenCalled();
  expect(external).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(rich).not.toHaveBeenCalled();
  await screen.rerender(copySurface("en"));
  expect(mocks.toast).toHaveBeenCalledTimes(1);
  expect(mocks.newThread).toHaveBeenCalledTimes(1);
});

it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {action failure}")],
  ["empty", new Error("")],
  ["whitespace", new Error("   ")],
  ["interrupted", undefined],
] as const)("uses settlement locale for draft action failure: %s", async (kind, cause) => {
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  const state = useComposerDraftStore.getState();
  using _restore = {
    [Symbol.dispose]() {
      useComposerDraftStore.setState(state, true);
      mocks.draftAction = false;
      mocks.locale = "en";
      mocks.runAction.mockReset();
    },
  };
  setup();
  mocks.draftAction = true;
  mocks.command.mockClear();
  mocks.toast.mockClear();
  mocks.acted.mockClear();
  mocks.refresh.mockClear();
  let finish = (_result: Result) => {};
  mocks.runAction.mockReset().mockReturnValueOnce(
    new Promise<Result>((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(copySurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  const before = useComposerDraftStore.getState();
  const trigger = screen.getByRole("button", { name: "More pull request actions", exact: true });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Convert to draft", exact: true }).click();
  expect(mocks.runAction).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: {
      projectId: detail.projectId,
      repository: detail.repository,
      number: detail.number,
      action: "draft",
    },
  });
  expect(mocks.acted.mock.calls).toEqual([["draft", "sent"]]);
  await trigger.click();
  const pending = page.getByRole("menuitem", { name: "Convert to draft", exact: true });
  await expect.element(pending).toHaveAttribute("aria-disabled", "true");
  await act(async () => {
    pending.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(mocks.runAction).toHaveBeenCalledTimes(1);
  await screen.rerender(copySurface("zh-CN"));
  const result: Result = AsyncResult.failure(
    kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause),
  );
  await act(async () => {
    finish(result);
    await Promise.resolve();
  });
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法转换为草稿",
    description:
      kind === "interrupted"
        ? readableFailure(
            squashAtomCommandFailure(result),
            "托管服务拒绝了操作。请确认你拥有此仓库的写入权限。",
          )
        : kind === "raw"
          ? "Literal $& {action failure}"
          : "托管服务拒绝了操作。请确认你拥有此仓库的写入权限。",
  });
  expect(mocks.acted.mock.calls).toEqual([
    ["draft", "sent"],
    ["draft", "failed"],
  ]);
  await expect
    .element(page.getByRole("menuitem", { name: "转换为草稿", exact: true }))
    .not.toHaveAttribute("aria-disabled", "true");
  expect(draftDetail.isDraft).toBe(false);
  expect(useComposerDraftStore.getState()).toBe(before);
  expect(mocks.command).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  await screen.rerender(copySurface("en"));
  expect(mocks.toast).toHaveBeenCalledTimes(1);
  expect(mocks.runAction).toHaveBeenCalledTimes(1);
});
it("guards draft conversion without write permission", async () => {
  const state = useComposerDraftStore.getState();
  setup();
  mocks.draftAction = true;
  mocks.runAction.mockClear();
  mocks.acted.mockClear();
  mocks.toast.mockClear();
  mocks.refresh.mockClear();
  using _restore = {
    [Symbol.dispose]() {
      useComposerDraftStore.setState(state, true);
      mocks.draftAction = false;
      permissions.checkout = true;
    },
  };
  await using screen = await render(copySurface("en"));
  permissions.checkout = false;
  await screen.rerender(copySurface("en"));
  await screen.getByRole("button", { name: "More pull request actions", exact: true }).click();
  const item = page.getByRole("menuitem", { name: "Convert to draft", exact: true });
  await expect.element(item).toBeVisible();
  await expect.element(item).not.toHaveAttribute("aria-disabled", "true");
  await item.click();
  expect(mocks.runAction).not.toHaveBeenCalled();
  expect(mocks.acted).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

vi.mock("~/speech/useTextFieldSpeech", async (original) => ({
  ...(await original<typeof import("~/speech/useTextFieldSpeech")>()),
  TextFieldSpeechControls: () => null,
  useTextFieldSpeech: () => ({
    blocksSubmission: true,
    preparing: false,
    freezesEditor: false,
    submitAfterDictation: mocks.queue,
    cancel: mocks.cancelSpeech,
  }),
}));
it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {comment failure}")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)("uses settlement locale for comment action failure: %s", async (kind, cause) => {
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  const before = useComposerDraftStore.getState();
  using _restore = {
    [Symbol.dispose]() {
      useComposerDraftStore.setState(before, true);
      mocks.locale = "en";
      mocks.commentAction = false;
      mocks.postComment.mockReset();
      mocks.queue.mockReset();
    },
  };
  setup();
  mocks.commentAction = true;
  mocks.postComment.mockReset();
  mocks.queue.mockReset();
  mocks.toast.mockClear();
  mocks.command.mockClear();
  mocks.runAction.mockClear();
  mocks.acted.mockClear();
  mocks.refresh.mockClear();
  let finish = (_result: Result) => {};
  mocks.postComment.mockReturnValueOnce(
    new Promise<Result>((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(copySurface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await screen.getByRole("button", { name: "Comment on pull request", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Comment on this pull request", exact: true });
  const draft = "  Literal $& {comment}\nbody  ";
  await input.fill(draft);
  await page.getByRole("button", { name: "Reopen with comment", exact: true }).click();
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  expect(mocks.postComment).not.toHaveBeenCalled();
  await act(async () => {
    mocks.queue.mock.calls[0]![0](draft);
  });
  expect(mocks.postComment).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: {
      projectId: detail.projectId,
      repository: detail.repository,
      number: detail.number,
      body: draft.trim(),
    },
  });
  await expect.element(input).toBeDisabled();
  const reopening = page.getByRole("button", { name: "Reopening...", exact: true });
  await expect.element(reopening).toBeDisabled();
  await act(async () => {
    reopening.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  await screen.rerender(copySurface("zh-CN"));
  await act(async () => {
    finish(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause)));
    await Promise.resolve();
  });
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({ type: "error", title: "无法发布评论" });
  const retained = page.getByRole("textbox", { name: "对此拉取请求发表评论", exact: true });
  await expect.element(retained).toBeEnabled();
  await expect.element(retained).toHaveValue(draft);
  await expect
    .element(page.getByRole("button", { name: "发表评论并重新打开", exact: true }))
    .toBeEnabled();
  expect(mocks.runAction).not.toHaveBeenCalled();
  expect(mocks.acted).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.command).not.toHaveBeenCalled();
  await screen.rerender(copySurface("en"));
  expect(mocks.toast).toHaveBeenCalledTimes(1);
  expect(mocks.postComment).toHaveBeenCalledTimes(1);
});

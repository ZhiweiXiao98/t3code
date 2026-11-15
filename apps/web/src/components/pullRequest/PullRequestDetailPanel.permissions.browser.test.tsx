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
  mocks: { command: vi.fn(), toast: vi.fn(), locale: "en" as "en" | "zh-CN" },
  permissions: { checkout: true, operate: true },
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
    detailQuery: { isPending: false, refresh: vi.fn() },
    activityQuery: { isPending: false, refresh: vi.fn(), error: null },
    activity: null,
    sharedSummary: detail,
    coreDetail: detail,
    detail,
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
  useAtomCommand: (() => mocks.command) as never,
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

const environmentId = EnvironmentId.make("environment");
const draftId = DraftId.make("conflicts-draft");
const panel = (attach = false) => (
  <PullRequestDetailPanel
    environmentId={environmentId}
    reference={detail}
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

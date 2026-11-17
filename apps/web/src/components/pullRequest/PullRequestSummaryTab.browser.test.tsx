import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { SourceControlProviderKind } from "@t3tools/contracts";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type PullRequestDetailView,
} from "@t3tools/contracts";
import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

const state = vi.hoisted(() => ({
  open: vi.fn(),
  refs: vi.fn(),
  update: vi.fn(),
  updateComment: vi.fn(),
  canUpdate: true,
  timestampFormat: "locale" as "locale" | "12-hour" | "24-hour",
  canWrite: true,
  locale: "en" as "en" | "zh-CN",
  toast: vi.fn(),
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: { add: state.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = state.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));

vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: unknown) =>
    command === pullRequestEnvironment.updateComment
      ? state.updateComment
      : state.update) as never,
}));
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => state.canWrite,
  useEnvironmentScope: () => state.canWrite,
}));
vi.mock(import("~/hooks/useSettings"), async (original) => ({
  ...(await original()),
  useClientSettings: ((select?: (settings: ClientSettings) => unknown) => {
    const settings = {
      ...DEFAULT_CLIENT_SETTINGS,
      timestampFormat: state.timestampFormat,
    };
    return select ? select(settings) : settings;
  }) as never,
}));
vi.mock(import("~/state/pullRequests"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const allowed = Atom.make(true);
  const denied = Atom.make(false);
  return {
    ...actual,
    pullRequestEnvironment: {
      ...actual.pullRequestEnvironment,
      update: {
        ...actual.pullRequestEnvironment.update,
        permissionAtom: () => (state.canUpdate ? allowed : denied),
      },
    },
  };
});

vi.mock("~/browser/useOpenLink", () => ({
  useOpenLink: (ref: unknown) => {
    state.refs(ref);
    return state.open;
  },
}));

function setup() {
  state.open.mockReset();
  state.open.mockResolvedValue(undefined);
  state.refs.mockClear();
  state.updateComment.mockReset();
  state.updateComment.mockResolvedValue({ _tag: "Success", value: undefined });
  state.update.mockReset();
  state.update.mockResolvedValue({ _tag: "Success", value: undefined });
  state.canUpdate = true;
  state.canWrite = true;
  state.locale = "en";
  state.toast.mockClear();
  state.timestampFormat = "locale";
}

import { act, render as renderUi } from "../../../test/render";
import { PullRequestSummaryTab } from "./PullRequestSummaryTab";

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
  checks: [
    { name: "Unit tests", status: "success", description: null, url: null },
  ],
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
    review: {
      inlineComment: false,
      reply: false,
      resolve: false,
      verdicts: [],
    },
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

// The comment filter persists to localStorage, so tests that touch it start and end empty.

const tab = (value = detail) => (
  <PullRequestSummaryTab
    scrollerRef={() => {}}
    environmentId={EnvironmentId.make("environment")}
    threadRef={null}
    reference={value}
    detail={value}
    activityPending={false}
    activityError={null}
    onRefresh={() => {}}
  />
);

async function render(value = detail) {
  const screen = await renderUi(tab(value));
  const { container } = screen;
  const heading = (title: string) => {
    const section = container.querySelector(`section[aria-label="${title}"]`);
    expect(section, `section ${title}`).not.toBeNull();
    return [...section!.querySelectorAll("button")].find(
      (button) => button.querySelector("span")?.textContent === title,
    )!;
  };
  return Object.assign(screen, {
    click: (title: string) => act(async () => heading(title).click()),
    expanded: (title: string) => heading(title).getAttribute("aria-expanded"),
    visibleText: () => container.innerText,
  });
}

it("keeps an unsaved description when collapsed and reopened, and after a failed save", async () => {
  setup();
  state.update.mockResolvedValue({
    _tag: "Failure",
    cause: new Error("offline"),
  });
  await using screen = await render();
  await act(async () =>
    screen.container
      .querySelector<HTMLButtonElement>('[aria-label="Edit description"]')!
      .click(),
  );
  const textarea = screen.container.querySelector("textarea")!;
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "Unsaved description");
  await screen.click("Description");
  expect(screen.expanded("Description")).toBe("false");
  await screen.click("Description");
  expect(screen.container.querySelector("textarea")!.value).toBe(
    "Unsaved description",
  );

  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(state.update).toHaveBeenCalledTimes(1);
  await expect
    .element(screen.getByRole("button", { name: "Save" }))
    .toBeEnabled();
  expect(screen.container.querySelector("textarea")!.value).toBe(
    "Unsaved description",
  );
});

it("ticks a description checkbox placed after an attachment and edits from the ticked body", async () => {
  setup();
  let finishSave = (_result: unknown) => {};
  state.update.mockReturnValueOnce(
    new Promise((resolve) => (finishSave = resolve)),
  );
  const body =
    "Intro\n\nhttps://example.com/shot.png\n\n## Test plan\n- [ ] First\n- [ ] Second";
  const ticked = body.replace("- [ ] Second", "- [x] Second");
  await using screen = await render({ ...detail, body, observedAt: 1 });
  const boxes = () =>
    screen.container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
  expect([...boxes()].map((box) => box.disabled)).toEqual([false, false]);

  await userEvent.click(boxes()[1]!);
  expect(state.update).toHaveBeenCalledWith({
    environmentId: "environment",
    input: expect.objectContaining({ number: 1, body: ticked }),
  });
  expect([...boxes()].map((box) => box.checked)).toEqual([false, true]);
  await act(async () => finishSave({ _tag: "Success", value: undefined }));

  // The host has not been read since the save, so the editor starts from the ticked body.
  await act(async () =>
    screen.container
      .querySelector<HTMLButtonElement>('[aria-label="Edit description"]')!
      .click(),
  );
  expect(screen.container.querySelector("textarea")!.value).toBe(ticked);
});

it("leaves description checkboxes read-only without the right to edit it", async () => {
  setup();
  const body = "- [ ] First";
  {
    await using screen = await render({
      ...detail,
      body,
      viewer: "someone-else",
    });
    expect(
      screen.container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )!.disabled,
    ).toBe(true);
  }
  state.canUpdate = false;
  await using screen = await render({ ...detail, body });
  expect(
    screen.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
      .disabled,
  ).toBe(true);
});

it.each(["en", "zh-CN"] as const)(
  "reveals the checks anchor independently of its translated title in %s",
  async (locale) => {
    setup();
    const onRevealSettled = vi.fn();
    const revealUrl = `${detail.url}/checks`;
    await using screen = await renderUi(
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <PullRequestSummaryTab
          scrollerRef={() => {}}
          environmentId={EnvironmentId.make("environment")}
          threadRef={null}
          reference={detail}
          detail={detail}
          activityPending={false}
          activityError={null}
          onRefresh={() => {}}
          revealUrl={revealUrl}
          onRevealSettled={onRevealSettled}
        />
      </WebI18nContext>,
    );
    await vi.waitFor(() =>
      expect(onRevealSettled).toHaveBeenCalledWith(revealUrl),
    );
    await expect
      .element(
        screen.getByRole("region", {
          name: translateWebMessage(locale, "pullRequests.checks.title"),
          exact: true,
        }),
      )
      .toBeVisible();
  },
);

it.each([
  ["owned", null],
  ["raw", new Error("Could not save the description")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)(
  "uses settlement locale for pull request description failure: %s",
  async (kind, failure) => {
    setup();
    const { AsyncResult } = await import("effect/reactivity");
    const Cause = await import("effect/Cause");
    type Result =
      import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
        void,
        unknown
      >;
    let finish = (_result: Result) => {};
    state.update.mockReturnValueOnce(
      new Promise<Result>((resolve) => {
        finish = resolve;
      }),
    );
    const refresh = vi.fn();
    const surface = (locale: "en" | "zh-CN") => {
      state.locale = locale;
      return (
        <WebI18nContext
          value={{
            locale,
            appLocale: locale,
            setAppLocale: () => {},
            t: (key, values) => translateWebMessage(locale, key, values),
          }}
        >
          <PullRequestSummaryTab
            scrollerRef={() => {}}
            environmentId={EnvironmentId.make("environment")}
            threadRef={null}
            reference={detail}
            detail={detail}
            activityPending={false}
            activityError={null}
            onRefresh={refresh}
          />
        </WebI18nContext>
      );
    };
    await using screen = await renderUi(surface("en"));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await userEvent.click(
      screen.getByRole("button", { name: "Edit description", exact: true }),
    );
    const draft = "Literal $& {description}\nKeep this draft";
    const input = screen.container.querySelector("textarea")!;
    await userEvent.clear(input);
    await userEvent.fill(input, draft);
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    await expect
      .element(screen.getByRole("button", { name: "Saving...", exact: true }))
      .toBeDisabled();
    expect(state.update).toHaveBeenCalledExactlyOnceWith({
      environmentId: EnvironmentId.make("environment"),
      input: { ...detail, body: draft },
    });
    expect(refresh).not.toHaveBeenCalled();
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure),
        ),
      );
    });
    await expect
      .element(screen.getByRole("button", { name: "保存", exact: true }))
      .toBeEnabled();
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法保存说明",
    });
    expect(screen.container.querySelector("textarea")!.value).toBe(draft);
    expect(refresh).toHaveBeenCalledTimes(1);
    await screen.rerender(surface("en"));
    expect(state.toast).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledTimes(1);
  },
);

it.each([
  ["owned", null],
  ["raw", new Error("Could not save the comment")],
  ["empty", new Error("")],
  ["interrupted", undefined],
] as const)(
  "uses settlement locale for pull request comment failure: %s",
  async (kind, failure) => {
    setup();
    const { AsyncResult } = await import("effect/reactivity");
    const Cause = await import("effect/Cause");
    type Result =
      import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
        void,
        unknown
      >;
    let finish = (_result: Result) => {};
    state.updateComment.mockReturnValueOnce(
      new Promise<Result>((resolve) => {
        finish = resolve;
      }),
    );
    const refresh = vi.fn();
    const withComment: PullRequestDetailView = {
      ...detail,
      commentCount: 1,
      comments: [
        {
          id: "comment-literal",
          kind: "issue-comment",
          path: null,
          reviewState: null,
          author: detail.author,
          body: "Original comment",
          createdAt: detail.createdAt,
          url: `${detail.url}#issuecomment-1`,
        },
      ],
    };
    const surface = (locale: "en" | "zh-CN") => {
      state.locale = locale;
      return (
        <WebI18nContext
          value={{
            locale,
            appLocale: locale,
            setAppLocale: () => {},
            t: (key, values) => translateWebMessage(locale, key, values),
          }}
        >
          <PullRequestSummaryTab
            scrollerRef={() => {}}
            environmentId={EnvironmentId.make("environment")}
            threadRef={null}
            reference={detail}
            detail={withComment}
            activityPending={false}
            activityError={null}
            onRefresh={refresh}
          />
        </WebI18nContext>
      );
    };
    await using screen = await renderUi(surface("en"));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await userEvent.click(
      screen.getByRole("button", { name: "Edit comment", exact: true }),
    );
    const draft = "Literal $& {comment}\nKeep this draft";
    const input = screen.container.querySelector("textarea")!;
    await userEvent.clear(input);
    await userEvent.fill(input, draft);
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    await expect
      .element(screen.getByRole("button", { name: "Saving...", exact: true }))
      .toBeDisabled();
    expect(state.updateComment).toHaveBeenCalledExactlyOnceWith({
      environmentId: EnvironmentId.make("environment"),
      input: {
        ...detail,
        commentId: "comment-literal",
        kind: "issue-comment",
        body: draft,
      },
    });
    expect(refresh).not.toHaveBeenCalled();
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure),
        ),
      );
    });
    await expect
      .element(screen.getByRole("button", { name: "保存", exact: true }))
      .toBeEnabled();
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: "无法保存评论",
    });
    expect(screen.container.querySelector("textarea")!.value).toBe(draft);
    expect(refresh).not.toHaveBeenCalled();
    await screen.rerender(surface("en"));
    expect(state.toast).toHaveBeenCalledTimes(1);
    expect(state.updateComment).toHaveBeenCalledTimes(1);
    expect(state.update).not.toHaveBeenCalled();
    state.canWrite = false;
    await screen.rerender(surface("en"));
    await expect
      .element(screen.getByRole("button", { name: "Save", exact: true }))
      .toBeDisabled();
    await userEvent.click(screen.container.querySelector("textarea")!);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(state.updateComment).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    await expect
      .element(
        screen.getByRole("button", { name: "Edit comment", exact: true }),
      )
      .toBeVisible();
    expect(state.updateComment).toHaveBeenCalledTimes(1);
  },
);

const checkRef = {
  environmentId: EnvironmentId.make("check-environment"),
  threadId: ThreadId.make("check-thread"),
};
const checkUrl = "https://checks.example.invalid/literal?value=$&{check}";
function checkSurface(locale: "en" | "zh-CN", withUrl = true) {
  state.locale = locale;
  const checks = [
    {
      name: "Literal $& {check}",
      status: "failure" as const,
      description: null,
      url: withUrl ? checkUrl : null,
    },
  ];
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <PullRequestSummaryTab
        scrollerRef={() => {}}
        environmentId={checkRef.environmentId}
        threadRef={checkRef}
        reference={detail}
        detail={{ ...detail, checks }}
        activityPending={false}
        activityError={null}
        onRefresh={() => {}}
      />
    </WebI18nContext>
  );
}
it.each([
  ["owned", null],
  ["raw", new Error("Unable to open check details")],
  ["empty", new Error("")],
  ["success", undefined],
] as const)(
  "uses settlement locale for summary check details: %s",
  async (kind, failure) => {
    setup();
    let resolve = () => {};
    let reject = (_error: unknown) => {};
    const pending = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    state.open.mockReturnValueOnce(pending);
    using logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await using screen = await renderUi(checkSurface("en"));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          resolve();
          await Promise.resolve();
        });
      },
    };
    await userEvent.click(
      screen.getByRole("button", { name: "Checks", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Literal \$& \{check\}/ }),
    );
    expect(state.open).toHaveBeenCalledExactlyOnceWith(checkUrl);
    expect(state.refs).toHaveBeenLastCalledWith(checkRef);
    expect(state.toast).not.toHaveBeenCalled();
    await screen.rerender(checkSurface("zh-CN"));
    await act(async () => {
      if (kind === "success") resolve();
      else reject(failure);
      await Promise.resolve();
    });
    if (kind === "success") {
      expect(state.toast).not.toHaveBeenCalled();
      expect(logged).not.toHaveBeenCalled();
    } else {
      expect(state.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: "无法打开检查详情",
      });
      expect(logged).toHaveBeenCalledExactlyOnceWith(failure);
    }
    await screen.rerender(checkSurface("en"));
    expect(state.open).toHaveBeenCalledTimes(1);
    expect(state.toast).toHaveBeenCalledTimes(kind === "success" ? 0 : 1);
  },
);
it("does not open summary check details without a URL", async () => {
  setup();
  await using screen = await renderUi(checkSurface("en", false));
  await userEvent.click(
    screen.getByRole("button", { name: "Checks", exact: true }),
  );
  const row = screen.getByRole("button", { name: /Literal \$& \{check\}/ });
  await expect.element(row).toBeDisabled();
  await act(async () => {
    row
      .element()
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true }),
      );
  });
  expect(state.open).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
});

it("fixes an overview thread as its opening remark, since it has no line to attach", async () => {
  setup();
  const author = { login: "reviewer", name: null, avatarUrl: null };
  const note = { author, createdAt: "2026-09-01T00:00:00Z", url: null };
  const remark = {
    ...note,
    id: "10",
    kind: "review-comment" as const,
    body: "Mention the flag in the README",
    path: null,
    reviewState: null,
  };
  const onFixFinding = vi.fn();
  const value: PullRequestDetailView = {
    ...detail,
    comments: [remark],
    overviewThreads: [
      {
        id: "overview",
        path: null,
        line: null,
        side: "right",
        isResolved: false,
        isOutdated: false,
        comments: [{ ...note, id: "10", body: remark.body }],
      },
    ],
  };
  await using screen = await renderUi(
    <PullRequestSummaryTab
      scrollerRef={() => {}}
      environmentId={EnvironmentId.make("environment")}
      threadRef={null}
      reference={value}
      detail={value}
      activityPending={false}
      activityError={null}
      onRefresh={() => {}}
      onFixFinding={onFixFinding}
    />,
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Fix in a thread" }),
  );
  expect(onFixFinding).toHaveBeenCalledWith({
    kind: "comment",
    comment: remark,
  });
});

it("shows a comment's exact time in the chosen 24-hour clock", async () => {
  setup();
  state.timestampFormat = "24-hour";
  const createdAt = "2026-09-01T17:30:00Z";
  const comment = {
    id: "10",
    kind: "review-comment" as const,
    body: "A remark",
    author: { login: "reviewer", name: null, avatarUrl: null },
    createdAt,
    url: null,
    path: null,
    reviewState: null,
  };
  await using screen = await render({
    ...detail,
    comments: [comment],
    commentCount: 1,
  });

  await userEvent.hover(
    screen.container.querySelector(`time[datetime="${createdAt}"]`)!,
  );
  const expected = new Date(createdAt).toLocaleString(undefined, {
    hour12: false,
  });
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-slot="tooltip-popup"]')?.textContent,
    ).toBe(expected),
  );
});

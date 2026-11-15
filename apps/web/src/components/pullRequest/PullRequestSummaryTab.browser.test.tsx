import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { SourceControlProviderKind } from "@t3tools/contracts";
import { EnvironmentId, ProjectId, type PullRequestDetailView } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

const state = vi.hoisted(() => ({
  update: vi.fn(),
  canUpdate: true,
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
  useAtomCommand: (() => state.update) as never,
}));
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
  useEnvironmentScope: () => true,
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

function setup() {
  state.update.mockReset();
  state.update.mockResolvedValue({ _tag: "Success", value: undefined });
  state.canUpdate = true;
  state.locale = "en";
  state.toast.mockClear();
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
  state.update.mockResolvedValue({ _tag: "Failure", cause: new Error("offline") });
  await using screen = await render();
  await act(async () =>
    screen.container.querySelector<HTMLButtonElement>('[aria-label="Edit description"]')!.click(),
  );
  const textarea = screen.container.querySelector("textarea")!;
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "Unsaved description");
  await screen.click("Description");
  expect(screen.expanded("Description")).toBe("false");
  await screen.click("Description");
  expect(screen.container.querySelector("textarea")!.value).toBe("Unsaved description");

  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(state.update).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(screen.container.querySelector("textarea")!.value).toBe("Unsaved description");
});

it("ticks a description checkbox placed after an attachment and edits from the ticked body", async () => {
  setup();
  let finishSave = (_result: unknown) => {};
  state.update.mockReturnValueOnce(new Promise((resolve) => (finishSave = resolve)));
  const body = "Intro\n\nhttps://example.com/shot.png\n\n## Test plan\n- [ ] First\n- [ ] Second";
  const ticked = body.replace("- [ ] Second", "- [x] Second");
  await using screen = await render({ ...detail, body, observedAt: 1 });
  const boxes = () => screen.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
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
    screen.container.querySelector<HTMLButtonElement>('[aria-label="Edit description"]')!.click(),
  );
  expect(screen.container.querySelector("textarea")!.value).toBe(ticked);
});

it("leaves description checkboxes read-only without the right to edit it", async () => {
  setup();
  const body = "- [ ] First";
  {
    await using screen = await render({ ...detail, body, viewer: "someone-else" });
    expect(
      screen.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled,
    ).toBe(true);
  }
  state.canUpdate = false;
  await using screen = await render({ ...detail, body });
  expect(screen.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(
    true,
  );
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
    await vi.waitFor(() => expect(onRevealSettled).toHaveBeenCalledWith(revealUrl));
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
    type Result = import("@t3tools/client-runtime/state/runtime").AtomCommandResult<void, unknown>;
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
    await userEvent.click(screen.getByRole("button", { name: "Edit description", exact: true }));
    const draft = "Literal $& {description}\nKeep this draft";
    const input = screen.container.querySelector("textarea")!;
    await userEvent.clear(input);
    await userEvent.fill(input, draft);
    await userEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
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
      finish(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure)));
    });
    await expect.element(screen.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
    expect(state.toast).toHaveBeenCalledExactlyOnceWith({ type: "error", title: "无法保存说明" });
    expect(screen.container.querySelector("textarea")!.value).toBe(draft);
    expect(refresh).toHaveBeenCalledTimes(1);
    await screen.rerender(surface("en"));
    expect(state.toast).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledTimes(1);
  },
);

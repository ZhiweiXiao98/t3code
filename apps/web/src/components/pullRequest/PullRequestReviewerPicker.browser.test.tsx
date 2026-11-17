import { EnvironmentId, ProjectId, type PullRequestReviewerCandidate } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { PullRequestReviewerPicker } from "./PullRequestReviewerPicker";
import { readableFailure } from "./pullRequestDetail.logic";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  requested: false,
  truncated: false,
  searchable: false,
  searchFailure: false,
  requestReviewers: vi.fn(),
  toast: vi.fn(),
  query: vi.fn(),
  search: vi.fn(),
}));
const label = "Literal $& {reviewer}";
const environmentId = EnvironmentId.make("reviewer-picker");
const reference = {
  projectId: ProjectId.make("project"),
  repository: "owner/repo",
  number: 1,
};
vi.mock("~/state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  const { pullRequestEnvironment } = await import("../../state/pullRequests");
  return {
    ...actual,
    useAtomCommand: (command: unknown) => {
      if (command === pullRequestEnvironment.requestReviewers) return fixture.requestReviewers;
      throw new Error("Unexpected command");
    },
  };
});
vi.mock("~/state/pullRequests", async (original) => {
  const actual = await original<typeof import("../../state/pullRequests")>();
  const { Atom, AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  const candidates = [false, true].map((isRequested) =>
    Atom.make(
      AsyncResult.success({
        candidates: [
          {
            id: "reviewer-id",
            login: "Literal $& {reviewer}",
            name: null,
            avatarUrl: null,
            kind: "user",
            isRequested,
          } satisfies PullRequestReviewerCandidate,
        ],
        truncated: false,
      }),
    ),
  );
  const truncatedCandidates = candidates.map((atom) =>
    Atom.map(atom, (result) => AsyncResult.map(result, (data) => ({ ...data, truncated: true }))),
  );
  const searchFailure = Atom.make(
    AsyncResult.failure(Cause.fail(new Error("Literal $& {host error}"))),
  );
  return {
    ...actual,
    pullRequestEnvironment: {
      ...actual.pullRequestEnvironment,
      reviewerSearch: (input: unknown) => {
        fixture.search(input);
        return fixture.searchFailure ? searchFailure : truncatedCandidates[0]!;
      },
      reviewerCandidates: (input: unknown) => {
        fixture.query(input);
        return (fixture.truncated ? truncatedCandidates : candidates)[fixture.requested ? 1 : 0]!;
      },
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
vi.mock("~/i18n/readWebI18n", () => ({
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
function surface(locale: "en" | "zh-CN", allowed = true) {
  fixture.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <PullRequestReviewerPicker
        environmentId={environmentId}
        reference={reference}
        allowed={allowed}
        searchable={fixture.searchable}
      />
    </WebI18nContext>
  );
}
function setup(applied = false) {
  fixture.requested = applied;
  fixture.truncated = false;
  fixture.searchable = false;
  fixture.searchFailure = false;
  fixture.locale = "en";
  fixture.requestReviewers.mockReset();
  fixture.toast.mockClear();
  fixture.query.mockClear();
  fixture.search.mockClear();
}
const hint = "托管服务拒绝了操作。请确认你拥有此仓库的写入权限，并且对方仍可访问该仓库。";
for (const applied of [false, true]) {
  it.each([
    ["owned", null],
    [
      "raw",
      new Error(
        "The host refused it. Check that you have write access on this repository, and that they still have access to it.",
      ),
    ],
    ["empty", new Error("")],
    ["interrupted", undefined],
  ] as const)(
    `uses settlement locale for reviewer ${applied ? "withdraw" : "request"} failure: %s`,
    async (kind, failure) => {
      setup(applied);
      type Result = AtomCommandResult<void, unknown>;
      let finish = (_result: Result) => {};
      fixture.requestReviewers.mockReturnValueOnce(
        new Promise<Result>((resolve) => {
          finish = resolve;
        }),
      );
      await using screen = await render(surface("en"));
      await using _settle = {
        async [Symbol.asyncDispose]() {
          await act(async () => {
            finish(AsyncResult.failure(Cause.interrupt()));
            await Promise.resolve();
          });
        },
      };
      await userEvent.click(
        screen.getByRole("combobox", { name: "Request a review", exact: true }),
      );
      const option = page.getByRole("option").filter({ hasText: label });
      await userEvent.click(option);
      expect(fixture.requestReviewers).not.toHaveBeenCalled();
      await userEvent.keyboard("{Escape}");
      await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
      await expect.poll(() => fixture.requestReviewers.mock.calls.length).toBe(1);
      expect(fixture.requestReviewers).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: {
          ...reference,
          reviewers: [{ id: "reviewer-id", kind: "user" }],
          requested: !applied,
        },
      });
      expect(fixture.query).toHaveBeenCalledWith({
        environmentId,
        input: reference,
      });
      await screen.rerender(surface("zh-CN"));
      const result: Result = AsyncResult.failure(
        kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure),
      );
      await act(async () => {
        finish(result);
      });
      await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
        type: "error",
        title: applied ? `无法撤回向 ${label} 发出的评审请求` : `无法请求 ${label} 进行评审`,
        description:
          kind === "raw"
            ? "The host refused it. Check that you have write access on this repository, and that they still have access to it."
            : kind === "interrupted"
              ? readableFailure(squashAtomCommandFailure(result), hint)
              : hint,
      });
      await screen.rerender(surface("en"));
      expect(fixture.toast).toHaveBeenCalledTimes(1);
      expect(fixture.requestReviewers).toHaveBeenCalledTimes(1);
      expect(fixture.search).not.toHaveBeenCalled();
      await userEvent.keyboard("{Escape}");
      await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    },
  );
}
it("does not open reviewers when denied or mutate after Escape", async () => {
  setup();
  await using screen = await render(surface("en", false));
  const trigger = screen.getByRole("button", {
    name: "Request a review",
    exact: true,
  });
  await expect.element(trigger).toHaveAttribute("aria-disabled", "true");
  await act(async () => {
    trigger.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  expect(fixture.query).not.toHaveBeenCalled();
  await screen.rerender(surface("en"));
  await userEvent.click(screen.getByRole("combobox", { name: "Request a review", exact: true }));
  await expect.element(page.getByRole("option").filter({ hasText: label })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  expect(fixture.requestReviewers).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
});

it.each([
  { action: "request", requested: false },
  { action: "withdraw", requested: true },
])("uses settlement locale for reviewer $action success", async ({ requested }) => {
  setup(requested);
  type Result = AtomCommandResult<void, unknown>;
  let finish = (_result: Result) => {};
  fixture.requestReviewers.mockReturnValueOnce(
    new Promise<Result>((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await userEvent.click(screen.getByRole("combobox", { name: "Request a review", exact: true }));
  const option = page.getByRole("option").filter({ hasText: label });
  await userEvent.click(option);
  expect(fixture.requestReviewers).not.toHaveBeenCalled();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  await expect.poll(() => fixture.requestReviewers.mock.calls.length).toBe(1);
  expect(fixture.requestReviewers).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: {
      ...reference,
      reviewers: [{ id: "reviewer-id", kind: "user" }],
      requested: !requested,
    },
  });
  expect(fixture.toast).not.toHaveBeenCalled();
  await screen.rerender(surface("zh-CN"));
  await act(async () => {
    finish(AsyncResult.success(undefined));
  });
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
    type: "success",
    title: requested ? `已撤回向 ${label} 发出的评审请求` : `已请求 ${label} 进行评审`,
  });
  expect(fixture.search).not.toHaveBeenCalled();
  await screen.rerender(surface("en"));
  expect(fixture.requestReviewers).toHaveBeenCalledTimes(1);
  expect(fixture.toast).toHaveBeenCalledTimes(1);
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
});

it.each([
  {
    name: "unsearchable",
    searchable: false,
    search: false,
    failure: false,
    en: "This repository has more people with access than are listed here. Ask for the rest on the host.",
    zh: "此处未列出所有有权访问的人员，请在托管服务中选择其余人员。",
  },
  {
    name: "searchable",
    searchable: true,
    search: false,
    failure: false,
    en: "This repository has more people with access than are listed here. Search to find them.",
    zh: "此处未列出所有有权访问的人员，请搜索以查找其余人员。",
  },
  {
    name: "search-failed",
    searchable: true,
    search: true,
    failure: true,
    en: "Only the people already listed are matched: the host search failed. Literal $& {host error}",
    zh: "仅匹配已列出的人员：托管服务搜索失败。Literal $& {host error}",
  },
  {
    name: "search-truncated",
    searchable: true,
    search: true,
    failure: false,
    en: "More people match than the host returned. Keep typing to narrow it down.",
    zh: "匹配的人员多于托管服务返回的结果，请继续输入以缩小范围。",
  },
])("translates reviewer truncation notice: $name", async (scenario) => {
  setup();
  fixture.truncated = true;
  fixture.searchable = scenario.searchable;
  fixture.searchFailure = scenario.failure;
  await using screen = await render(surface("en"));
  await userEvent.click(screen.getByRole("combobox", { name: "Request a review", exact: true }));
  if (scenario.search) {
    await userEvent.fill(
      page.getByRole("combobox", {
        name: "Search people with access",
        exact: true,
      }),
      "Literal",
    );
    await vi.waitFor(() =>
      expect(fixture.search).toHaveBeenCalledWith({
        environmentId,
        input: { ...reference, query: "Literal" },
      }),
    );
  }
  await expect.element(page.getByText(scenario.en, { exact: true })).toBeVisible();
  const notice = page.getByText(scenario.en, { exact: true }).element();
  const searchCalls = fixture.search.mock.calls.length;
  await screen.rerender(surface("zh-CN"));
  expect(notice.isConnected).toBe(true);
  await expect.poll(() => notice.textContent).toBe(scenario.zh);
  await expect.element(page.getByRole("option").filter({ hasText: label })).toBeVisible();
  await screen.rerender(surface("en"));
  await expect.element(page.getByText(scenario.en, { exact: true })).toBeVisible();
  if (!scenario.search) expect(searchCalls).toBe(0);
  expect(fixture.requestReviewers).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
});

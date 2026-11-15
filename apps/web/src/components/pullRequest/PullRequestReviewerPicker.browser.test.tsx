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
  requestReviewers: vi.fn(),
  toast: vi.fn(),
  query: vi.fn(),
  search: vi.fn(),
}));
const label = "Literal $& {reviewer}";
const environmentId = EnvironmentId.make("reviewer-picker");
const reference = { projectId: ProjectId.make("project"), repository: "owner/repo", number: 1 };
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
  return {
    ...actual,
    pullRequestEnvironment: {
      ...actual.pullRequestEnvironment,
      reviewerSearch: (input: unknown) => {
        fixture.search(input);
        return candidates[0]!;
      },
      reviewerCandidates: (input: unknown) => {
        fixture.query(input);
        return candidates[fixture.requested ? 1 : 0]!;
      },
    },
  };
});
vi.mock("../ui/toast", async (original) => {
  const actual = await original<typeof import("../ui/toast")>();
  return { ...actual, toastManager: { ...actual.toastManager, add: fixture.toast } };
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
        searchable={false}
      />
    </WebI18nContext>
  );
}
function setup(applied = false) {
  fixture.requested = applied;
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
      await expect.element(option).toHaveAttribute("aria-disabled", "true");
      expect(fixture.requestReviewers).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: {
          ...reference,
          reviewers: [{ id: "reviewer-id", kind: "user" }],
          requested: !applied,
        },
      });
      expect(fixture.query).toHaveBeenCalledWith({ environmentId, input: reference });
      await screen.rerender(surface("zh-CN"));
      const result: Result = AsyncResult.failure(
        kind === "interrupted" ? Cause.interrupt() : Cause.fail(failure),
      );
      await act(async () => {
        finish(result);
      });
      await expect.element(option).not.toHaveAttribute("aria-disabled", "true");
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
  const trigger = screen.getByRole("button", { name: "Request a review", exact: true });
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
  await expect.element(option).toHaveAttribute("aria-disabled", "true");
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
  await expect.element(option).not.toHaveAttribute("aria-disabled", "true");
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

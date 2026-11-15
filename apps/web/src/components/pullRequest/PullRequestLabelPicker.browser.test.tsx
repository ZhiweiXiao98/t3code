import { EnvironmentId, ProjectId, type PullRequestLabelCandidate } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { PullRequestLabelPicker } from "./PullRequestLabelPicker";
import { readableFailure } from "./pullRequestDetail.logic";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  applied: false,
  setLabels: vi.fn(),
  toast: vi.fn(),
  query: vi.fn(),
}));
const label = "Literal $& {label}";
const environmentId = EnvironmentId.make("label-picker");
const reference = { projectId: ProjectId.make("project"), repository: "owner/repo", number: 1 };
vi.mock("~/state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  const { pullRequestEnvironment } = await import("../../state/pullRequests");
  return {
    ...actual,
    useAtomCommand: (command: unknown) => {
      if (command === pullRequestEnvironment.setLabels) return fixture.setLabels;
      throw new Error("Unexpected command");
    },
  };
});
vi.mock("~/state/pullRequests", async (original) => {
  const actual = await original<typeof import("../../state/pullRequests")>();
  const { Atom, AsyncResult } = await import("effect/reactivity");
  const candidates = [false, true].map((isApplied) =>
    Atom.make(
      AsyncResult.success({
        candidates: [
          {
            name: "Literal $& {label}",
            color: null,
            description: null,
            isApplied,
          } satisfies PullRequestLabelCandidate,
        ],
        truncated: false,
      }),
    ),
  );
  return {
    ...actual,
    pullRequestEnvironment: {
      ...actual.pullRequestEnvironment,
      labelCandidates: (input: unknown) => {
        fixture.query(input);
        return candidates[fixture.applied ? 1 : 0]!;
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
      <PullRequestLabelPicker
        environmentId={environmentId}
        reference={reference}
        allowed={allowed}
      />
    </WebI18nContext>
  );
}
function setup(applied = false) {
  fixture.applied = applied;
  fixture.locale = "en";
  fixture.setLabels.mockReset();
  fixture.toast.mockClear();
  fixture.query.mockClear();
}
const hint = "托管服务拒绝了操作。请确认你拥有此仓库的分类权限。";
for (const applied of [false, true]) {
  it.each([
    ["owned", null],
    [
      "raw",
      new Error("The host refused it. Check that you have triage access on this repository."),
    ],
    ["empty", new Error("")],
    ["interrupted", undefined],
  ] as const)(
    `uses settlement locale for label ${applied ? "remove" : "add"} failure: %s`,
    async (kind, failure) => {
      setup(applied);
      type Result = AtomCommandResult<void, unknown>;
      let finish = (_result: Result) => {};
      fixture.setLabels.mockReturnValueOnce(
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
      await userEvent.click(screen.getByRole("combobox", { name: "Change labels", exact: true }));
      const option = page.getByRole("option").filter({ hasText: label });
      await userEvent.click(option);
      await expect.element(option).toHaveAttribute("aria-disabled", "true");
      expect(fixture.setLabels).toHaveBeenCalledExactlyOnceWith({
        environmentId,
        input: { ...reference, labels: [label], applied: !applied },
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
        title: `${applied ? "无法移除标签" : "无法添加标签"} ${label}`,
        description:
          kind === "raw"
            ? "The host refused it. Check that you have triage access on this repository."
            : kind === "interrupted"
              ? readableFailure(squashAtomCommandFailure(result), hint)
              : hint,
      });
      await screen.rerender(surface("en"));
      expect(fixture.toast).toHaveBeenCalledTimes(1);
      expect(fixture.setLabels).toHaveBeenCalledTimes(1);
      await userEvent.keyboard("{Escape}");
      await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    },
  );
}
it("does not open labels when denied or mutate after Escape", async () => {
  setup();
  await using screen = await render(surface("en", false));
  const trigger = screen.getByRole("button", { name: "Change labels", exact: true });
  await expect.element(trigger).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(trigger);
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  expect(fixture.query).not.toHaveBeenCalled();
  await screen.rerender(surface("en"));
  await userEvent.click(screen.getByRole("combobox", { name: "Change labels", exact: true }));
  await expect.element(page.getByRole("option").filter({ hasText: label })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  expect(fixture.setLabels).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
});

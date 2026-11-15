import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

const state = vi.hoisted(() => ({
  detail: "",
  controlled: false,
  run: vi.fn(),
  acted: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));

vi.mock(import("~/state/use-atom-command"), async (original) => {
  const actual = await original();
  const { pullRequestEnvironment } = await import("~/state/pullRequests");
  const { PullRequestOperationError } = await import("@t3tools/contracts");
  const { Cause } = await import("effect");
  const { AsyncResult } = await import("effect/reactivity");
  return {
    ...actual,
    useAtomCommand: ((command: unknown, options: Parameters<typeof actual.useAtomCommand>[1]) =>
      command !== pullRequestEnvironment.runAction
        ? actual.useAtomCommand(command as never, options)
        : state.controlled
          ? state.run
          : async () =>
              AsyncResult.failure(
                Cause.fail(
                  new PullRequestOperationError({ operation: "runAction", detail: state.detail }),
                ),
              )) as never,
  };
});

import "~/index.css";
import { act, render } from "../../../test/render";
import { ToastProvider } from "../ui/toast";
import { PullRequestStackMenu } from "./PullRequestStackMenu";

function setup(detail: string) {
  state.detail = detail;
}

const HEAD_MOVED = "The stack head moved. Refresh the stack before trying again.";

it.each([
  { label: "Merge stack", detail: HEAD_MOVED, description: HEAD_MOVED },
  { label: "Rebase stack", detail: HEAD_MOVED, description: HEAD_MOVED },
  {
    label: "Rebase stack",
    detail: "GitHub CLI command failed.",
    description:
      "The host refused the rebase. A rebase stops at the first commit that does not apply cleanly.",
  },
])("$label refused with $detail shows $description", async (row) => {
  setup(row.detail);
  await using screen = await render(
    <ToastProvider>
      <PullRequestStackMenu
        environmentId={EnvironmentId.make("environment")}
        reference={{
          projectId: ProjectId.make("project"),
          repository: "owner/repository",
          number: 2,
        }}
        hostLabel="GitHub"
        terminology={sourceControlClients.get("github").changeRequest}
        stack={{
          id: "stack",
          number: 1,
          url: "https://github.com/owner/repository/stack/1",
          base: "main",
          layers: [{ number: 2, headBranch: "feature", headSha: "abc123", state: "open" }],
        }}
        canMerge
        stale={false}
        canRebase
        mergeMethod="squash"
        onActed={() => {}}
      />
    </ToastProvider>,
  );
  if (row.label === "Rebase stack") {
    await screen.getByRole("button", { name: "Stack 1, layer 1 of 1" }).click();
    await page.getByRole("menuitem", { name: row.label }).click();
  } else {
    await screen.getByRole("button", { name: row.label, exact: true }).click();
  }
  await page.getByRole("dialog").getByRole("button", { name: row.label, exact: true }).click();
  await expect.element(page.getByText(row.description, { exact: true })).toBeInTheDocument();
});

import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { toastManager } from "../ui/toast";
vi.mock(import("~/i18n/readWebI18n"), () => ({
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
const reference = {
  projectId: ProjectId.make("project"),
  repository: "owner/repository",
  number: 2,
};
function surface(locale: "en" | "zh-CN", hostLabel = "GitHub") {
  state.locale = locale;
  return (
    <WebI18nContext.Provider
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <PullRequestStackMenu
        environmentId={EnvironmentId.make("environment")}
        reference={reference}
        hostLabel={hostLabel}
        terminology={sourceControlClients.get("github").changeRequest}
        stack={{
          id: "stack",
          number: 1,
          url: "https://github.com/owner/repository/stack/1",
          base: "main",
          layers: [
            { number: 2, headBranch: "feature/$&/{literal}", headSha: "abc123", state: "open" },
          ],
        }}
        canMerge
        canRebase
        stale={false}
        mergeMethod="squash"
        onActed={state.acted}
      />
    </WebI18nContext.Provider>
  );
}
it.each([
  ["merge owned", "merge", null],
  ["rebase owned", "update-branch", null],
  ["merge raw", "merge", new Error("Literal $& {host failure}")],
  ["rebase empty", "update-branch", new Error("")],
  ["rebase interrupted", "update-branch", undefined],
] as const)("uses settlement locale for stack failure: %s", async (kind, action, cause) => {
  const { AsyncResult } = await import("effect/reactivity");
  const Cause = await import("effect/Cause");
  type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  using _restore = {
    [Symbol.dispose]() {
      state.controlled = false;
      state.locale = "en";
      state.run.mockReset();
    },
  };
  state.controlled = true;
  state.acted.mockClear();
  let finish = (_result: Result) => {};
  state.run.mockReset().mockReturnValueOnce(
    new Promise<Result>((resolve) => {
      finish = resolve;
    }),
  );
  using add = vi.spyOn(toastManager, "add").mockReturnValue("stack-failure-toast");
  using update = vi.spyOn(toastManager, "update").mockImplementation(() => {});
  await using screen = await render(surface("en"));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  const label = action === "merge" ? "Merge stack" : "Rebase stack";
  if (action === "merge") await screen.getByRole("button", { name: label, exact: true }).click();
  else {
    await screen.getByRole("button", { name: "Stack 1, layer 1 of 1" }).click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  }
  expect(state.run).not.toHaveBeenCalled();
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
  expect(state.run).toHaveBeenCalledExactlyOnceWith({
    environmentId: EnvironmentId.make("environment"),
    input: {
      ...reference,
      stackNumber: 1,
      expectedStackHeads: [{ number: 2, headSha: "abc123" }],
      action,
      ...(action === "merge" ? { mergeMethod: "squash" } : { updateMethod: "rebase" }),
    },
  });
  expect(add).toHaveBeenCalledExactlyOnceWith({
    type: "loading",
    title: action === "merge" ? "Merging stack..." : "Rebasing stack...",
  });
  const pending = screen.getByRole("button", { name: "Merge stack", exact: true });
  await expect.element(pending).toBeDisabled();
  await act(async () => {
    pending.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(state.run).toHaveBeenCalledTimes(1);
  expect(state.acted).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  await screen.rerender(surface("zh-CN"));
  await act(async () => {
    finish(
      AsyncResult.failure(kind.endsWith("interrupted") ? Cause.interrupt() : Cause.fail(cause)),
    );
    await Promise.resolve();
  });
  expect(update).toHaveBeenCalledExactlyOnceWith("stack-failure-toast", {
    type: "error",
    title: action === "merge" ? "无法合并堆叠" : "无法变基堆叠",
    description: kind.endsWith("raw")
      ? "Literal $& {host failure}"
      : kind.endsWith("interrupted")
        ? "All fibers interrupted without error"
        : action === "merge"
          ? "托管服务拒绝了合并。请确认你拥有写入权限、所需检查均已通过，并且分支没有冲突。"
          : "主机拒绝了变基。变基会在首个无法顺利应用的提交处停止。",
  });
  expect(state.acted).toHaveBeenCalledExactlyOnceWith();
  expect(state.acted.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]!);
  await screen.rerender(surface("en"));
  await expect
    .element(screen.getByRole("button", { name: "Merge stack", exact: true }))
    .toBeEnabled();
  expect(state.run).toHaveBeenCalledTimes(1);
  expect(add).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(1);
});

it.each(["merge", "update-branch"] as const)(
  "uses settlement locale for stack success: %s",
  async (action) => {
    const { AsyncResult } = await import("effect/reactivity");
    const Cause = await import("effect/Cause");
    type Result =
      | ReturnType<typeof AsyncResult.success<undefined>>
      | ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
    using _restore = {
      [Symbol.dispose]() {
        state.controlled = false;
        state.locale = "en";
        state.run.mockReset();
      },
    };
    state.controlled = true;
    state.acted.mockClear();
    let finish = (_result: Result) => {};
    state.run.mockReset().mockReturnValueOnce(
      new Promise<Result>((resolve) => {
        finish = resolve;
      }),
    );
    using add = vi.spyOn(toastManager, "add").mockReturnValue("stack-success-toast");
    using update = vi.spyOn(toastManager, "update").mockImplementation(() => {});
    await using screen = await render(surface("en", "Literal $& {host}"));
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    const label = action === "merge" ? "Merge stack" : "Rebase stack";
    if (action === "merge") await screen.getByRole("button", { name: label, exact: true }).click();
    else {
      await screen.getByRole("button", { name: "Stack 1, layer 1 of 1" }).click();
      await page.getByRole("menuitem", { name: label, exact: true }).click();
    }
    expect(state.run).not.toHaveBeenCalled();
    await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
    expect(state.run).toHaveBeenCalledExactlyOnceWith({
      environmentId: EnvironmentId.make("environment"),
      input: {
        ...reference,
        stackNumber: 1,
        expectedStackHeads: [{ number: 2, headSha: "abc123" }],
        action,
        ...(action === "merge" ? { mergeMethod: "squash" } : { updateMethod: "rebase" }),
      },
    });
    expect(add).toHaveBeenCalledExactlyOnceWith({
      type: "loading",
      title: action === "merge" ? "Merging stack..." : "Rebasing stack...",
    });
    const pending = screen.getByRole("button", { name: "Merge stack", exact: true });
    await expect.element(pending).toBeDisabled();
    await act(async () => {
      pending.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(state.acted).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    await screen.rerender(surface("zh-CN", "Literal $& {host}"));
    await act(async () => {
      finish(AsyncResult.success(undefined));
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalledExactlyOnceWith("stack-success-toast", {
      type: "success",
      title: action === "merge" ? "堆叠合并请求已完成" : "堆叠已变基",
      description:
        action === "merge" ? "Literal $& {host} 已合并堆叠或将其加入合并队列。" : undefined,
    });
    expect(state.acted).toHaveBeenCalledExactlyOnceWith();
    expect(state.acted.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0]!,
    );
    await screen.rerender(surface("en", "Literal $& {host}"));
    await expect
      .element(screen.getByRole("button", { name: "Merge stack", exact: true }))
      .toBeEnabled();
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  },
);

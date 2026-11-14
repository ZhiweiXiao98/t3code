import "~/index.css";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import type { ChildThreadApproval } from "@t3tools/client-runtime/state/thread-requests";
import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";

const state = vi.hoisted(() => ({
  respond: vi.fn(),
  approvalsAtom: null as unknown,
  allowed: true,
}));

vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  useEnvironmentScope: () => state.allowed,
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.respond }));
vi.mock("../../state/threads", () => ({
  childThreadApprovalsAtom: () => state.approvalsAtom,
  threadEnvironment: { respondToApproval: {} },
}));

import { ChildThreadApprovals } from "./ChildThreadApprovals";

function setup(live = true) {
  state.allowed = true;
  state.respond.mockReset();
  state.respond
    .mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error("Child environment offline"))))
    .mockResolvedValueOnce(AsyncResult.success(undefined));
  const thread = {
    environmentId: EnvironmentId.make("child-env"),
    threadId: ThreadId.make("child"),
  };
  state.approvalsAtom = Atom.make<ReadonlyArray<ChildThreadApproval>>([
    {
      thread,
      title: "Compile task",
      approval: {
        requestId: RuntimeRequestId.make("approval"),
        requestKind: "command",
        detail: "Run compiler",
        createdAt: "2026-11-01T00:00:00.000Z",
        responseCapability: live ? "live" : "not_resumable",
      },
    },
  ]);
  return thread;
}

it("shows a failed decision and clears the error when the user retries", async () => {
  const thread = setup();
  await using screen = await render(<ChildThreadApprovals threadRef={thread} />);
  await screen.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("Child environment offline");
  await screen.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
});

function surface(locale: "en" | "zh-CN", thread: ReturnType<typeof setup>) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <ChildThreadApprovals threadRef={thread} />
    </WebI18nContext>
  );
}

it("keeps owned approval failure current without repeating a decision", async () => {
  const thread = setup();
  let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
  state.respond.mockReset().mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en", thread));
  await screen.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.element(screen.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await screen.rerender(surface("zh-CN", thread));
  finish(AsyncResult.failure(Cause.fail(null)));
  await expect
    .poll(() => screen.container.querySelector('[role="alert"]')?.textContent)
    .toBe("提交审批决定失败。");
  for (const locale of ["en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale, thread));
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(
        locale === "en" ? "Failed to submit approval decision." : "提交审批决定失败。",
      );
  }
  expect(state.respond).toHaveBeenCalledExactlyOnceWith({
    environmentId: thread.environmentId,
    input: {
      threadId: thread.threadId,
      requestId: RuntimeRequestId.make("approval"),
      decision: "accept",
    },
  });
});

it.each(["Failed to submit approval decision.", ""])(
  "preserves raw approval failure %j",
  async (message) => {
    const thread = setup();
    state.respond
      .mockReset()
      .mockResolvedValue(AsyncResult.failure(Cause.fail(new Error(message))));
    await using screen = await render(surface("en", thread));
    await screen.getByRole("button", { name: "Approve", exact: true }).click();
    for (const locale of ["en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale, thread));
      await expect.element(screen.getByRole("alert")).toBeInTheDocument();
      await expect
        .poll(() => screen.container.querySelector('[role="alert"]')?.textContent)
        .toBe(message);
    }
    expect(state.respond).toHaveBeenCalledTimes(1);
  },
);

it("keeps interrupted approval silent and allows retry", async () => {
  const thread = setup();
  state.respond.mockReset().mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
  await using screen = await render(surface("en", thread));
  await screen.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.element(screen.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  expect(state.respond).toHaveBeenCalledTimes(1);
});

it.each(["scope", "process"] as const)("does not respond with unavailable %s", async (guard) => {
  const thread = setup(guard !== "process");
  state.allowed = guard !== "scope";
  await using screen = await render(surface("en", thread));
  await expect.element(screen.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  expect(state.respond).not.toHaveBeenCalled();
});

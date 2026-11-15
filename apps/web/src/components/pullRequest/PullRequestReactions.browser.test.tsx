import { EnvironmentId, ProjectId, type PullRequestReaction } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { PullRequestReactionBar } from "./PullRequestReactions";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  mutate: vi.fn(),
  toast: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("~/state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../../state/use-atom-command")>();
  const { pullRequestEnvironment } = await import("../../state/pullRequests");
  return {
    ...actual,
    useAtomCommand: (command: unknown) => {
      if (command === pullRequestEnvironment.setReaction) return fixture.mutate;
      throw new Error("Unexpected command");
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
const environmentId = EnvironmentId.make("reactions");
const reference = { projectId: ProjectId.make("project"), repository: "owner/repo", number: 1 };
const reactions: readonly PullRequestReaction[] = [
  { content: "thumbs-up", count: 1, actors: ["Literal $& {actor}"], viewerHasReacted: false },
];
function surface(locale: "en" | "zh-CN", canReact = true, subjectId?: string) {
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
      <PullRequestReactionBar
        environmentId={environmentId}
        reference={reference}
        reactions={reactions}
        canReact={canReact}
        subjectId={subjectId}
        onRefresh={fixture.refresh}
      />
    </WebI18nContext>
  );
}
function setup() {
  fixture.locale = "en";
  fixture.mutate.mockReset();
  fixture.toast.mockClear();
  fixture.refresh.mockClear();
}
it.each([
  { name: "owned", failure: null, subjectId: undefined },
  {
    name: "raw",
    failure: new Error("The reaction could not be saved"),
    subjectId: "Literal $& {comment}",
  },
  { name: "empty", failure: new Error(""), subjectId: undefined },
  { name: "interrupted", failure: undefined, subjectId: undefined },
])("uses settlement locale for reaction failure: $name", async ({ name, failure, subjectId }) => {
  setup();
  type Result = AtomCommandResult<void, unknown>;
  let finish = (_result: Result) => {};
  fixture.mutate.mockReturnValueOnce(
    new Promise<Result>((resolve) => {
      finish = resolve;
    }),
  );
  await using screen = await render(surface("en", true, subjectId));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await userEvent.click(screen.getByRole("button", { name: "thumbs up, 1", exact: true }));
  await expect
    .element(screen.getByRole("button", { name: "thumbs up, 2", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  expect(fixture.mutate).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: {
      ...reference,
      ...(subjectId === undefined ? {} : { subjectId }),
      content: "thumbs-up",
      reacted: true,
    },
  });
  expect(fixture.toast).not.toHaveBeenCalled();
  await screen.rerender(surface("zh-CN", true, subjectId));
  await expect
    .element(screen.getByRole("button", { name: "赞, 2", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await act(async () => {
    finish(AsyncResult.failure(name === "interrupted" ? Cause.interrupt() : Cause.fail(failure)));
  });
  await expect
    .element(screen.getByRole("button", { name: "赞, 1", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
  expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({ type: "error", title: "无法保存回应" });
  expect(fixture.refresh).not.toHaveBeenCalled();
  expect(reactions).toEqual([
    { content: "thumbs-up", count: 1, actors: ["Literal $& {actor}"], viewerHasReacted: false },
  ]);
  await screen.rerender(surface("en", true, subjectId));
  await expect
    .element(screen.getByRole("button", { name: "thumbs up, 1", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
  expect(fixture.toast).toHaveBeenCalledTimes(1);
  expect(fixture.mutate).toHaveBeenCalledTimes(1);
});
it("does not mutate a native disabled reaction", async () => {
  setup();
  await using screen = await render(surface("en", false));
  const pill = screen.getByRole("button", { name: "thumbs up, 1", exact: true });
  await expect.element(pill).toBeDisabled();
  await act(async () => {
    pill.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  expect(fixture.mutate).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
  expect(fixture.refresh).not.toHaveBeenCalled();
});

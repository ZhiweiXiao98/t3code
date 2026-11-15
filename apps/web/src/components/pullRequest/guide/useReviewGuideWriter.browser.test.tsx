import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  ProjectId,
  type PullRequestRef,
  type PullRequestReviewGuideResult,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { act, render } from "../../../../test/render";
import { guideRunKey, useGuideRunStore } from "./guideRunStore";
import { useReviewGuideWriter } from "./useReviewGuideWriter";

const state = vi.hoisted(() => ({
  generate: vi.fn(),
  toast: vi.fn(),
  locale: "en" as "en" | "zh-CN",
}));
vi.mock("~/state/pullRequests", async () => {
  const { Atom, AsyncResult } = await import("effect/reactivity");
  const query = Atom.make(
    AsyncResult.success<PullRequestReviewGuideResult>({
      guide: null,
      run: null,
      currentHeadSha: null,
    }),
  );
  const permission = Atom.make(true);
  return {
    pullRequestEnvironment: {
      reviewGuide: () => query,
      generateReviewGuide: { permissionAtom: () => permission },
    },
  };
});
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => state.generate }));
vi.mock("../../ui/toast", async (original) => ({
  ...(await original<typeof import("../../ui/toast")>()),
  toastManager: { add: state.toast },
}));
vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = state.locale;
    return {
      locale,
      t: (key: Parameters<typeof translateWebMessage>[1]) => translateWebMessage(locale, key),
    };
  },
}));

const environmentId = EnvironmentId.make("guide-environment");
const reference: PullRequestRef = {
  projectId: ProjectId.make("guide-project"),
  repository: "literal/repository",
  number: 42,
};
const key = guideRunKey(environmentId, reference);
function Probe() {
  const writer = useReviewGuideWriter({ environmentId, reference, title: "Literal $& {guide}" });
  return (
    <>
      <button
        type="button"
        disabled={writer.running || !writer.canWrite}
        onClick={() => void writer.write()}
      >
        {writer.running ? "Starting guide" : "Write guide"}
      </button>
      <button type="button" onClick={() => void writer.write()}>
        Repeat guide
      </button>
    </>
  );
}
function surface(locale: "en" | "zh-CN", registry: AtomRegistry.AtomRegistry) {
  state.locale = locale;
  return (
    <RegistryContext.Provider value={registry}>
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <Probe />
      </WebI18nContext>
    </RegistryContext.Provider>
  );
}

it.each([
  ["owned", null],
  ["raw", new Error("Literal $& {host failure}")],
  ["empty", new Error("")],
  ["whitespace", new Error("  ")],
  ["interrupted", undefined],
] as const)("uses settlement locale for review guide failure: %s", async (kind, cause) => {
  type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((done) => {
    resolve = done;
  });
  const previous = useGuideRunStore.getState();
  state.generate.mockReset().mockReturnValue(promise);
  state.toast.mockClear();
  useGuideRunStore.setState({ watches: {} });
  using _restore = {
    [Symbol.dispose]() {
      useGuideRunStore.setState(previous, true);
      state.locale = "en";
      state.generate.mockReset();
    },
  };
  await using stack = new AsyncDisposableStack();
  const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
  await using screen = await render(surface("en", registry));
  await using _drain = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        resolve(AsyncResult.failure(Cause.interrupt()));
        await promise;
      });
    },
  };
  await screen.getByRole("button", { name: "Write guide", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Starting guide", exact: true }))
    .toBeDisabled();
  expect(useGuideRunStore.getState().watches[key]).toEqual({
    environmentId,
    reference,
    title: "Literal $& {guide}",
    previousGuideAt: null,
    previousFailedAt: null,
    since: expect.any(Number),
  });
  await screen.getByRole("button", { name: "Repeat guide", exact: true }).click();
  expect(state.generate).toHaveBeenCalledExactlyOnceWith({ environmentId, input: reference });
  await screen.rerender(surface("zh-CN", registry));
  expect(state.toast).not.toHaveBeenCalled();
  await act(async () => {
    resolve(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause)));
    await promise;
  });
  expect(state.toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法开始编写评审指南",
    description:
      kind === "raw"
        ? "Literal $& {host failure}"
        : kind === "interrupted"
          ? "All fibers interrupted without error"
          : "请检查“设置 → 源代码管理”中的评审指南模型。",
  });
  expect(useGuideRunStore.getState().watches[key]).toBeUndefined();
  expect(useGuideRunStore.getState().progress).toBe(previous.progress);
  await expect
    .element(screen.getByRole("button", { name: "Write guide", exact: true }))
    .toBeEnabled();
  await screen.rerender(surface("en", registry));
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(state.generate).toHaveBeenCalledTimes(1);
});

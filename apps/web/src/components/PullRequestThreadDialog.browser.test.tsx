import "~/index.css";
import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  ThreadId,
  SourceControlProviderKind,
  type GitResolvePullRequestResult,
  type VcsStatusResult,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { vcsActionManager } from "~/state/vcs";
import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage } from "~/i18n/messages";
import { act, render } from "../../test/render";
import { PullRequestThreadDialog } from "./PullRequestThreadDialog";

const state = vi.hoisted(() => ({
  registry: null as AtomRegistry.AtomRegistry | null,
  prepare: vi.fn(),
  prepared: vi.fn(),
  open: vi.fn(),
  locale: "en" as "en" | "zh-CN",
  status: null as Atom.Atom<AsyncResult.AsyncResult<VcsStatusResult>> | null,
  resolution: null as Atom.Atom<AsyncResult.AsyncResult<GitResolvePullRequestResult>> | null,
}));
vi.mock("~/rpc/atomRegistry", async (original) => {
  const actual = await original<typeof import("~/rpc/atomRegistry")>();
  return {
    ...actual,
    appAtomRegistry: new Proxy({} as AtomRegistry.AtomRegistry, {
      get(_target, key) {
        const registry = state.registry;
        if (registry === null) throw new Error("Fixture registry is not active");
        const value = Reflect.get(registry, key);
        return typeof value === "function" ? value.bind(registry) : value;
      },
    }),
  };
});
vi.mock("~/state/vcs", async (original) => {
  const actual = await original<typeof import("~/state/vcs")>();
  return { ...actual, vcsEnvironment: { ...actual.vcsEnvironment, status: () => state.status! } };
});
vi.mock("~/state/git", async (original) => {
  const actual = await original<typeof import("~/state/git")>();
  return {
    ...actual,
    gitEnvironment: { ...actual.gitEnvironment, pullRequestResolution: () => state.resolution! },
  };
});
vi.mock("~/state/session", async (original) => ({
  ...(await original<typeof import("~/state/session")>()),
  useEnvironmentScope: () => true,
  readEnvironmentScope: () => true,
}));
vi.mock("~/state/use-atom-command", async (original) => {
  const actual = await original<typeof import("~/state/use-atom-command")>();
  const { gitEnvironment } = await import("~/state/git");
  return {
    ...actual,
    useAtomCommand: (...args: Parameters<typeof actual.useAtomCommand>) =>
      args[0] === gitEnvironment.preparePullRequestThread
        ? state.prepare
        : actual.useAtomCommand(...args),
  };
});
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
const environmentId = EnvironmentId.make("dialog-fixture");
const threadId = ThreadId.make("dialog-thread");
const cwd = "/literal/$&/{workspace}";
const target = { environmentId, cwd };
function surface(locale: "en" | "zh-CN") {
  state.locale = locale;
  return (
    <RegistryContext.Provider value={appAtomRegistry}>
      <WebI18nContext
        value={{
          locale,
          appLocale: locale,
          setAppLocale: () => {},
          t: (key, values) => translateWebMessage(locale, key, values),
        }}
      >
        <PullRequestThreadDialog
          open
          environmentId={environmentId}
          threadId={threadId}
          cwd={cwd}
          initialReference="42"
          onPrepared={state.prepared}
          onOpenChange={state.open}
        />
      </WebI18nContext>
    </RegistryContext.Provider>
  );
}
it.each([
  ["github owned", "github", "worktree", null],
  ["gitlab owned", "gitlab", "local", null],
  ["raw", "github", "worktree", new Error("Literal $& {host}")],
  ["empty", "github", "worktree", new Error("")],
  ["interrupted", "github", "worktree", undefined],
] as const)(
  "uses settlement locale for thread dialog preparation failure: %s",
  async (kind, provider, mode, cause) => {
    await using stack = new AsyncDisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    state.registry = registry;
    stack.defer(() => {
      state.registry = null;
    });
    type Result = ReturnType<typeof AsyncResult.failure<unknown, unknown>>;
    let finish!: (value: Result) => void;
    const promise = new Promise<Result>((resolve) => {
      finish = resolve;
    });
    state.prepare.mockReset().mockReturnValue(promise);
    state.prepared.mockClear();
    state.open.mockClear();
    state.status = Atom.make(
      AsyncResult.success<VcsStatusResult>({
        isRepo: true,
        hasPrimaryRemote: true,
        isDefaultRef: false,
        refName: "feature",
        hasWorkingTreeChanges: false,
        workingTree: { files: [], insertions: 0, deletions: 0 },
        hasUpstream: true,
        aheadCount: 0,
        behindCount: 0,
        pr: null,
        sourceControlProvider: {
          kind: SourceControlProviderKind.make(provider),
          name: provider,
          baseUrl: "https://" + provider + ".com",
        },
      }),
    );
    state.resolution = Atom.make(
      AsyncResult.success<GitResolvePullRequestResult>({
        pullRequest: {
          number: 42,
          title: "Literal $& {request}",
          url:
            "https://" +
            provider +
            ".com/fixture/repo/" +
            (provider === "gitlab" ? "-/merge_requests/" : "pull/") +
            "42",
          headBranch: "feature",
          baseBranch: "main",
          state: "open",
        },
      }),
    );
    const managed = vcsActionManager.stateAtom(target);
    const previous = appAtomRegistry.get(managed);
    using _restore = {
      [Symbol.dispose]() {
        appAtomRegistry.set(managed, previous);
        state.locale = "en";
        state.prepare.mockReset();
      },
    };
    await using screen = await render(surface("en"));
    await using _drain = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await promise;
        });
      },
    };
    await expect.element(page.getByText("Literal $& {request}", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: mode === "local" ? "Local" : "Worktree", exact: true })
      .click();
    expect(state.prepare).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { cwd, reference: "42", mode, ...(mode === "worktree" ? { threadId } : {}) },
    });
    const pending = page.getByRole("button", {
      name: mode === "local" ? "Preparing local..." : "Preparing worktree...",
      exact: true,
    });
    await expect.element(pending).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await act(async () => {
      pending.element().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    });
    expect(state.prepare).toHaveBeenCalledTimes(1);
    await screen.rerender(surface("zh-CN"));
    await act(async () => {
      finish(AsyncResult.failure(kind === "interrupted" ? Cause.interrupt() : Cause.fail(cause)));
      await promise;
    });
    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    const errorText = () =>
      dialog.element().querySelector("p.text-destructive")?.textContent ?? null;
    await expect
      .poll(errorText)
      .toBe(
        kind === "raw"
          ? "Literal $& {host}"
          : kind === "empty" || kind === "interrupted"
            ? null
            : provider === "gitlab"
              ? "准备合并请求会话失败。"
              : "准备拉取请求会话失败。",
      );
    await expect
      .element(
        page.getByRole("button", { name: mode === "local" ? "本地" : "工作树", exact: true }),
      )
      .toBeEnabled();
    await expect.element(page.getByRole("textbox")).toHaveValue("42");
    expect(state.prepared).not.toHaveBeenCalled();
    expect(state.open).not.toHaveBeenCalled();
    expect(appAtomRegistry.get(managed).isRunning).toBe(false);
    if (kind === "interrupted") expect(appAtomRegistry.get(managed).error).toBeNull();
  },
);

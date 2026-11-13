import {
  AuthOrchestrationOperateScope,
  AuthSourceControlWriteScope,
  EnvironmentId,
  ThreadId,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  scopes: new Map<string, Set<string>>(),
  requests: [] as { action: string; environmentId: string | null }[],
}));

vi.mock("../i18n/readWebI18n", async () => {
  const { translateWebMessage } = await import("../i18n/messages");
  return {
    readWebI18n: () => ({
      locale: state.locale,
      t: (key: import("../i18n/messages").WebMessageKey) => translateWebMessage(state.locale, key),
    }),
  };
});
vi.mock("react", () => ({ useCallback: (callback: unknown) => callback }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({ operation: null, error: null, isRunning: false }),
}));
vi.mock("../rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("../components/sourceControlAppAccessToast", () => ({
  suggestAppAccessForRemote: () => Promise.resolve(),
}));
vi.mock("./session", () => ({
  useEnvironmentScope: (environmentId: string, scope: string) =>
    state.scopes.get(environmentId)?.has(scope) === true,
  readEnvironmentScope: (environmentId: string, scope: string) =>
    state.scopes.get(environmentId)?.has(scope) === true,
}));
vi.mock("./query", () => ({ useEnvironmentQuery: () => ({ refresh: () => {} }) }));
vi.mock("./use-atom-command", () => ({
  useAtomCommand:
    (command: { action: string; environmentId?: string }) =>
    async (input: { environmentId?: string }) => {
      state.requests.push({
        action: command.action,
        environmentId: input.environmentId ?? command.environmentId ?? null,
      });
      return AsyncResult.success({});
    },
}));
vi.mock("./vcs", () => ({
  vcsEnvironment: { init: { action: "init" }, pull: { action: "pull" }, status: () => "status" },
  vcsActionManager: {
    stateAtom: () => "state",
    resetError: () => {},
    track: (_registry: unknown, _target: unknown, _input: unknown, execute: () => unknown) =>
      execute(),
    runStackedAction: (scope: { environmentId: string }) => ({ action: "stack", ...scope }),
  },
}));
vi.mock("./sourceControl", () => ({
  sourceControlEnvironment: { publishRepository: { action: "publish" } },
}));
vi.mock("./git", () => ({
  gitEnvironment: { preparePullRequestThread: { action: "prepare" } },
}));

import {
  useGitStackedAction,
  usePreparePullRequestThreadAction,
  useSourceControlPublishRepositoryAction,
  useVcsInitAction,
  useVcsPullAction,
} from "./sourceControlActions";

const primary = EnvironmentId.make("primary");
const secondary = EnvironmentId.make("secondary");
const scope = { environmentId: secondary, cwd: "/repo" };
const threadId = ThreadId.make("thread");
const cases = [
  {
    name: "init",
    create: () => {
      const action = useVcsInitAction(scope);
      return { isAllowed: action.isAllowed, run: () => action.run() };
    },
  },
  {
    name: "pull",
    create: () => {
      const action = useVcsPullAction(scope);
      return { isAllowed: action.isAllowed, run: () => action.run() };
    },
  },
  {
    name: "stack",
    create: () => {
      const action = useGitStackedAction(scope);
      return {
        isAllowed: action.isAllowed,
        run: () => action.run({ actionId: "action", action: "commit" }),
      };
    },
  },
  {
    name: "publish",
    create: () => {
      const action = useSourceControlPublishRepositoryAction(scope);
      return {
        isAllowed: action.isAllowed,
        run: () =>
          action.run({
            provider: SourceControlProviderKind.make("github"),
            repository: "owner/repo",
            visibility: "private",
            remoteName: "origin",
            protocol: "ssh",
          }),
      };
    },
  },
  {
    name: "prepare",
    create: () => {
      const action = usePreparePullRequestThreadAction(scope);
      return {
        isAllowed: action.isAllowed,
        run: () => action.run({ reference: "1", mode: "local" }),
      };
    },
  },
] as const;

beforeEach(() => {
  state.scopes = new Map([
    [primary, new Set([AuthSourceControlWriteScope, AuthOrchestrationOperateScope])],
    [secondary, new Set<string>()],
  ]);
  state.requests = [];
  state.locale = "en";
});

describe("source control callback grants", () => {
  it.each(cases)("$name uses the selected environment's permission", async ({ create }) => {
    const action = create();
    expect(action.isAllowed).toBe(false);
    expect((await action.run())._tag).toBe("Failure");
    expect(state.requests).toEqual([]);
  });

  it.each(cases)("$name rejects a retained callback after revocation", async ({ create }) => {
    state.scopes.get(secondary)!.add(AuthSourceControlWriteScope);
    const action = create();
    expect(action.isAllowed).toBe(true);
    state.scopes.get(secondary)!.clear();
    expect((await action.run())._tag).toBe("Failure");
    expect(state.requests).toEqual([]);
    expect(create().isAllowed).toBe(false);
  });
});

describe("pull request worktree attachment permission", () => {
  it.each([
    ["local", threadId, false, true],
    ["worktree", undefined, false, true],
    ["worktree", threadId, false, false],
    ["worktree", threadId, true, true],
  ] as const)(
    "mode %s / thread %s / task grant %s",
    async (mode, attachedThreadId, operate, allowed) => {
      state.scopes.get(secondary)!.add(AuthSourceControlWriteScope);
      if (operate) state.scopes.get(secondary)!.add(AuthOrchestrationOperateScope);
      const result = await usePreparePullRequestThreadAction(scope).run({
        reference: "1",
        mode,
        ...(attachedThreadId !== undefined ? { threadId: attachedThreadId } : {}),
      });
      expect(result._tag).toBe(allowed ? "Success" : "Failure");
      expect(state.requests).toHaveLength(allowed ? 1 : 0);
      if (result._tag === "Failure") {
        expect(Cause.squash(result.cause)).toMatchObject({
          requiredScope: AuthOrchestrationOperateScope,
        });
      }
    },
  );

  it.each([false, true])(
    "reads the fresh task grant before attaching a worktree: %s",
    async (allowed) => {
      state.scopes.get(secondary)!.add(AuthSourceControlWriteScope);
      if (!allowed) state.scopes.get(secondary)!.add(AuthOrchestrationOperateScope);
      const action = usePreparePullRequestThreadAction(scope);
      if (allowed) state.scopes.get(secondary)!.add(AuthOrchestrationOperateScope);
      else state.scopes.get(secondary)!.delete(AuthOrchestrationOperateScope);
      const result = await action.run({ reference: "1", mode: "worktree", threadId });
      expect(result._tag).toBe(allowed ? "Success" : "Failure");
      expect(state.requests).toHaveLength(allowed ? 1 : 0);
    },
  );

  it("still requires source-control permission when the task grant is present", async () => {
    state.scopes.get(secondary)!.add(AuthOrchestrationOperateScope);
    const result = await usePreparePullRequestThreadAction(scope).run({
      reference: "1",
      mode: "worktree",
      threadId,
    });
    expect(result._tag).toBe("Failure");
    expect(state.requests).toEqual([]);
  });
});

it("uses the current locale for revoked grants without sending either action", async () => {
  state.scopes.get(secondary)!.add(AuthSourceControlWriteScope);
  const pull = useVcsPullAction(scope);
  const prepare = usePreparePullRequestThreadAction(scope);
  for (const locale of ["en", "zh-CN", "en"] as const) {
    state.locale = locale;
    state.scopes.get(secondary)!.clear();
    const denied = await pull.run();
    expect(denied._tag).toBe("Failure");
    if (denied._tag === "Failure")
      expect(Cause.squash(denied.cause)).toMatchObject({
        requiredScope: AuthSourceControlWriteScope,
        message:
          locale === "en"
            ? "This connection cannot change source control."
            : "此连接无权更改源代码管理。",
      });
    state.scopes.get(secondary)!.add(AuthSourceControlWriteScope);
    const deniedThread = await prepare.run({
      reference: "owner/repo#1",
      mode: "worktree",
      threadId,
    });
    expect(deniedThread._tag).toBe("Failure");
    if (deniedThread._tag === "Failure")
      expect(Cause.squash(deniedThread.cause)).toMatchObject({
        requiredScope: AuthOrchestrationOperateScope,
        message:
          locale === "en" ? "This connection cannot change threads." : "此连接无权更改会话。",
      });
  }
  expect(state.requests).toEqual([]);
});

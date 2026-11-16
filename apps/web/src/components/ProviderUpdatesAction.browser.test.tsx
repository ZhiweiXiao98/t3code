import { RegistryContext } from "@effect/atom-react";
import {
  AuthProvidersManageScope,
  type AuthSessionState,
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { useEffect } from "react";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";

const state = vi.hoisted(() => ({
  environments: [] as {
    environmentId: EnvironmentId;
    label: string;
    connection: { phase: "connected" | "disconnected" };
  }[],
  providers: new Map<EnvironmentId, ReadonlyArray<ServerProvider>>(),
  requests: [] as EnvironmentId[],
  checks: [] as { environmentId: EnvironmentId; input: unknown }[],
  locale: "en" as "en" | "zh-CN",
  deferredCheck: null as Promise<AsyncResult.AsyncResult<unknown, unknown>> | null,
  deferredUpdate: null as Promise<ProviderUpdateRun["result"]> | null,
  updateInputs: [] as { environmentId: EnvironmentId; input: unknown }[],
  checkResult: null as AsyncResult.AsyncResult<unknown, unknown> | null,
  sessions: new Map<EnvironmentId, Atom.Writable<AsyncResult.AsyncResult<AuthSessionState>>>(),
}));

vi.mock(import("~/state/environments"), () => ({
  useEnvironments: (() => ({ environments: state.environments })) as never,
  useEnvironmentProviders: () => state.providers,
}));
vi.mock(import("@t3tools/client-runtime/state/session"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    createEnvironmentSessionAtoms: ((
      ...args: Parameters<typeof actual.createEnvironmentSessionAtoms>
    ) => ({
      ...actual.createEnvironmentSessionAtoms(...args),
      sessionStateAtom: (id: EnvironmentId) => state.sessions.get(id)!,
    })) as typeof actual.createEnvironmentSessionAtoms,
  };
});
vi.mock(import("~/state/server"), () => ({
  serverEnvironment: { updateProvider: "update", refreshProviders: "refresh" } as never,
}));
vi.mock(import("~/state/use-atom-command"), () => ({
  useAtomCommand: ((command: string) =>
    async ({ environmentId, input }: { environmentId: EnvironmentId; input: unknown }) => {
      if (command !== "refresh") {
        state.requests.push(environmentId);
        state.updateInputs.push({ environmentId, input });
        return state.deferredUpdate ?? AsyncResult.success(undefined);
      }
      state.checks.push({ environmentId, input });
      return state.deferredCheck ?? state.checkResult ?? AsyncResult.success(undefined);
    }) as never,
}));

vi.mock("~/i18n/readWebI18n", () => ({
  readWebI18n: () => {
    const locale = state.locale;
    return { locale, t: (key: WebMessageKey) => translateWebMessage(locale, key) };
  },
}));

import { WebI18nContext } from "~/i18n/WebI18nContext";
import { translateWebMessage, type WebMessageKey } from "~/i18n/messages";
import type { ProviderUpdateRun } from "./ProviderUpdateLaunchNotification.logic";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { toastManager } from "./ui/toast";
import { useCheckProviderUpdates, useProviderUpdates } from "./ProviderUpdatesAction";

const provider: ServerProvider = {
  instanceId: ProviderInstanceId.make("codex"),
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-10-21T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  versionAdvisory: {
    status: "behind_latest",
    currentVersion: "1.0.0",
    latestVersion: "1.1.0",
    updateCommand: "npm install -g @openai/codex",
    canUpdate: true,
    checkedAt: "2026-10-21T00:00:00.000Z",
    message: "Update available.",
  },
};

function session(
  scopes: NonNullable<AuthSessionState["scopes"]>,
): AsyncResult.AsyncResult<AuthSessionState> {
  return AsyncResult.success<AuthSessionState>({
    authenticated: true,
    scopes,
    auth: {
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["bearer-access-token"],
      sessionCookieName: "t3_session",
    },
  });
}

function setup() {
  state.environments = [
    { environmentId: EnvironmentId.make("read-only"), label: "Read only" },
    { environmentId: EnvironmentId.make("writable"), label: "Writable" },
    { environmentId: EnvironmentId.make("unresolved"), label: "Unresolved" },
  ].map((environment) => ({ ...environment, connection: { phase: "connected" } }));
  state.providers = new Map(
    state.environments.map(({ environmentId }) => [environmentId, [provider]]),
  );
  state.requests = [];
  state.checks = [];
  state.checkResult = null;
  state.deferredUpdate = null;
  state.updateInputs = [];
  state.deferredCheck = null;
  state.locale = "en";
  const sessions = new Map<EnvironmentId, Atom.Writable<AsyncResult.AsyncResult<AuthSessionState>>>(
    [
      [state.environments[0]!.environmentId, Atom.make(session(["orchestration:read"]))],
      [state.environments[1]!.environmentId, Atom.make(session([AuthProvidersManageScope]))],
      [
        state.environments[2]!.environmentId,
        Atom.make<AsyncResult.AsyncResult<AuthSessionState>>(
          AsyncResult.initial<AuthSessionState>(),
        ),
      ],
    ],
  );
  state.sessions = sessions;
  return { sessions };
}

it("provider updates and checks exclude connections without a confirmed management grant", async () => {
  const fixture = setup();
  let updates!: ReturnType<typeof useProviderUpdates>;
  let check!: ReturnType<typeof useCheckProviderUpdates>;
  function Probe() {
    const nextUpdates = useProviderUpdates();
    const nextCheck = useCheckProviderUpdates();
    useEffect(() => {
      updates = nextUpdates;
      check = nextCheck;
    }, [nextUpdates, nextCheck]);
    return null;
  }
  await using _screen = await render(
    <RegistryContext.Provider value={appAtomRegistry}>
      <Probe />
    </RegistryContext.Provider>,
  );

  const writableId = state.environments[1]!.environmentId;
  expect(updates.machines.map(({ environmentId }) => environmentId)).toEqual([writableId]);
  await act(async () => {
    await updates.updateAll({ quiet: true });
  });
  expect(state.requests).toEqual([writableId]);
  await act(async () => {
    await check();
  });
  // A model refresh always drops the server's cached latest provider versions.
  expect(state.checks).toEqual([{ environmentId: writableId, input: { refreshModels: true } }]);

  using toast = vi.spyOn(toastManager, "add");
  state.checkResult = AsyncResult.failure(Cause.interrupt());
  await act(async () => {
    await check();
  });
  expect(toast).not.toHaveBeenCalled();
  state.checkResult = AsyncResult.failure(Cause.fail(new Error("offline")));
  await act(async () => {
    await check({ quiet: true });
  });
  expect(toast).not.toHaveBeenCalled();
  await act(async () => {
    await check();
  });
  expect(toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Could not check provider updates" }),
  );

  await act(() => {
    appAtomRegistry.set(fixture.sessions.get(writableId)!, session(["orchestration:read"]));
  });
  expect(updates.machines).toEqual([]);
  state.requests = [];
  await act(async () => {
    await updates.updateAll({ quiet: true });
  });
  expect(state.requests).toEqual([]);
});

it.each(["owned", "raw", "empty", "interrupted", "quiet"] as const)(
  "uses settlement locale for provider refresh failure: %s",
  async (kind) => {
    setup();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    state.environments[1]!.label = "Literal $& {environment}";
    let finish!: (result: AsyncResult.AsyncResult<unknown, unknown>) => void;
    state.deferredCheck = new Promise((resolve) => {
      finish = resolve;
    });
    let check!: ReturnType<typeof useCheckProviderUpdates>;
    function Probe() {
      const next = useCheckProviderUpdates();
      useEffect(() => {
        check = next;
      }, [next]);
      return null;
    }
    function surface(locale: "en" | "zh-CN") {
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
          <RegistryContext.Provider value={registry}>
            <Probe />
          </RegistryContext.Provider>
        </WebI18nContext.Provider>
      );
    }
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    await using screen = await render(surface("en"));
    let running!: Promise<void>;
    try {
      await act(() => {
        running = check({ quiet: kind === "quiet" });
      });
      expect(state.checks).toEqual([
        { environmentId: state.environments[1]!.environmentId, input: { refreshModels: true } },
      ]);
      expect(check()).toBe(running);
      expect(state.checks).toHaveLength(1);
      expect(toast).not.toHaveBeenCalled();
      await screen.rerender(surface("zh-CN"));
      await act(async () => {
        finish(
          AsyncResult.failure(
            kind === "interrupted"
              ? Cause.interrupt()
              : Cause.fail(
                  kind === "raw"
                    ? new Error("Literal $& {error}")
                    : kind === "empty"
                      ? new Error("")
                      : null,
                ),
          ),
        );
        await running;
      });
      if (kind === "quiet" || kind === "interrupted") {
        expect(toast).not.toHaveBeenCalled();
      } else {
        expect(toast).toHaveBeenCalledExactlyOnceWith({
          type: "error",
          title: "无法检查提供商更新",
          description: (
            <span className="whitespace-pre-line">{`Literal $& {environment}: ${kind === "raw" ? "Literal $& {error}" : kind === "empty" ? "" : "刷新失败。"}`}</span>
          ),
          data: { actionLayout: "stacked-end" },
        });
      }
      await screen.rerender(surface("en"));
      expect(toast).toHaveBeenCalledTimes(kind === "quiet" || kind === "interrupted" ? 0 : 1);
      state.deferredCheck = null;
      await act(async () => {
        await check({ quiet: true });
      });
      expect(state.checks).toHaveLength(2);
      expect(state.requests).toEqual([]);
    } finally {
      await act(async () => {
        finish(AsyncResult.success(undefined));
        await running;
      });
      state.deferredCheck = null;
      state.locale = "en";
    }
  },
);

it.each(["owned", "raw", "empty", "success", "interrupted", "quiet"] as const)(
  "uses settlement locale for provider update aggregate: %s",
  async (kind) => {
    setup();
    using stack = new DisposableStack();
    const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
    state.environments[1]!.label = "Literal $& {environment}";
    let finish!: (result: ProviderUpdateRun["result"]) => void;
    state.deferredUpdate = new Promise((resolve) => {
      finish = resolve;
    });
    let updates!: ReturnType<typeof useProviderUpdates>;
    function Probe() {
      const next = useProviderUpdates();
      useEffect(() => {
        updates = next;
      }, [next]);
      return null;
    }
    function surface(locale: "en" | "zh-CN") {
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
          <RegistryContext.Provider value={registry}>
            <Probe />
          </RegistryContext.Provider>
        </WebI18nContext.Provider>
      );
    }
    using toast = vi.spyOn(toastManager, "add").mockImplementation(() => "fixture-toast");
    await using screen = await render(surface("en"));
    let running!: Promise<ProviderUpdateRun[]>;
    const result: ProviderUpdateRun["result"] =
      kind === "success"
        ? AsyncResult.success({
            providers: [
              {
                ...provider,
                updateState: {
                  status: "succeeded",
                  startedAt: "2026-10-21T00:00:00.000Z",
                  finishedAt: "2026-10-21T00:01:00.000Z",
                  message: "Literal $& {diagnostic}",
                  output: null,
                },
              },
            ],
          })
        : AsyncResult.failure(
            kind === "interrupted"
              ? Cause.interrupt()
              : Cause.fail(
                  kind === "raw"
                    ? new Error("Literal $& {error}")
                    : kind === "empty"
                      ? new Error("")
                      : null,
                ),
          );
    try {
      await act(() => {
        running = updates.updateAll({ quiet: kind === "quiet" });
      });
      const environmentId = state.environments[1]!.environmentId;
      expect(state.updateInputs).toEqual([
        { environmentId, input: { provider: provider.driver, instanceId: provider.instanceId } },
      ]);
      expect(toast).not.toHaveBeenCalled();
      await screen.rerender(surface("zh-CN"));
      let runs!: ProviderUpdateRun[];
      await act(async () => {
        finish(result);
        runs = await running;
      });
      expect(runs).toEqual([
        {
          environmentId,
          machineLabel: "Literal $& {environment}",
          driver: provider.driver,
          instanceId: provider.instanceId,
          result,
        },
      ]);
      expect(runs[0]!.result).toBe(result);
      if (kind === "quiet" || kind === "interrupted") {
        expect(toast).not.toHaveBeenCalled();
      } else {
        expect(toast).toHaveBeenCalledExactlyOnceWith({
          type: kind === "success" ? "success" : "error",
          title: kind === "success" ? "服务提供方已更新" : "服务提供方更新失败",
          description: (
            <span className="whitespace-pre-line">
              {kind === "success"
                ? "新会话将使用更新后的服务提供方。"
                : `Literal $& {environment} · Codex: ${kind === "raw" ? "Literal $& {error}" : kind === "empty" ? "" : "服务提供方更新失败。"}`}
            </span>
          ),
          data: { actionLayout: "stacked-end" },
        });
      }
      await screen.rerender(surface("en"));
      expect(toast).toHaveBeenCalledTimes(kind === "quiet" || kind === "interrupted" ? 0 : 1);
      expect(state.updateInputs).toHaveLength(1);
      expect(state.checks).toEqual([]);
    } finally {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await running;
      });
      state.deferredUpdate = null;
      state.locale = "en";
    }
  },
);

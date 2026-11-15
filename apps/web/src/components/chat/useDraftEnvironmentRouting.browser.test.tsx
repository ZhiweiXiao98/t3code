import { useRef, useState } from "react";
import { EnvironmentId, ProjectId, ProviderDriverKind, ServerConfig } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { projectEnvironment } from "../../state/projects";
import { useDraftEnvironmentRouting } from "./useDraftEnvironmentRouting";
const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  run: vi.fn(),
  toast: vi.fn(),
  thread: vi.fn(async () => null),
  refresh: vi.fn(),
  command: undefined as unknown,
}));
const target = EnvironmentId.make("target");
const origin = EnvironmentId.make("origin");
const projectId = ProjectId.make("scratch-project");
const draftId = DraftId.make("routing-draft");
const config = Schema.decodeSync(ServerConfig)({
  environment: {
    environmentId: target,
    label: "Literal $& {machine}",
    platform: { os: "linux", arch: "x64" },
    serverVersion: "0.0.0",
    capabilities: { repositoryIdentity: true },
  },
  auth: {
    policy: "loopback-browser",
    bootstrapMethods: [],
    sessionMethods: [],
    sessionCookieName: "test",
  },
  cwd: "/test",
  keybindingsConfigPath: "/test/keybindings.json",
  keybindings: [],
  issues: [],
  providers: [],
  availableEditors: [],
  observability: {
    logsDirectoryPath: "/test/logs",
    localTracingEnabled: false,
    otlpTracesEnabled: false,
    otlpMetricsEnabled: false,
  },
  settings: {},
  scratchWorkspaceRoot: "/target/scratch",
});
vi.mock("../../hooks/useScratchProject", async (original) => {
  const actual = await original<typeof import("../../hooks/useScratchProject")>();
  const { projectEnvironment } = await import("../../state/projects");
  fixture.command = projectEnvironment.openScratch;
  return {
    ...actual,
    useScratchProject: () =>
      actual.createScratchProjectActions({
        environments: () => [
          {
            environmentId: target,
            connection: { phase: "connected", error: null, traceId: null },
            serverConfig: config,
          },
        ],
        primaryEnvironmentId: () => target,
        registry: appAtomRegistry,
        handleNewThread: fixture.thread,
      }),
  };
});
vi.mock("@t3tools/client-runtime/state/runtime", async (original) => {
  const actual = await original<typeof import("@t3tools/client-runtime/state/runtime")>();
  return {
    ...actual,
    runAtomCommand: (...args: Parameters<typeof actual.runAtomCommand>) =>
      args[1] === fixture.command ? fixture.run(...args) : actual.runAtomCommand(...args),
  };
});
vi.mock("../../hooks/useLoadBalancedEnvironment", async (original) => ({
  ...(await original<typeof import("../../hooks/useLoadBalancedEnvironment")>()),
  useLoadBalancedEnvironment: () => ({
    environmentId: null,
    pending: false,
    failed: false,
    refresh: fixture.refresh,
  }),
}));
vi.mock("../../state/entities", async (original) => ({
  ...(await original<typeof import("../../state/entities")>()),
  useProjects: () => [],
}));
vi.mock("../../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../../i18n/readWebI18n")>()),
  readWebI18n: () => ({
    locale: fixture.locale,
    t: (
      key: Parameters<typeof translateWebMessage>[1],
      values?: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage(fixture.locale, key, values),
  }),
}));
vi.mock("../ui/toast", async (original) => {
  const actual = await original<typeof import("../ui/toast")>();
  return { ...actual, toastManager: { ...actual.toastManager, add: fixture.toast } };
});
function Probe({ locked = false, sending = false }: { locked?: boolean; sending?: boolean }) {
  const [request, setRequest] = useState("unchecked");
  const draft = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const sendingRef = useRef(sending);
  const routing = useDraftEnvironmentRouting({
    draftId,
    draftThread: draft,
    envLocked: locked,
    automaticEnvironment: false,
    logicalProjectEnvironments: [
      {
        environmentId: target,
        projectId: null,
        label: "Literal $& {machine}",
        isPrimary: false,
        machine: "server",
      },
    ],
    environmentById: new Map(),
    providersByEnvironment: new Map(),
    loadBalancingSettings: { loadBalancingWeights: {} },
    referencedThreadContexts: [],
    activeProviderInstanceId: null,
    selectedProvider: ProviderDriverKind.make("codex"),
    composerHasAttachments: false,
    activeProjectKey: "scratch",
    activeProjectIsScratch: true,
    projectGroupingSettings: selectProjectGroupingSettings(DEFAULT_CLIENT_SETTINGS),
    sendInFlightRef: sendingRef,
  });
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setRequest(routing.readPendingEnvironmentChange() === null ? "cleared" : "present")
        }
      >
        Check pending
      </button>
      <output data-testid="request">{request}</output>
      <button
        type="button"
        disabled={routing.isEnvironmentChanging}
        onClick={() => routing.onEnvironmentChangeStable(target)}
      >
        Switch machine
      </button>
      <output>{routing.isEnvironmentChanging ? "pending" : "idle"}</output>
    </>
  );
}
function surface(locale: "en" | "zh-CN", locked = false, sending = false) {
  fixture.locale = locale;
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Probe locked={locked} sending={sending} />
    </WebI18nContext>
  );
}
function setup() {
  for (const mock of [fixture.run, fixture.toast, fixture.thread, fixture.refresh])
    mock.mockReset();
  fixture.thread.mockResolvedValue(null);
  useComposerDraftStore
    .getState()
    .setProjectDraftThreadId(scopeProjectRef(origin, projectId), draftId, {
      environmentSelection: "manual",
    });
  useComposerDraftStore.getState().setPrompt(draftId, "literal $& {draft}");
}
it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "localizes routing scratch %s failure without transferring draft",
  async (kind) => {
    const initial = useComposerDraftStore.getState();
    using _store = { [Symbol.dispose]: () => useComposerDraftStore.setState(initial, true) };
    setup();
    const draft = useComposerDraftStore.getState().getDraftSession(draftId);
    const content = useComposerDraftStore.getState().getComposerDraft(draftId);
    let finish!: (result: AtomCommandResult<void, unknown>) => void;
    const pending = new Promise<AtomCommandResult<void, unknown>>((resolve) => {
      finish = resolve;
    });
    fixture.run.mockReturnValue(pending);
    await using screen = await render(surface("en"));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Switch machine", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: "Switch machine", exact: true }))
      .toBeDisabled();
    expect(fixture.run).toHaveBeenCalledExactlyOnceWith(
      appAtomRegistry,
      projectEnvironment.openScratch,
      { environmentId: target, input: {} },
      { label: projectEnvironment.openScratch.label, reportFailure: false, reportDefect: true },
    );
    await screen.rerender(surface("zh-CN"));
    await act(async () =>
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "owned"
                  ? null
                  : new Error(kind === "empty" ? "" : "Could not switch machine"),
              ),
        ),
      ),
    );
    await expect
      .element(screen.getByRole("button", { name: "Switch machine", exact: true }))
      .toBeEnabled();
    if (kind === "interrupted") expect(fixture.toast).not.toHaveBeenCalled();
    else
      expect(fixture.toast).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          type: "error",
          title: "无法切换机器",
          description:
            kind === "owned" ? "发生错误。" : kind === "empty" ? "" : "Could not switch machine",
        }),
      );
    await screen.getByRole("button", { name: "Check pending", exact: true }).click();
    expect(screen.container.querySelector('[data-testid="request"]')?.textContent).toBe("cleared");
    await screen.rerender(surface("en"));
    expect(fixture.run).toHaveBeenCalledTimes(1);
    expect(useComposerDraftStore.getState().getDraftSession(draftId)).toBe(draft);
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)).toBe(content);
    expect(fixture.thread).not.toHaveBeenCalled();
    expect(fixture.refresh).not.toHaveBeenCalled();
  },
);
it.each(["locked", "sending"] as const)("does not switch a %s draft", async (kind) => {
  const initial = useComposerDraftStore.getState();
  using _store = { [Symbol.dispose]: () => useComposerDraftStore.setState(initial, true) };
  setup();
  await using screen = await render(surface("en", kind === "locked", kind === "sending"));
  await screen.getByRole("button", { name: "Switch machine", exact: true }).click();
  expect(fixture.run).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
  expect(fixture.thread).not.toHaveBeenCalled();
});

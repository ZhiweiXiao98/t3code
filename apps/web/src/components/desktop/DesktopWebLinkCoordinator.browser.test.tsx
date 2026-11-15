import * as Schema from "effect/Schema";
import { ServerConfig } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import * as Cause from "effect/Cause";
import { BrowserSettingsReadError } from "../../browser/openFileInPreview";
import { AsyncResult, type Atom } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../../test/render";

const scratchConfig = Schema.decodeSync(ServerConfig)({
  environment: {
    environmentId: EnvironmentId.make("local"),
    label: "local",
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
  scratchWorkspaceRoot: "/test/scratch",
});
const realPreview = vi.hoisted(() => ({
  open: undefined as typeof import("../../browser/openFileInPreview").openUrlInPreview | undefined,
}));
const state = vi.hoisted(() => ({
  projects: [] as EnvironmentProject[],
  routeParams: {} as Record<string, string>,
  preview: vi.fn(),
  openPreview: vi.fn(),
  openUrl: vi.fn(),
  defaults: vi.fn(),
  toast: vi.fn(),
  previewAvailable: false,
  openLink: vi.fn(async () => undefined),
  navigate: vi.fn(async (): Promise<void> => undefined),
  openScratchProject: vi.fn(async () => null),
  realScratch: false,
  scratchCommand: undefined as unknown,
  runScratch: vi.fn(),
  scratchThread: vi.fn(async () => null),
  confirm: vi.fn(async (_message: string) => true),
  connectPairing: vi.fn(
    async (_input: { pairingUrl: string }): Promise<AtomCommandResult<void, unknown>> =>
      (await import("effect/reactivity")).AsyncResult.success(undefined),
  ),
  localEnvironmentDisabled: false,
  locale: "en" as ResolvedAppLocale,
}));

vi.mock("../../browser/openFileInPreview", async (original) => {
  const actual = await original<typeof import("../../browser/openFileInPreview")>();
  realPreview.open = actual.openUrlInPreview;
  return { ...actual, openUrlInPreview: state.openUrl };
});
vi.mock("../../browser/browserDefaults", async (original) => ({
  ...(await original<typeof import("../../browser/browserDefaults")>()),
  resolveBrowserDefaults: state.defaults,
}));
vi.mock("../../browser/previewRuntime", async (original) => ({
  ...(await original<typeof import("../../browser/previewRuntime")>()),
  isPreviewAvailableFor: () => state.previewAvailable,
}));
vi.mock("../../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../../i18n/readWebI18n")>()),
  readWebI18n: () => ({
    locale: state.locale,
    t: (
      key: Parameters<typeof translateWebMessage>[1],
      values?: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage(state.locale, key, values),
  }),
}));
vi.mock("../ui/toast", async (original) => {
  const actual = await original<typeof import("../ui/toast")>();
  return { ...actual, toastManager: { ...actual.toastManager, add: state.toast } };
});
// One connected primary environment that can read pull requests. Its project list and
// discovery flag start empty so a test can deliver links before they arrive.
vi.mock(import("@tanstack/react-router"), async (original) => ({
  ...(await original()),
  useNavigate: (() => state.navigate) as never,
  useRouter: (() => ({
    navigate: state.navigate,
    state: { matches: [{ params: state.routeParams }] },
  })) as never,
}));
vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  usePrimaryEnvironmentId: () => "local" as EnvironmentId,
  usePrimaryEnvironment: (() =>
    state.localEnvironmentDisabled
      ? null
      : {
          environmentId: "local",
          connection: { phase: "connected" },
          serverConfig: {},
        }) as never,
}));
vi.mock(import("../../localEnvironment"), () => ({
  isLocalEnvironmentDisabled: () => state.localEnvironmentDisabled,
}));
vi.mock(import("../../state/server"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const capabilities = { pullRequests: true, threadPullRequests: true };
  return {
    ...(await original()),
    environmentServerConfigsAtom: Atom.make(
      new Map([["local", { environment: { capabilities } }]]),
    ) as never,
  };
});
vi.mock(import("../../state/shell"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  return {
    ...(await original()),
    allReachableShellsLiveAtom: Atom.make(false).pipe(Atom.keepAlive),
  };
});
vi.mock(import("../../state/entities"), async (original) => ({
  ...(await original()),
  readProjects: () => state.projects,
  readThreadShell: (ref: { threadId: string }) =>
    ref.threadId === "thread" ? ({ projectId: "effect", worktreePath: null } as never) : null,
  readProject: () => state.projects[0] ?? null,
}));
vi.mock(import("../../hooks/useScratchProject"), async (original) => {
  const actual = await original();
  const { appAtomRegistry } = await import("../../rpc/atomRegistry");
  const { projectEnvironment } = await import("../../state/projects");
  const { EnvironmentId } = await import("@t3tools/contracts");
  state.scratchCommand = projectEnvironment.openScratch;
  const local = EnvironmentId.make("local");

  return {
    ...actual,
    useScratchProject: () =>
      state.realScratch
        ? actual.createScratchProjectActions({
            environments: () => [
              {
                environmentId: local,
                connection: { phase: "connected", error: null, traceId: null },
                serverConfig: scratchConfig,
              },
            ],
            primaryEnvironmentId: () => local,
            registry: appAtomRegistry,
            handleNewThread: state.scratchThread,
          })
        : {
            scratchEnvironmentId: () => local,
            scratchWorkspaceRootFor: () => null,
            startScratchThread: async () => {
              await state.scratchThread();
            },
            openScratchProject: state.openScratchProject,
          },
  };
});
vi.mock("@t3tools/client-runtime/state/runtime", async (original) => {
  const actual = await original<typeof import("@t3tools/client-runtime/state/runtime")>();
  return {
    ...actual,
    runAtomCommand: (...args: Parameters<typeof actual.runAtomCommand>) =>
      state.realScratch && args[1] === state.scratchCommand
        ? state.runScratch(...args)
        : actual.runAtomCommand(...args),
  };
});

vi.mock("../../state/use-atom-query-runner", () => ({
  useAtomQueryRunner: () => state.preview,
}));
vi.mock("../../browser/useOpenLink", () => ({ useOpenLink: () => state.openLink }));
vi.mock(import("../../confirmDialog"), async (original) => ({
  ...(await original()),
  requestConfirmDialog: state.confirm,
}));
vi.mock(import("../../connection/onboarding"), async (original) => ({
  ...(await original()),
  connectPairing: "connectPairing" as never,
}));
vi.mock(import("../../state/use-atom-command"), async (original) => {
  const actual = await original();
  const { previewEnvironment } = await import("../../state/preview");
  return {
    ...actual,
    useAtomCommand: ((command: unknown, options: never) =>
      command === "connectPairing"
        ? state.connectPairing
        : command === previewEnvironment.open
          ? state.openPreview
          : actual.useAtomCommand(command as never, options)) as never,
  };
});

import { AppAtomRegistryProvider, appAtomRegistry } from "../../rpc/atomRegistry";
import { allReachableShellsLiveAtom } from "../../state/shell";
import { selectThreadDiffPanelSelection, useDiffPanelStore } from "../../diffPanelStore";
import {
  selectActiveRightPanel,
  selectActiveRightPanelSurface,
  useRightPanelStore,
} from "../../rightPanelStore";
import { DesktopWebLinkCoordinator } from "./DesktopWebLinkCoordinator";

const discoverySettled = allReachableShellsLiveAtom as Atom.Writable<boolean>;
const environmentId = EnvironmentId.make("local");
const projectId = ProjectId.make("effect");
const project = {
  id: projectId,
  workspaceRoot: "/workspace/effect",
  environmentId,
  repositoryIdentity: {
    provider: "github",
    displayName: "Effect-TS/effect",
    canonicalKey: "github.com/effect-ts/effect",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "https://github.com/Effect-TS/effect.git",
    },
  },
} as EnvironmentProject;
const pullRequestUrl = "https://github.com/Effect-TS/effect/pull/9339";
const pullRequestView = {
  to: "/pull-requests",
  search: {
    involvement: "all",
    state: "all",
    repository: "effect-ts/effect",
    number: 9339,
    selectedHost: "github.com",
    selectedProjectId: projectId,
    selectedEnvironmentId: environmentId,
  },
};

const pairingUrl = "https://vps.example.com/pair#token=ABC123";
const pairLink = `t3code://pair?pairingUrl=${encodeURIComponent(pairingUrl)}`;

function setup() {
  vi.clearAllMocks();
  state.previewAvailable = false;
  state.realScratch = false;
  state.runScratch.mockReset();
  state.openUrl.mockReset();
  state.defaults.mockReset();
  state.confirm.mockResolvedValue(true);
  state.connectPairing.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.locale = "en";
  state.localEnvironmentDisabled = false;
  state.projects = [];
  state.routeParams = {};
  state.preview
    .mockReset()
    .mockResolvedValue(AsyncResult.success({ sources: [{ kind: "commit", headRef: sha }] }));
  useDiffPanelStore.setState({ byThreadKey: {}, branchBaseRefByThreadKey: {} });
  useRightPanelStore.setState({ byThreadKey: {}, userActionRevisionByThreadKey: {} });
  appAtomRegistry.set(discoverySettled, false);
}

/** Mounts the coordinator behind a desktop bridge that hands over `urls` once the renderer is ready. */
async function mount(...urls: string[]) {
  let deliver: ((url: string) => void) | undefined;
  let subscriptions = 0;
  let unsubscriptions = 0;
  let readyCalls = 0;
  await using stack = new AsyncDisposableStack();
  stack.use(
    stubGlobal("desktopBridge", {
      getClientSettings: async () => null,
      webLinks: {
        onOpen: (listener: (url: string) => void) => {
          subscriptions += 1;
          deliver = listener;
          return () => {
            unsubscriptions += 1;
          };
        },
        setReady: async (ready: boolean) => {
          if (ready) {
            readyCalls += 1;
            for (const url of urls.splice(0)) deliver?.(url);
          }
        },
      },
    }),
  );
  const view = () => (
    <AppAtomRegistryProvider>
      <WebI18nContext
        value={{
          locale: state.locale,
          appLocale: state.locale,
          setAppLocale: () => undefined,
          t: (key, values) => translateWebMessage(state.locale, key, values),
        }}
      >
        <DesktopWebLinkCoordinator />
      </WebI18nContext>
    </AppAtomRegistryProvider>
  );
  const screen = stack.use(await render(view()));
  const owned = stack.move();
  return {
    [Symbol.asyncDispose]: () => owned.disposeAsync(),
    rerenderLocale: async (locale: ResolvedAppLocale) => {
      state.locale = locale;
      await screen.rerender(view());
    },
    subscriptions: () => subscriptions,
    unsubscriptions: () => unsubscriptions,
    readyCalls: () => readyCalls,
  };
}

it("holds a launch PR link until project discovery settles, then opens the PR view", async () => {
  setup();
  await using _coordinator = await mount(pullRequestUrl);
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.openScratchProject).not.toHaveBeenCalled();

  state.projects = [project];
  const navigated = new Promise<void>((resolve) => {
    state.navigate.mockImplementationOnce(async () => resolve());
  });
  await act(async () => {
    appAtomRegistry.set(discoverySettled, true);
    await navigated;
  });
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith(pullRequestView);
  expect(state.openScratchProject).not.toHaveBeenCalled();
});

const sha = "a".repeat(40);
const commitUrl = `https://github.com/Effect-TS/effect/pull/9339/commits/${sha}`;
const threadRef = scopeThreadRef(environmentId, ThreadId.make("thread"));

it.each([
  ["github.com", "pull/9339/commits"],
  ["code.example.com:8443", "commit"],
])("opens a %s/%s commit in the active thread's Diff pane after discovery", async (host, path) => {
  setup();
  state.routeParams = { environmentId: "local", threadId: "thread" };
  await using _coordinator = await mount(`https://${host}/Effect-TS/effect/${path}/${sha}`);
  expect(state.preview).not.toHaveBeenCalled();

  state.projects = [
    {
      ...project,
      repositoryIdentity: {
        ...project.repositoryIdentity,
        canonicalKey: `${host}/effect-ts/effect`,
        locator: {
          ...project.repositoryIdentity?.locator,
          remoteUrl: `https://${host}/Effect-TS/effect.git`,
        },
      },
    } as EnvironmentProject,
  ];
  await act(async () => appAtomRegistry.set(discoverySettled, true));
  await vi.waitFor(() => {
    expect(selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, threadRef)).toBe(
      "diff",
    );
  });
  expect(
    selectThreadDiffPanelSelection(useDiffPanelStore.getState().byThreadKey, threadRef),
  ).toMatchObject({ kind: "commit", sha });
  expect(state.preview).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: expect.objectContaining({ cwd: "/workspace/effect", commitSha: sha }),
  });
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.openLink).not.toHaveBeenCalled();
});

it("opens a PR commit the workspace lacks in the thread's PR panel", async () => {
  setup();
  state.routeParams = { environmentId: "local", threadId: "thread" };
  state.projects = [project];
  state.preview.mockResolvedValueOnce(AsyncResult.success({ sources: [] }));
  appAtomRegistry.set(discoverySettled, true);
  await using _coordinator = await mount(commitUrl);
  await vi.waitFor(() =>
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, threadRef),
    ).toMatchObject({ kind: "pull-request", repository: "effect-ts/effect", number: 9339 }),
  );
  expect(useDiffPanelStore.getState().byThreadKey).toEqual({});
  expect(state.openLink).not.toHaveBeenCalled();
});

it("opens a plain commit the workspace lacks like any other delivered link", async () => {
  setup();
  state.routeParams = { environmentId: "local", threadId: "thread" };
  state.projects = [project];
  state.preview.mockResolvedValueOnce(AsyncResult.success({ sources: [] }));
  appAtomRegistry.set(discoverySettled, true);
  const plainCommitUrl = `https://github.com/Effect-TS/effect/commit/${sha}`;
  await using _coordinator = await mount(plainCommitUrl);
  await vi.waitFor(() => expect(state.openScratchProject).toHaveBeenCalledOnce());
  // Handing it to the OS browser would loop when T3 Code is the default browser.
  expect(state.openLink).not.toHaveBeenCalled();
  expect(useDiffPanelStore.getState().byThreadKey).toEqual({});
  expect(useRightPanelStore.getState().byThreadKey).toEqual({});
});

it.each([
  ["en", "http://vps.example.com:8080", "Add the backend at http://vps.example.com:8080?"],
  ["en", "https://vps.example.com", "Add the backend at https://vps.example.com?"],
  ["zh-CN", "http://vps.example.com:8080", "添加位于 http://vps.example.com:8080 的后端？"],
  ["zh-CN", "https://vps.example.com", "添加位于 https://vps.example.com 的后端？"],
] as const)(
  "confirms the complete %s backend origin %s before pairing",
  async (locale, origin, message) => {
    setup();
    state.locale = locale;
    const pairingUrl = `${origin}/pair#token=ABC123`;
    await using _coordinator = await mount(
      `t3code://pair?pairingUrl=${encodeURIComponent(pairingUrl)}`,
    );
    await vi.waitFor(() =>
      expect(state.connectPairing).toHaveBeenCalledExactlyOnceWith({ pairingUrl }),
    );
    expect(state.confirm).toHaveBeenCalledExactlyOnceWith(message);
    expect(state.navigate).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh-CN"] as const)(
  "does not spend the pairing token when the user declines (%s)",
  async (locale) => {
    setup();
    state.locale = locale;
    const otherPairingUrl = "https://other.example.com/pair#token=XYZ789";
    state.confirm.mockResolvedValueOnce(false);
    await using _coordinator = await mount(
      pairLink,
      `t3code://pair?pairingUrl=${encodeURIComponent(otherPairingUrl)}`,
    );
    await vi.waitFor(() => expect(state.connectPairing).toHaveBeenCalled());
    expect(state.confirm).toHaveBeenCalledTimes(2);
    expect(state.connectPairing).toHaveBeenCalledExactlyOnceWith({ pairingUrl: otherPairingUrl });
  },
);

it.each(["en", "zh-CN"] as const)(
  "skips a repeat of a pairing link that already paired (%s)",
  async (locale) => {
    setup();
    state.locale = locale;
    const otherPairingUrl = "https://other.example.com/pair#token=XYZ789";
    await using _coordinator = await mount(
      pairLink,
      pairLink,
      `t3code://pair?pairingUrl=${encodeURIComponent(otherPairingUrl)}`,
    );
    await vi.waitFor(() =>
      expect(state.connectPairing).toHaveBeenLastCalledWith({ pairingUrl: otherPairingUrl }),
    );
    expect(state.confirm).toHaveBeenCalledTimes(2);
    expect(state.connectPairing.mock.calls).toEqual([
      [{ pairingUrl }],
      [{ pairingUrl: otherPairingUrl }],
    ]);
  },
);

it("pairs with Local environment disabled, where there is no primary environment to wait for", async () => {
  setup();
  state.localEnvironmentDisabled = true;
  await using _coordinator = await mount(pairLink);
  await vi.waitFor(() =>
    expect(state.connectPairing).toHaveBeenCalledExactlyOnceWith({ pairingUrl }),
  );
});

it("holds a launch PR link with Local environment disabled until discovery settles", async () => {
  setup();
  state.localEnvironmentDisabled = true;
  await using _coordinator = await mount(pullRequestUrl);
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.openScratchProject).not.toHaveBeenCalled();

  state.projects = [project];
  const navigated = new Promise<void>((resolve) => {
    state.navigate.mockImplementationOnce(async () => resolve());
  });
  await act(async () => {
    appAtomRegistry.set(discoverySettled, true);
    await navigated;
  });
  expect(state.navigate).toHaveBeenCalledExactlyOnceWith(pullRequestView);
  expect(state.openScratchProject).not.toHaveBeenCalled();
});

it.each(["owned", "class", "plain", "tag", "empty"] as const)(
  "localizes desktop preview %s precondition",
  async (kind) => {
    const initialPanel = useRightPanelStore.getState();
    const initialDiff = useDiffPanelStore.getState();
    using _stores = {
      [Symbol.dispose]: () => {
        useRightPanelStore.setState(initialPanel, true);
        useDiffPanelStore.setState(initialDiff, true);
      },
    };
    setup();
    state.locale = "zh-CN";
    state.previewAvailable = true;
    state.routeParams = { environmentId: "local", threadId: "thread" };
    useRightPanelStore.getState().openBrowser(threadRef, null);
    const panel = useRightPanelStore.getState().byThreadKey;
    let reject!: (cause: unknown) => void;
    const pending = new Promise<never>((_, r) => {
      reject = r;
    });
    void pending.catch(() => undefined);
    const source = "Saved browser settings could not be loaded.";
    const cause = new Error("private settings cause");
    if (kind === "owned") {
      if (!realPreview.open) throw new Error("Missing actual preview helper");
      state.openUrl.mockImplementation(realPreview.open);
      state.defaults.mockReturnValue(pending);
    } else
      state.openUrl.mockResolvedValue(
        AsyncResult.failure(
          Cause.fail(
            kind === "class"
              ? new BrowserSettingsReadError({ cause })
              : kind === "tag"
                ? Object.assign(new Error(source), { _tag: "BrowserSettingsReadError" })
                : new Error(kind === "empty" ? "" : source),
          ),
        ),
      );
    const url = "https://literal.example/opaque?value=$%26";
    await using _coordinator = await mount(url);
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          reject(cause);
          await Promise.resolve();
        });
      },
    };
    await vi.waitFor(() => expect(state.openUrl).toHaveBeenCalledTimes(1));
    if (kind === "owned") {
      expect(state.toast).not.toHaveBeenCalled();
      await act(async () => reject(cause));
    }
    await vi.waitFor(() => expect(state.toast).toHaveBeenCalledTimes(1));
    expect(state.toast.mock.calls[0]?.[0]).toMatchObject({
      type: "error",
      title: "无法打开链接",
      description: kind === "owned" ? "无法读取浏览器设置。" : kind === "empty" ? "" : source,
    });
    expect(state.openUrl).toHaveBeenCalledExactlyOnceWith({
      threadRef,
      url,
      openPreview: state.openPreview,
    });
    expect(state.defaults).toHaveBeenCalledTimes(kind === "owned" ? 1 : 0);
    expect(useRightPanelStore.getState().byThreadKey).toBe(panel);
    for (const mock of [
      state.openPreview,
      state.preview,
      state.openScratchProject,
      state.navigate,
      state.openLink,
      state.connectPairing,
      state.confirm,
    ])
      expect(mock).not.toHaveBeenCalled();
  },
);

it.each(["owned", "raw"] as const)(
  "uses current title for pending desktop preview %s failure",
  async (kind) => {
    const initialPanel = useRightPanelStore.getState();
    const initialDiff = useDiffPanelStore.getState();
    using _stores = {
      [Symbol.dispose]: () => {
        useRightPanelStore.setState(initialPanel, true);
        useDiffPanelStore.setState(initialDiff, true);
      },
    };
    setup();
    state.previewAvailable = true;
    state.routeParams = { environmentId: "local", threadId: "thread" };
    useRightPanelStore.getState().openBrowser(threadRef, null);
    let reject!: (cause: unknown) => void;
    const pending = new Promise<never>((_, r) => {
      reject = r;
    });
    void pending.catch(() => undefined);
    if (!realPreview.open) throw new Error("Missing actual helper");
    if (kind === "owned") {
      state.openUrl.mockImplementation(realPreview.open);
      state.defaults.mockReturnValue(pending);
    } else
      state.openUrl.mockImplementation(async () => {
        try {
          await pending;
        } catch (error) {
          return AsyncResult.failure(Cause.fail(error));
        }
      });
    const url = "https://literal.example/title";
    await using coordinator = await mount(url);
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          reject(new Error("private fallback"));
          await Promise.resolve();
        });
      },
    };
    await vi.waitFor(() =>
      expect(kind === "owned" ? state.defaults : state.openUrl).toHaveBeenCalledTimes(1),
    );
    expect(state.toast).not.toHaveBeenCalled();
    await coordinator.rerenderLocale("zh-CN");
    const raw = "Could not open the link";
    await act(async () => reject(new Error(raw)));
    await vi.waitFor(() => expect(state.toast).toHaveBeenCalledTimes(1));
    expect(state.toast.mock.calls[0]?.[0]).toMatchObject({
      type: "error",
      title: "无法打开链接",
      description: kind === "owned" ? "无法读取浏览器设置。" : raw,
    });
    await coordinator.rerenderLocale("en");
    expect(coordinator.readyCalls()).toBe(1);
    expect(coordinator.subscriptions()).toBe(1);
    expect(coordinator.unsubscriptions()).toBe(0);
    expect(state.openUrl).toHaveBeenCalledExactlyOnceWith({
      threadRef,
      url,
      openPreview: state.openPreview,
    });
    expect(state.defaults).toHaveBeenCalledTimes(kind === "owned" ? 1 : 0);
    expect(state.toast).toHaveBeenCalledTimes(1);
    for (const mock of [
      state.openPreview,
      state.preview,
      state.openScratchProject,
      state.navigate,
      state.openLink,
      state.connectPairing,
      state.confirm,
    ])
      expect(mock).not.toHaveBeenCalled();
  },
);

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "uses settlement locale for pairing %s failure",
  async (kind) => {
    const initialPanel = useRightPanelStore.getState();
    const initialDiff = useDiffPanelStore.getState();
    using _stores = {
      [Symbol.dispose]: () => {
        useRightPanelStore.setState(initialPanel, true);
        useDiffPanelStore.setState(initialDiff, true);
      },
    };
    setup();
    let finish!: (result: AtomCommandResult<void, unknown>) => void;
    const pending = new Promise<AtomCommandResult<void, unknown>>((resolve) => {
      finish = resolve;
    });
    state.connectPairing.mockReturnValue(pending);
    await using coordinator = await mount(pairLink);
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await vi.waitFor(() =>
      expect(state.connectPairing).toHaveBeenCalledExactlyOnceWith({ pairingUrl }),
    );
    expect(state.confirm).toHaveBeenCalledExactlyOnceWith(
      "Add the backend at https://vps.example.com?",
    );
    expect(state.confirm.mock.invocationCallOrder[0]).toBeLessThan(
      state.connectPairing.mock.invocationCallOrder[0]!,
    );
    expect(state.toast).not.toHaveBeenCalled();
    await coordinator.rerenderLocale("zh-CN");
    await act(async () =>
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "owned"
                  ? null
                  : new Error(kind === "empty" ? "" : "Failed to add backend."),
              ),
        ),
      ),
    );
    if (kind !== "interrupted") {
      await vi.waitFor(() => expect(state.toast).toHaveBeenCalledTimes(1));
      expect(state.toast.mock.calls[0]?.[0]).toMatchObject({
        type: "error",
        title: "无法添加后端",
        description:
          kind === "owned" ? "添加后端失败。" : kind === "empty" ? "" : "Failed to add backend.",
      });
    } else expect(state.toast).not.toHaveBeenCalled();
    await coordinator.rerenderLocale("en");
    expect(state.connectPairing).toHaveBeenCalledTimes(1);
    expect(state.confirm).toHaveBeenCalledTimes(1);
    expect(coordinator.subscriptions()).toBe(1);
    expect(coordinator.readyCalls()).toBe(1);
    expect(coordinator.unsubscriptions()).toBe(0);
    expect(state.toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
    for (const mock of [
      state.openUrl,
      state.openPreview,
      state.preview,
      state.openScratchProject,
      state.navigate,
      state.openLink,
    ])
      expect(mock).not.toHaveBeenCalled();
  },
);

it("does not pair or report a failure after cancelling the only delivered link", async () => {
  const initialPanel = useRightPanelStore.getState();
  const initialDiff = useDiffPanelStore.getState();
  using _stores = {
    [Symbol.dispose]: () => {
      useRightPanelStore.setState(initialPanel, true);
      useDiffPanelStore.setState(initialDiff, true);
    },
  };
  setup();
  state.confirm.mockResolvedValue(false);
  await using coordinator = await mount(pairLink);
  await vi.waitFor(() =>
    expect(state.confirm).toHaveBeenCalledExactlyOnceWith(
      "Add the backend at https://vps.example.com?",
    ),
  );
  await act(async () => {
    await Promise.resolve();
  });
  await coordinator.rerenderLocale("zh-CN");
  expect(state.connectPairing).not.toHaveBeenCalled();
  expect(state.toast).not.toHaveBeenCalled();
});

it("uses settlement locale for pairing success and ignores its queued duplicate", async () => {
  const initialPanel = useRightPanelStore.getState();
  const initialDiff = useDiffPanelStore.getState();
  using _stores = {
    [Symbol.dispose]: () => {
      useRightPanelStore.setState(initialPanel, true);
      useDiffPanelStore.setState(initialDiff, true);
    },
  };
  setup();
  let finish!: (result: AtomCommandResult<void, unknown>) => void;
  const pending = new Promise<AtomCommandResult<void, unknown>>((resolve) => {
    finish = resolve;
  });
  state.connectPairing.mockReturnValue(pending);
  await using coordinator = await mount(pairLink, pairLink);
  await using _settle = {
    [Symbol.asyncDispose]: async () => {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await vi.waitFor(() =>
    expect(state.connectPairing).toHaveBeenCalledExactlyOnceWith({ pairingUrl }),
  );
  expect(state.confirm).toHaveBeenCalledExactlyOnceWith(
    "Add the backend at https://vps.example.com?",
  );
  expect(state.toast).not.toHaveBeenCalled();
  await coordinator.rerenderLocale("zh-CN");
  await act(async () => {
    finish(AsyncResult.success(undefined));
    await Promise.resolve();
  });
  await vi.waitFor(() => expect(state.toast).toHaveBeenCalledTimes(1));
  expect(state.toast.mock.calls[0]?.[0]).toMatchObject({
    type: "success",
    title: "已添加后端",
    description: "环境已保存，将在应用启动时自动重新连接。",
  });
  await coordinator.rerenderLocale("en");
  expect(state.confirm).toHaveBeenCalledTimes(1);
  expect(state.connectPairing).toHaveBeenCalledExactlyOnceWith({ pairingUrl });
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(coordinator.subscriptions()).toBe(1);
  expect(coordinator.readyCalls()).toBe(1);
  expect(coordinator.unsubscriptions()).toBe(0);
  for (const mock of [
    state.openUrl,
    state.openPreview,
    state.preview,
    state.openScratchProject,
    state.navigate,
    state.openLink,
  ])
    expect(mock).not.toHaveBeenCalled();
});

it("uses the current supplied title for a real scratch failure from an OS link", async () => {
  const initialPanel = useRightPanelStore.getState();
  const initialDiff = useDiffPanelStore.getState();
  using _stores = {
    [Symbol.dispose]: () => {
      useRightPanelStore.setState(initialPanel, true);
      useDiffPanelStore.setState(initialDiff, true);
      state.realScratch = false;
    },
  };
  setup();
  state.realScratch = true;
  let finish!: (result: AtomCommandResult<void, unknown>) => void;
  const pending = new Promise<AtomCommandResult<void, unknown>>((resolve) => {
    finish = resolve;
  });
  state.runScratch.mockReturnValue(pending);
  await using coordinator = await mount("https://literal.example/scratch");
  await using _settle = {
    [Symbol.asyncDispose]: async () => {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await vi.waitFor(() => expect(state.runScratch).toHaveBeenCalledTimes(1));
  expect(state.toast).not.toHaveBeenCalled();
  await coordinator.rerenderLocale("zh-CN");
  await act(async () => finish(AsyncResult.failure(Cause.fail(new Error("literal $& {detail}")))));
  await vi.waitFor(() => expect(state.toast).toHaveBeenCalledTimes(1));
  expect(state.toast.mock.calls[0]?.[0]).toMatchObject({
    title: "无法打开链接",
    description: "literal $& {detail}",
  });
  const { projectEnvironment } = await import("../../state/projects");
  expect(state.runScratch).toHaveBeenCalledExactlyOnceWith(
    appAtomRegistry,
    projectEnvironment.openScratch,
    { environmentId, input: {} },
    { label: projectEnvironment.openScratch.label, reportFailure: false, reportDefect: true },
  );
  await coordinator.rerenderLocale("en");
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(coordinator.subscriptions()).toBe(1);
  expect(coordinator.readyCalls()).toBe(1);
  for (const mock of [
    state.openScratchProject,
    state.scratchThread,
    state.openUrl,
    state.openPreview,
    state.preview,
    state.navigate,
    state.openLink,
    state.connectPairing,
    state.confirm,
  ])
    expect(mock).not.toHaveBeenCalled();
});

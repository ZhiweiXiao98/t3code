import { useRef, useState } from "react";
import { EnvironmentId, ThreadId, ProjectId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { makeThreadFixture } from "../../test-fixtures";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../../terminalUiStateStore";
import { makeThreadErrorSetter, type LocalThreadErrorEntry } from "../ChatView.logic";
import { ChatBannerLane } from "./ChatBannerLane";
import { useChatTerminalActions } from "./useChatTerminalActions";
import { BrowserSettingsReadError } from "../../browser/openFileInPreview";
const realPreview = vi.hoisted(() => ({
  open: undefined as typeof import("../../browser/openFileInPreview").openUrlInPreview | undefined,
}));
const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  allowed: true,
  launch: vi.fn(),
  write: vi.fn(),
  focus: vi.fn(),
  context: vi.fn(),
  preview: vi.fn(),
  openUrl: vi.fn(),
  defaults: vi.fn(),
  resolveUrl: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../../browser/openFileInPreview", async (original) => {
  const actual = await original<typeof import("../../browser/openFileInPreview")>();
  realPreview.open = actual.openUrlInPreview;
  return { ...actual, openUrlInPreview: fixture.openUrl };
});
vi.mock("../../browser/browserDefaults", async (original) => ({
  ...(await original<typeof import("../../browser/browserDefaults")>()),
  resolveBrowserDefaults: fixture.defaults,
}));
vi.mock("../../browser/previewRuntime", async (original) => ({
  ...(await original<typeof import("../../browser/previewRuntime")>()),
  isPreviewAvailableFor: () => true,
}));
vi.mock("../../browser/browserTargetResolver", async (original) => ({
  ...(await original<typeof import("../../browser/browserTargetResolver")>()),
  resolveDiscoveredServerUrl: fixture.resolveUrl,
}));
vi.mock("../ui/toast", async (original) => ({
  ...(await original<typeof import("../ui/toast")>()),
  toastManager: {
    ...(await original<typeof import("../ui/toast")>()).toastManager,
    add: fixture.toast,
  },
}));
vi.mock("../terminal/useThreadTerminalActions", async (original) => ({
  ...(await original<typeof import("../terminal/useThreadTerminalActions")>()),
  useThreadTerminalActions: () => ({
    launchTerminal: fixture.launch,
    writeToTerminal: fixture.write,
  }),
}));
vi.mock("../../state/session", async (original) => ({
  ...(await original<typeof import("../../state/session")>()),
  readEnvironmentScope: () => fixture.allowed,
}));
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: () => fixture.preview,
}));
vi.mock("../../lib/terminalFocus", async (original) => ({
  ...(await original<typeof import("../../lib/terminalFocus")>()),
  focusTerminal: fixture.focus,
}));
vi.mock("../../hooks/useLocalStorage", async (original) => ({
  ...(await original<typeof import("../../hooks/useLocalStorage")>()),
  useLocalStorage: () => [{}, () => undefined],
}));
vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));
vi.mock("../../i18n/readWebI18n", async () => {
  const { translateWebMessage } = await import("../../i18n/messages");
  return {
    readWebI18n: () => ({
      locale: fixture.locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(fixture.locale, key, values),
    }),
  };
});
const ref = {
  environmentId: EnvironmentId.make("script-env"),
  threadId: ThreadId.make("script-thread"),
};
const name = "Literal $& {name}\nscript";
const script = {
  id: "literal-script",
  name,
  command: "echo '$& {literal}'",
  icon: "play" as const,
  runOnWorktreeCreate: false,
};
const thread = makeThreadFixture({ id: ref.threadId, environmentId: ref.environmentId });
const project = {
  id: ProjectId.make("script-project"),
  environmentId: ref.environmentId,
  title: "project",
  workspaceRoot: "/literal/workspace",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
function Probe({ label, preview = false }: { label: string; preview?: boolean }) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismiss] = useState(0);
  const [pending, setPending] = useState(false);
  const composerRef = useRef(null);
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "script",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: () => undefined,
  });
  const actions = useChatTerminalActions({
    environmentId: ref.environmentId,
    composerRef,
    terminalUiState: selectThreadTerminalUiState({}, ref),
    activeThread: thread,
    activeThreadId: ref.threadId,
    activeThreadRef: ref,
    activeProject: project,
    activeRightPanelSurface: null,
    runningTerminalIds: [],
    activeServerOrderedTerminalIds: [],
    activeTerminalLabelsById: new Map(),
    panelTerminalIds: new Set(),
    canReuseTerminal: false,
    gitCwd: null,
    setTerminalUiLaunchContext: fixture.context,
    setThreadError: setError,
  });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await actions.runProjectScriptStable(
            {
              ...script,
              name: label,
              autoOpenPreview: preview,
              previewUrl: "http://localhost:3000/literal",
            },
            { rememberAsLastInvoked: false, shellHistory: "preserve" },
          );
          setPending(false);
        }}
      >
        Run script
      </button>
      <ChatBannerLane
        environmentId={ref.environmentId}
        providerStatus={null}
        providerStatusBannerKey={null}
        setDismissedProviderStatusBannerKey={() => undefined}
        onOpenProviderSetup={() => undefined}
        threadId={ref.threadId}
        threadError={entries.script?.message ?? null}
        localThreadErrorEntry={entries.script}
        threadErrorClass={null}
        threadErrorCode={null}
        threadErrorBannerKey={null}
        setThreadError={setError}
        setThreadErrorBannerDismissTick={setDismiss}
      />
    </>
  );
}
function surface(locale: "en" | "zh-CN", label = name, preview = false) {
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
      <Probe label={label} preview={preview} />
    </WebI18nContext>
  );
}
for (const stage of ["launch", "write"] as const)
  it.each(["owned", "raw", "empty", "interrupted"] as const)(
    `keeps script ${stage} %s failure current`,
    async (kind) => {
      for (const mock of [
        fixture.launch,
        fixture.write,
        fixture.focus,
        fixture.context,
        fixture.preview,
      ])
        mock.mockReset();
      fixture.allowed = true;
      const initial = useTerminalUiStateStore.getState();
      using _store = { [Symbol.dispose]: () => useTerminalUiStateStore.setState(initial, true) };
      const source = `Failed to run script "${name}".`;
      let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
      const pending = new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
        finish = resolve;
      });
      fixture.launch.mockImplementation((input: { place: (id: string) => void }) => {
        input.place("test-terminal");
        return {
          terminalId: "test-terminal",
          result: stage === "launch" ? pending : Promise.resolve(AsyncResult.success(undefined)),
        };
      });
      fixture.write.mockReturnValue(pending);
      await using screen = await render(surface("en"));
      await using _settle = {
        [Symbol.asyncDispose]: async () => {
          await act(async () => {
            finish(AsyncResult.failure(Cause.interrupt()));
            await Promise.resolve();
          });
        },
      };
      await screen.getByRole("button", { name: "Run script", exact: true }).click();
      await expect
        .element(screen.getByRole("button", { name: "Run script", exact: true }))
        .toBeDisabled();
      expect(fixture.launch).toHaveBeenCalledTimes(1);
      expect(fixture.context).toHaveBeenCalledWith({
        threadId: ref.threadId,
        cwd: project.workspaceRoot,
        worktreePath: thread.worktreePath ?? null,
      });
      expect(fixture.focus).toHaveBeenCalledWith(ref, "test-terminal");
      const placed = selectThreadTerminalUiState(
        useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
        ref,
      );
      expect(placed.terminalIds).toContain("test-terminal");
      expect(placed.activeTerminalId).toBe("test-terminal");
      expect(placed.terminalOpen).toBe(true);
      expect(fixture.launch.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.focus.mock.invocationCallOrder[0]!,
      );

      expect(fixture.context.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.launch.mock.invocationCallOrder[0]!,
      );
      await expect.poll(() => fixture.write.mock.calls.length).toBe(stage === "write" ? 1 : 0);
      if (stage === "write")
        expect(fixture.focus.mock.invocationCallOrder[0]).toBeLessThan(
          fixture.write.mock.invocationCallOrder[0]!,
        );
      if (stage === "write")
        expect(fixture.write).toHaveBeenCalledWith("test-terminal", `${script.command}\r`);
      await screen.rerender(surface("zh-CN", "later label"));
      await act(async () => {
        finish(
          AsyncResult.failure(
            kind === "interrupted"
              ? Cause.interrupt()
              : Cause.fail(kind === "owned" ? null : new Error(kind === "empty" ? "" : source)),
          ),
        );
      });
      await expect
        .element(screen.getByRole("button", { name: "Run script", exact: true }))
        .toBeEnabled();
      for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
        await screen.rerender(surface(locale, "later label"));
        if (kind === "empty" || kind === "interrupted")
          expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
        else
          await expect
            .poll(() => screen.container.textContent)
            .toContain(kind === "owned" && locale === "zh-CN" ? `无法运行脚本“${name}”。` : source);
      }
      expect(fixture.launch).toHaveBeenCalledTimes(1);
      expect(fixture.write).toHaveBeenCalledTimes(stage === "write" ? 1 : 0);
      expect(fixture.preview).not.toHaveBeenCalled();
    },
  );

it.each(["denied", "null-launch"] as const)("does not run a script after %s", async (kind) => {
  for (const mock of [
    fixture.launch,
    fixture.write,
    fixture.focus,
    fixture.context,
    fixture.preview,
  ])
    mock.mockReset();
  fixture.allowed = true;
  fixture.launch.mockReturnValue(null);
  await using screen = await render(surface("en"));
  fixture.allowed = kind !== "denied";
  await screen.getByRole("button", { name: "Run script", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Run script", exact: true }))
    .toBeEnabled();
  expect(fixture.launch).toHaveBeenCalledTimes(kind === "denied" ? 0 : 1);
  expect(fixture.context).toHaveBeenCalledTimes(kind === "denied" ? 0 : 1);
  expect(fixture.focus).not.toHaveBeenCalled();
  expect(fixture.write).not.toHaveBeenCalled();
  expect(fixture.preview).not.toHaveBeenCalled();
  expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
});

it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "uses settlement locale for script preview %s failure",
  async (kind) => {
    for (const mock of Object.values(fixture)) if (typeof mock === "function") mock.mockReset();
    fixture.allowed = true;
    const initial = useTerminalUiStateStore.getState();
    using _store = { [Symbol.dispose]: () => useTerminalUiStateStore.setState(initial, true) };
    let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    const pending = new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
      finish = resolve;
    });
    fixture.launch.mockImplementation((input: { place: (id: string) => void }) => {
      input.place("preview-terminal");
      return {
        terminalId: "preview-terminal",
        result: Promise.resolve(AsyncResult.success(undefined)),
      };
    });
    fixture.write.mockResolvedValue(AsyncResult.success(undefined));
    fixture.resolveUrl.mockReturnValue("https://literal.example/app");
    fixture.openUrl.mockReturnValue(pending);
    await using screen = await render(surface("en", name, true));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Run script", exact: true }).click();
    await expect.poll(() => fixture.openUrl.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByRole("button", { name: "Run script", exact: true }))
      .toBeDisabled();
    expect(fixture.toast).not.toHaveBeenCalled();
    expect(fixture.write).toHaveBeenCalledExactlyOnceWith(
      "preview-terminal",
      `${script.command}\r`,
    );
    expect(fixture.resolveUrl).toHaveBeenCalledExactlyOnceWith(
      ref.environmentId,
      "http://localhost:3000/literal",
    );
    expect(fixture.openUrl).toHaveBeenCalledExactlyOnceWith({
      threadRef: ref,
      url: "https://literal.example/app",
      openPreview: fixture.preview,
    });
    expect(
      selectThreadTerminalUiState(
        useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
        ref,
      ).activeTerminalId,
    ).toBe("preview-terminal");
    for (const [before, after] of [
      [fixture.context, fixture.launch],
      [fixture.launch, fixture.focus],
      [fixture.focus, fixture.write],
      [fixture.write, fixture.openUrl],
    ]) {
      expect(before!.mock.invocationCallOrder[0]).toBeLessThan(after!.mock.invocationCallOrder[0]!);
    }
    await screen.rerender(surface("zh-CN", name, true));
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "owned"
                  ? null
                  : new Error(kind === "empty" ? "" : "An unexpected error occurred."),
              ),
        ),
      );
    });
    await expect
      .element(screen.getByRole("button", { name: "Run script", exact: true }))
      .toBeEnabled();
    if (kind === "interrupted") expect(fixture.toast).not.toHaveBeenCalled();
    else {
      expect(fixture.toast).toHaveBeenCalledTimes(1);
      expect(fixture.toast.mock.calls[0]?.[0]).toMatchObject({
        type: "error",
        title: "无法打开预览",
        description:
          kind === "owned"
            ? "发生意外错误。"
            : kind === "empty"
              ? ""
              : "An unexpected error occurred.",
      });
    }
    await screen.rerender(surface("en", name, true));
    expect(fixture.launch).toHaveBeenCalledTimes(1);
    expect(fixture.write).toHaveBeenCalledTimes(1);
    expect(fixture.openUrl).toHaveBeenCalledTimes(1);
    expect(fixture.preview).not.toHaveBeenCalled();
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
  },
);

it.each(["owned", "class", "plain", "tag", "empty"] as const)(
  "preserves script preview settings %s provenance",
  async (kind) => {
    for (const mock of Object.values(fixture)) if (typeof mock === "function") mock.mockReset();
    fixture.allowed = true;
    const initial = useTerminalUiStateStore.getState();
    using _store = { [Symbol.dispose]: () => useTerminalUiStateStore.setState(initial, true) };
    let rejectSettings!: (cause: unknown) => void;
    let finish!: (result: ReturnType<typeof AsyncResult.failure>) => void;
    const settings = new Promise<never>((_, reject) => {
      rejectSettings = reject;
    });
    // Only the actual helper consumes this rejected settings promise.
    if (kind === "owned") fixture.defaults.mockReturnValue(settings);
    void settings.catch(() => undefined);
    const pending = new Promise<ReturnType<typeof AsyncResult.failure>>((resolve) => {
      finish = resolve;
    });
    fixture.launch.mockImplementation((input: { place: (id: string) => void }) => {
      input.place("settings-terminal");
      return {
        terminalId: "settings-terminal",
        result: Promise.resolve(AsyncResult.success(undefined)),
      };
    });
    fixture.write.mockResolvedValue(AsyncResult.success(undefined));
    fixture.resolveUrl.mockReturnValue("https://literal.example/settings");
    if (kind === "owned") {
      if (!realPreview.open) throw new Error("Real preview helper not initialized");
      fixture.openUrl.mockImplementation(realPreview.open);
    } else fixture.openUrl.mockReturnValue(pending);
    await using screen = await render(surface("en", name, true));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          rejectSettings(null);
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Run script", exact: true }).click();
    await expect
      .poll(() =>
        kind === "owned" ? fixture.defaults.mock.calls.length : fixture.openUrl.mock.calls.length,
      )
      .toBe(1);
    await expect
      .element(screen.getByRole("button", { name: "Run script", exact: true }))
      .toBeDisabled();
    expect(fixture.toast).not.toHaveBeenCalled();
    await screen.rerender(surface("zh-CN", name, true));
    const source = "Saved browser settings could not be loaded.";
    const cause = new Error("private settings detail");
    await act(async () => {
      if (kind === "owned") rejectSettings(cause);
      else
        finish(
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
    });
    await expect
      .element(screen.getByRole("button", { name: "Run script", exact: true }))
      .toBeEnabled();
    expect(fixture.toast).toHaveBeenCalledTimes(1);
    expect(fixture.toast.mock.calls[0]?.[0]).toMatchObject({
      type: "error",
      title: "无法打开预览",
      description: kind === "owned" ? "无法读取浏览器设置。" : kind === "empty" ? "" : source,
    });
    await screen.rerender(surface("en", name, true));
    expect(fixture.launch).toHaveBeenCalledTimes(1);
    expect(fixture.write).toHaveBeenCalledExactlyOnceWith(
      "settings-terminal",
      `${script.command}\r`,
    );
    expect(fixture.openUrl).toHaveBeenCalledExactlyOnceWith({
      threadRef: ref,
      url: "https://literal.example/settings",
      openPreview: fixture.preview,
    });
    expect(fixture.defaults).toHaveBeenCalledTimes(kind === "owned" ? 1 : 0);
    expect(fixture.preview).not.toHaveBeenCalled();
    expect(fixture.toast).toHaveBeenCalledTimes(1);
  },
);

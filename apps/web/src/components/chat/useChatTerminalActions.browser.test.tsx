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
const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  allowed: true,
  launch: vi.fn(),
  write: vi.fn(),
  focus: vi.fn(),
  context: vi.fn(),
  preview: vi.fn(),
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
function Probe({ label }: { label: string }) {
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
            { ...script, name: label },
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
function surface(locale: "en" | "zh-CN", label = name) {
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
      <Probe label={label} />
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

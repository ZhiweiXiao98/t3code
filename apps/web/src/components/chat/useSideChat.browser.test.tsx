import { useState } from "react";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { makeThreadFixture } from "../../test-fixtures";
import { useRightPanelStore } from "../../rightPanelStore";
import { makeThreadErrorSetter, type LocalThreadErrorEntry } from "../ChatView.logic";
import { ChatBannerLane } from "./ChatBannerLane";
import { useSideChat } from "./useSideChat";

const fixture = vi.hoisted(() => ({
  forkCommand: {},
  deleteCommand: {},
  modeCommand: {},
  startCommand: {},
  fork: vi.fn(),
  remove: vi.fn(),
  mode: vi.fn(),
  start: vi.fn(),
  wait: vi.fn(),
  read: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("../../state/threads", async (original) => {
  const actual = await original<typeof import("../../state/threads")>();
  return {
    ...actual,
    threadEnvironment: {
      ...actual.threadEnvironment,
      forkSideChat: fixture.forkCommand,
      delete: fixture.deleteCommand,
      setRuntimeMode: fixture.modeCommand,
      startTurn: fixture.startCommand,
    },
  };
});
vi.mock("../../state/use-atom-command", async (original) => ({
  ...(await original<typeof import("../../state/use-atom-command")>()),
  useAtomCommand: (command: unknown) =>
    command === fixture.forkCommand ? fixture.fork : fixture.remove,
}));
vi.mock("../../state/use-orchestration-command", async (original) => ({
  ...(await original<typeof import("../../state/use-orchestration-command")>()),
  useOrchestrationCommand: (command: unknown) =>
    command === fixture.modeCommand ? fixture.mode : fixture.start,
}));
vi.mock("../../state/entities", async (original) => ({
  ...(await original<typeof import("../../state/entities")>()),
  waitForThreadShell: fixture.wait,
  readThreadShell: fixture.read,
}));
vi.mock("./ProviderStatusBanner", async (original) => ({
  ...(await original<typeof import("./ProviderStatusBanner")>()),
  ProviderStatusBanner: () => null,
}));
const ref = {
  environmentId: EnvironmentId.make("side-env"),
  threadId: ThreadId.make("side-parent"),
};
function Probe({ absent = false }: { absent?: boolean }) {
  const [entries, setEntries] = useState<Record<string, LocalThreadErrorEntry>>({});
  const [, setDismiss] = useState(0);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string>("");
  const [duplicate, setDuplicate] = useState<string>("");
  const setError = makeThreadErrorSetter({
    routeThreadRef: ref,
    routeThreadKey: "side",
    draftId: null,
    serverThreadRef: ref,
    setLocalServerErrorsByThreadKey: setEntries,
    setLocalDraftErrorsByDraftId: setEntries,
  });
  const side = useSideChat({
    threadRef: absent ? null : ref,
    readSettings: fixture.settings,
    onError: (message, code) => setError(ref.threadId, message, code),
  });
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setResult("");
          setResult(String(await side.open("literal $& {prompt}")));
          setPending(false);
        }}
      >
        Open side chat
      </button>
      <button
        type="button"
        onClick={async () => setDuplicate(String(await side.open("duplicate")))}
      >
        Open duplicate
      </button>
      <output data-testid="result">{result}</output>
      <output data-testid="duplicate">{duplicate}</output>
      <ChatBannerLane
        environmentId={ref.environmentId}
        providerStatus={null}
        providerStatusBannerKey={null}
        setDismissedProviderStatusBannerKey={() => undefined}
        onOpenProviderSetup={() => undefined}
        threadId={ref.threadId}
        threadError={entries.side?.message ?? null}
        localThreadErrorEntry={entries.side}
        threadErrorClass={null}
        threadErrorCode={null}
        threadErrorBannerKey={null}
        setThreadError={setError}
        setThreadErrorBannerDismissTick={setDismiss}
      />
    </>
  );
}
function surface(locale: "en" | "zh-CN", absent = false) {
  return (
    <WebI18nContext
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => undefined,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Probe absent={absent} />
    </WebI18nContext>
  );
}
function setup() {
  for (const mock of [
    fixture.fork,
    fixture.remove,
    fixture.mode,
    fixture.start,
    fixture.wait,
    fixture.read,
    fixture.settings,
  ])
    mock.mockReset();
  fixture.settings.mockReturnValue({ runtimeMode: "full-access", modelSelection: undefined });
}
it.each(["owned", "raw", "empty", "interrupted"] as const)(
  "keeps side chat fork %s failure current",
  async (kind) => {
    setup();
    const source = "Could not start a side chat.";
    let finish: (value: ReturnType<typeof AsyncResult.failure>) => void = () => undefined;
    fixture.fork.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    using panel = vi
      .spyOn(useRightPanelStore.getState(), "openSideChat")
      .mockImplementation(() => undefined);
    await using screen = await render(surface("en"));
    await using _settle = {
      [Symbol.asyncDispose]: async () => {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Open side chat", exact: true }).click();
    await expect.poll(() => fixture.fork.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByRole("button", { name: "Open side chat", exact: true }))
      .toBeDisabled();
    await screen.rerender(surface("zh-CN"));
    await screen.getByRole("button", { name: "Open duplicate", exact: true }).click();
    await expect.element(screen.getByTestId("duplicate")).toHaveTextContent("false");
    expect(fixture.fork).toHaveBeenCalledTimes(1);
    expect(fixture.settings).toHaveBeenCalledTimes(1);
    finish(
      AsyncResult.failure(
        kind === "interrupted"
          ? Cause.interrupt()
          : Cause.fail(kind === "owned" ? null : new Error(kind === "raw" ? source : "")),
      ),
    );
    await expect.element(screen.getByTestId("result")).toHaveTextContent("false");
    await expect
      .element(screen.getByRole("button", { name: "Open side chat", exact: true }))
      .toBeEnabled();
    for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
      await screen.rerender(surface(locale));
      if (kind === "empty" || kind === "interrupted")
        expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
      else
        await expect
          .poll(() => screen.container.textContent)
          .toContain(kind === "owned" && locale === "zh-CN" ? "无法启动旁支对话。" : source);
    }
    expect(fixture.fork).toHaveBeenCalledExactlyOnceWith({
      environmentId: ref.environmentId,
      input: {
        sourceThreadId: ref.threadId,
        targetThreadId: expect.any(String),
        title: "Side chat",
      },
    });
    for (const mock of [
      fixture.wait,
      fixture.read,
      fixture.remove,
      fixture.mode,
      fixture.start,
      panel,
    ])
      expect(mock).not.toHaveBeenCalled();
    fixture.fork.mockResolvedValueOnce(AsyncResult.failure(Cause.interrupt()));
    await screen.getByRole("button", { name: "Open side chat", exact: true }).click();
    await expect.poll(() => fixture.fork.mock.calls.length).toBe(2);
    await expect
      .element(screen.getByRole("button", { name: "Open side chat", exact: true }))
      .toBeEnabled();
    expect(fixture.settings).toHaveBeenCalledTimes(2);
  },
);
it("does not fork a side chat without an eligible source", async () => {
  setup();
  using panel = vi
    .spyOn(useRightPanelStore.getState(), "openSideChat")
    .mockImplementation(() => undefined);
  await using screen = await render(surface("en", true));
  await screen.getByRole("button", { name: "Open side chat", exact: true }).click();
  await expect.element(screen.getByTestId("result")).toHaveTextContent("false");
  for (const mock of [
    fixture.fork,
    fixture.settings,
    fixture.wait,
    fixture.read,
    fixture.remove,
    fixture.mode,
    fixture.start,
    panel,
  ])
    expect(mock).not.toHaveBeenCalled();
  expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
});

const stageNotices = {
  wait: [
    "The side chat was created, but it did not reach this client.",
    "旁支对话已创建，但尚未同步到此客户端。",
  ],
  read: ["The side chat is no longer available.", "旁支对话已不可用。"],
  mode: ["Could not set the side chat's permission mode.", "无法设置旁支对话的权限模式。"],
  start: ["Could not send the side chat message.", "无法发送旁支对话消息。"],
} as const;
const stageCases = [
  { stage: "wait", kind: "owned" },
  { stage: "read", kind: "owned" },
  ...(["mode", "start"] as const).flatMap((stage) =>
    (["owned", "raw", "empty", "interrupted"] as const).map((kind) => ({ stage, kind })),
  ),
] as const;
it.each(stageCases)("keeps side chat $stage $kind failure current", async ({ stage, kind }) => {
  setup();
  if (stage !== "wait" && stage !== "read" && stage !== "mode" && stage !== "start")
    throw new Error("Unexpected stage");
  const [source, chinese] = stageNotices[stage];
  fixture.fork.mockResolvedValue(AsyncResult.success(undefined));
  fixture.remove.mockResolvedValue(AsyncResult.success(undefined));
  fixture.read.mockImplementation((target: typeof ref) =>
    stage === "read"
      ? null
      : makeThreadFixture({
          id: target.threadId,
          environmentId: target.environmentId,
          runtimeMode: stage === "mode" ? "approval-required" : "full-access",
        }),
  );
  let finishWait: (ready: boolean) => void = () => undefined;
  let finishCommand: (result: ReturnType<typeof AsyncResult.failure>) => void = () => undefined;
  if (stage === "wait" || stage === "read")
    fixture.wait.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishWait = resolve;
      }),
    );
  else {
    fixture.wait.mockResolvedValue(true);
    (stage === "mode" ? fixture.mode : fixture.start).mockReturnValue(
      new Promise((resolve) => {
        finishCommand = resolve;
      }),
    );
  }
  using panel = vi
    .spyOn(useRightPanelStore.getState(), "openSideChat")
    .mockImplementation(() => undefined);
  await using screen = await render(surface("en"));
  await using _settle = {
    [Symbol.asyncDispose]: async () => {
      await act(async () => {
        finishWait(false);
        finishCommand(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  await screen.getByRole("button", { name: "Open side chat", exact: true }).click();
  const pending =
    stage === "wait" || stage === "read"
      ? fixture.wait
      : stage === "mode"
        ? fixture.mode
        : fixture.start;
  await expect.poll(() => pending.mock.calls.length).toBe(1);
  await expect
    .element(screen.getByRole("button", { name: "Open side chat", exact: true }))
    .toBeDisabled();
  await screen.rerender(surface("zh-CN"));
  await screen.getByRole("button", { name: "Open duplicate", exact: true }).click();
  await expect.element(screen.getByTestId("duplicate")).toHaveTextContent("false");
  expect(fixture.fork).toHaveBeenCalledTimes(1);
  if (stage === "wait" || stage === "read") finishWait(stage === "read");
  else
    finishCommand(
      AsyncResult.failure(
        kind === "interrupted"
          ? Cause.interrupt()
          : Cause.fail(kind === "owned" ? null : new Error(kind === "raw" ? source : "")),
      ),
    );
  await expect.element(screen.getByTestId("result")).toHaveTextContent("false");
  await expect
    .element(screen.getByRole("button", { name: "Open side chat", exact: true }))
    .toBeEnabled();
  for (const locale of ["zh-CN", "en", "zh-CN", "en"] as const) {
    await screen.rerender(surface(locale));
    if (kind === "empty" || kind === "interrupted")
      expect(screen.container.querySelector('[data-variant="error"]')).toBeNull();
    else
      await expect
        .poll(() => screen.container.textContent)
        .toContain(kind === "owned" && locale === "zh-CN" ? chinese : source);
  }
  const targetThreadId = fixture.fork.mock.calls[0]?.[0]?.input.targetThreadId;
  expect(targetThreadId).toEqual(expect.any(String));
  expect(fixture.fork).toHaveBeenCalledExactlyOnceWith({
    environmentId: ref.environmentId,
    input: { sourceThreadId: ref.threadId, targetThreadId, title: "Side chat" },
  });
  expect(fixture.wait).toHaveBeenCalledExactlyOnceWith({
    environmentId: ref.environmentId,
    threadId: targetThreadId,
  });
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith({
    environmentId: ref.environmentId,
    input: { threadId: targetThreadId, onlyIfUnused: true },
  });
  expect(fixture.read).toHaveBeenCalledTimes(stage === "wait" ? 0 : 1);
  if (stage !== "wait")
    expect(fixture.read).toHaveBeenCalledWith({
      environmentId: ref.environmentId,
      threadId: targetThreadId,
    });
  expect(fixture.mode).toHaveBeenCalledTimes(stage === "mode" ? 1 : 0);
  expect(fixture.start).toHaveBeenCalledTimes(stage === "start" ? 1 : 0);
  if (stage === "mode")
    expect(fixture.mode).toHaveBeenCalledExactlyOnceWith({
      environmentId: ref.environmentId,
      input: {
        threadId: targetThreadId,
        runtimeMode: "full-access",
        createdAt: expect.any(String),
      },
    });
  if (stage === "start")
    expect(fixture.start.mock.calls[0]?.[0]).toMatchObject({
      environmentId: ref.environmentId,
      input: {
        threadId: targetThreadId,
        message: { role: "user", text: "literal $& {prompt}", attachments: [] },
        runtimeMode: "full-access",
        interactionMode: "default",
      },
    });
  expect(fixture.fork.mock.invocationCallOrder[0]!).toBeLessThan(
    fixture.wait.mock.invocationCallOrder[0]!,
  );
  expect(pending.mock.invocationCallOrder[0]!).toBeLessThan(
    fixture.remove.mock.invocationCallOrder[0]!,
  );
  expect(fixture.settings).toHaveBeenCalledTimes(1);
  expect(panel).not.toHaveBeenCalled();
});

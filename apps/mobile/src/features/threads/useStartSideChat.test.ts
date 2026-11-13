import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type RuntimeMode,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../../i18n/mobileStrings";
import { makeThreadShellFixture } from "../../test-fixtures";

const mocks = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  alert: vi.fn(),
  fork: vi.fn(),
  remove: vi.fn(),
  mode: vi.fn(),
  turn: vi.fn(),
  wait: vi.fn(),
  shell: vi.fn(),
  open: vi.fn(),
  uuid: vi.fn(),
}));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert, prompt: vi.fn() } }));
vi.mock("../../lib/uuid", () => ({ uuidv4: mocks.uuid }));
vi.mock("../../state/atom-registry", () => ({ appAtomRegistry: { get: mocks.shell } }));
vi.mock("../../state/threads", () => ({
  environmentThreadShells: { threadShellAtom: (reference: unknown) => reference },
  threadEnvironment: {
    forkSideChat: "fork",
    delete: "remove",
    setRuntimeMode: "mode",
    startTurn: "turn",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: "fork" | "remove" | "mode" | "turn") => mocks[command],
}));
vi.mock("./threadForkNavigation", () => ({ waitForThreadShell: mocks.wait }));
vi.mock("./useOpenLinkedThread", () => ({ useOpenLinkedThread: () => mocks.open }));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, mocks.locale),
    localizeAlertArguments: (...args: Parameters<typeof actual.localizeAlertArguments>) =>
      actual.localizeAlertArguments(args[0], args[1], args[2], mocks.locale),
  };
});

import { useStartSideChat } from "./useStartSideChat";

const source = { environmentId: EnvironmentId.make("Settings"), threadId: ThreadId.make("source") };
const settings = {
  runtimeMode: "full-access" as const,
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "Settings {0} $&" },
};
const prompt = "Settings\nOpen {0} $&";

function sideChatShell(runtimeMode: RuntimeMode) {
  return makeThreadShellFixture({
    environmentId: source.environmentId,
    id: ThreadId.make("target"),
    projectId: ProjectId.make("project"),
    title: "Side chat",
    providerInstanceId: settings.modelSelection.instanceId,
    modelSelection: settings.modelSelection,
    runtimeMode,
    interactionMode: "default",
    branch: null,
    worktreePath: null,
  });
}

function setup(locale: MobileLocale) {
  mocks.locale = locale;
  for (const mock of [
    mocks.alert,
    mocks.fork,
    mocks.remove,
    mocks.mode,
    mocks.turn,
    mocks.wait,
    mocks.shell,
    mocks.open,
    mocks.uuid,
  ])
    mock.mockReset();
  for (const command of [mocks.fork, mocks.remove, mocks.mode, mocks.turn])
    command.mockResolvedValue(AsyncResult.success(undefined));
  mocks.wait.mockResolvedValue(true);
  mocks.shell.mockReturnValue(sideChatShell("approval-required"));
  mocks.uuid.mockReturnValueOnce("target").mockReturnValue("message");
}

it.each(["en", "zh-CN"] as const)(
  "keeps side-chat errors literal in %s, translates only owned fallbacks and preserves failure cleanup",
  async (locale) => {
    const stages = [
      {
        command: mocks.fork,
        discard: false,
        en: "Could not start a side chat.",
        zh: "无法启动旁支对话。",
      },
      {
        command: mocks.mode,
        discard: true,
        en: "Could not set the side chat's permission mode.",
        zh: "无法设置旁支对话的权限模式。",
      },
      {
        command: mocks.turn,
        discard: true,
        en: "Could not send the side chat message.",
        zh: "无法发送旁支对话消息。",
      },
    ];
    for (const stage of stages) {
      for (const error of [new Error("Settings"), new Error("Open {0} $&"), "not an Error"]) {
        setup(locale);
        stage.command.mockResolvedValueOnce(AsyncResult.failure(Cause.fail(error)));
        await expect(useStartSideChat()(source, prompt, settings)).resolves.toBe(false);
        expect(mocks.alert.mock.lastCall?.slice(0, 2)).toEqual([
          locale === "en" ? "Side chat not started" : "旁支对话未启动",
          error instanceof Error ? error.message : locale === "en" ? stage.en : stage.zh,
        ]);
        if (stage.discard)
          expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({
            environmentId: "Settings",
            input: { threadId: "target", onlyIfUnused: true },
          });
        else expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.open).not.toHaveBeenCalled();
      }
      setup(locale);
      stage.command.mockResolvedValueOnce(AsyncResult.failure(Cause.interrupt(1)));
      await expect(useStartSideChat()(source, prompt, settings)).resolves.toBe(false);
      expect(mocks.alert).not.toHaveBeenCalled();
      expect(mocks.remove).toHaveBeenCalledTimes(stage.discard ? 1 : 0);
      expect(mocks.open).not.toHaveBeenCalled();
    }
  },
);

it.each(["en", "zh-CN"] as const)(
  "localizes side-chat synchronization failures in %s and discards only the unused target",
  async (locale) => {
    for (const absent of ["not-arrived", "removed"] as const) {
      setup(locale);
      if (absent === "not-arrived") mocks.wait.mockResolvedValueOnce(false);
      else mocks.shell.mockReturnValueOnce(null);
      await expect(useStartSideChat()(source, prompt, settings)).resolves.toBe(false);
      expect(mocks.alert.mock.lastCall?.[1]).toBe(
        absent === "not-arrived"
          ? locale === "en"
            ? "The side chat was created, but it did not reach this device."
            : "旁支对话已创建，但尚未同步到此设备。"
          : locale === "en"
            ? "The side chat is no longer available."
            : "此旁支对话已不可用。",
      );
      expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({
        environmentId: "Settings",
        input: { threadId: "target", onlyIfUnused: true },
      });
      expect(mocks.mode).not.toHaveBeenCalled();
      expect(mocks.turn).not.toHaveBeenCalled();
      expect(mocks.open).not.toHaveBeenCalled();
    }
  },
);

it.each(["en", "zh-CN"] as const)(
  "preserves side-chat title, prompt, model and permission payloads in %s and opens only after the send",
  async (locale) => {
    for (const sameMode of [false, true]) {
      setup(locale);
      if (sameMode) mocks.shell.mockReturnValueOnce(sideChatShell(settings.runtimeMode));
      const sent = Promise.withResolvers<AsyncResult.Success<void>>();
      const reachedSend = Promise.withResolvers<void>();
      mocks.turn.mockImplementationOnce(() => {
        reachedSend.resolve();
        return sent.promise;
      });
      const result = useStartSideChat()(source, prompt, settings);
      await reachedSend.promise;
      expect(mocks.open).not.toHaveBeenCalled();
      expect(mocks.fork).toHaveBeenCalledExactlyOnceWith({
        environmentId: "Settings",
        input: {
          sourceThreadId: "source",
          targetThreadId: "target",
          title: "Side chat",
          creationSource: "mobile",
        },
      });
      expect(mocks.mode).toHaveBeenCalledTimes(sameMode ? 0 : 1);
      if (!sameMode)
        expect(mocks.mode.mock.lastCall?.[0].input).toMatchObject({
          threadId: "target",
          runtimeMode: "full-access",
        });
      const turn = mocks.turn.mock.lastCall?.[0];
      expect(turn.environmentId).toBe("Settings");
      expect(turn.input).toMatchObject({
        threadId: "target",
        message: { messageId: "message", role: "user", text: prompt, attachments: [] },
        runtimeMode: settings.runtimeMode,
        interactionMode: "default",
      });
      expect(turn.input.modelSelection).toBe(settings.modelSelection);
      sent.resolve(AsyncResult.success(undefined));
      await expect(result).resolves.toBe(true);
      expect(mocks.open).toHaveBeenCalledExactlyOnceWith({
        environmentId: "Settings",
        threadId: "target",
      });
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.alert).not.toHaveBeenCalled();
    }
  },
);

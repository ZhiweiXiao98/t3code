import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { translateWebMessage, type WebMessageKey } from "../i18n/messages";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  available: true,
  interrupt: false,
  command: vi.fn(),
}));
vi.mock("../i18n/readWebI18n", () => ({
  readWebI18n: () => ({
    locale: state.locale,
    t: (key: WebMessageKey) => translateWebMessage(state.locale, key),
  }),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => "multiple" }));
vi.mock("~/rpc/atomRegistry", () => ({
  appAtomRegistry: {
    get: () => new Map(state.available ? [["env", { environment: { capabilities: {} } }]] : []),
  },
}));
vi.mock("~/state/server", () => ({ environmentServerConfigsAtom: {} }));
vi.mock("~/state/threads", () => ({
  threadEnvironment: { linkPullRequest: {}, unlinkPullRequest: {} },
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => state.command }));
vi.mock("@t3tools/client-runtime/state/runtime", async (original) => ({
  ...(await original<typeof import("@t3tools/client-runtime/state/runtime")>()),
  isAtomCommandInterrupted: () => state.interrupt,
}));

import { usePullRequestLinking } from "./usePullRequestLinking";

const ref = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread/$&") };
const url = "https://github.com/owner/repo/pull/42";
beforeEach(() => {
  state.locale = "en";
  state.available = true;
  state.interrupt = false;
  state.command.mockReset().mockResolvedValue(AsyncResult.success({}));
});

it("localizes its three own failures while preserving action and provider failures", async () => {
  const action = usePullRequestLinking(ref.environmentId);
  for (const locale of ["en", "zh-CN", "en"] as const) {
    state.locale = locale;
    await expect(action.changeLink(ref, "opaque-invalid/$&", true)).rejects.toThrow(
      translateWebMessage(locale, "audit11.prUnavailable"),
    );
    state.available = false;
    await expect(action.changeLink(ref, url, true)).rejects.toThrow(
      translateWebMessage(locale, "audit11.prUnsupported"),
    );
    state.available = true;
    state.interrupt = true;
    state.command.mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error("interrupted"))));
    await expect(action.changeLink(ref, url, true)).rejects.toThrow(
      translateWebMessage(locale, "audit11.prInterrupted"),
    );
    state.interrupt = false;
  }
  state.locale = "zh-CN";
  for (const message of ["Link update interrupted.", "provider /路径/$&/{name}"]) {
    const error = new Error(message);
    state.command.mockResolvedValueOnce(AsyncResult.failure(Cause.fail(error)));
    await expect(action.changeLink(ref, url, true)).rejects.toBe(error);
  }
  state.command.mockClear();
  await action.changeLink(ref, url, true);
  expect(state.command).toHaveBeenCalledExactlyOnceWith({
    environmentId: ref.environmentId,
    input: expect.objectContaining({ threadId: ref.threadId, url, source: "manual" }),
  });
});

it("reads the latest locale after an in-flight link action is interrupted", async () => {
  let complete: (() => void) | undefined;
  state.command.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = () => resolve(AsyncResult.failure(Cause.fail(new Error("interrupted"))));
      }),
  );
  const pending = usePullRequestLinking(ref.environmentId).changeLink(ref, url, true);
  state.locale = "zh-CN";
  state.interrupt = true;
  complete?.();
  await expect(pending).rejects.toThrow("关联更新已中断。");
});

import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { describe, expect, it, vi } from "vite-plus/test";

import * as runtime from "@t3tools/client-runtime/state/runtime";
import * as webI18n from "../i18n/readWebI18n";
import { translateWebMessage } from "../i18n/messages";
import { toastManager } from "~/components/ui/toast";
import { createScratchProjectActions } from "./useScratchProject";

const local = "local" as EnvironmentId;
const remote = "remote" as EnvironmentId;
const other = "other" as EnvironmentId;

function scratchEnvironment(environmentId: EnvironmentId, scratchWorkspaceRoot: string | null) {
  return {
    environmentId,
    connection: { phase: "connected" },
    serverConfig: { scratchWorkspaceRoot },
  } as never;
}

function actions(
  primary: EnvironmentId | null,
  localRoot: string | null,
  remoteRoot: string | null = "/remote/scratch",
) {
  const environments = [
    scratchEnvironment(local, localRoot),
    scratchEnvironment(remote, remoteRoot),
    scratchEnvironment(other, "/other/scratch"),
  ];
  return createScratchProjectActions({
    environments: () => environments,
    primaryEnvironmentId: () => primary,
    registry: AtomRegistry.make(),
    handleNewThread: async () => null,
  });
}

describe("scratchEnvironmentId", () => {
  it("prefers the primary environment over the one on screen", () => {
    expect(actions(local, "/local/scratch").scratchEnvironmentId(remote)).toBe(local);
    expect(actions(local, "/local/scratch").scratchEnvironmentId(null)).toBe(local);
  });

  it("falls back when the primary environment offers no scratch root", () => {
    expect(actions(local, null).scratchEnvironmentId(remote)).toBe(remote);
    expect(actions(null, null).scratchEnvironmentId(remote)).toBe(remote);
    expect(actions(null, null, null).scratchEnvironmentId(remote)).toBe(other);
    expect(actions(local, null).scratchEnvironmentId(null)).toBeNull();
  });
});

it("uses the current language for a scratch failure after switching while it is pending", async () => {
  let locale: "en" | "zh-CN" = "en";
  using _i18n = vi.spyOn(webI18n, "readWebI18n").mockImplementation(() => {
    const currentLocale = locale;
    return {
      locale: currentLocale,
      t: (key, values) => translateWebMessage(currentLocale, key, values),
    };
  });
  using addToast = vi.spyOn(toastManager, "add").mockReturnValue("scratch-failure");
  let resolveResult!: (value: Awaited<ReturnType<typeof runtime.runAtomCommand>>) => void;
  const result = new Promise<Awaited<ReturnType<typeof runtime.runAtomCommand>>>((resolve) => {
    resolveResult = resolve;
  });
  using _run = vi.spyOn(runtime, "runAtomCommand").mockReturnValueOnce(result);
  const scratch = actions(local, "/local/scratch");
  const pending = scratch.openScratchProject(local);
  locale = "zh-CN";
  resolveResult(AsyncResult.failure(Cause.fail(null)));
  await pending;
  expect(addToast).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      type: "error",
      title: "无法启动无项目任务",
      description: "发生错误。",
    }),
  );
});

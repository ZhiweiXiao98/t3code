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

it("evaluates a supplied lazy scratch title only when reporting settled failure", async () => {
  let locale: "en" | "zh-CN" = "en";
  using _i18n = vi.spyOn(webI18n, "readWebI18n").mockImplementation(() => ({
    locale,
    t: (key, values) => translateWebMessage(locale, key, values),
  }));
  using toast = vi.spyOn(toastManager, "add").mockReturnValue("lazy-failure");
  let finish!: (value: Awaited<ReturnType<typeof runtime.runAtomCommand>>) => void;
  const result = new Promise<Awaited<ReturnType<typeof runtime.runAtomCommand>>>((resolve) => {
    finish = resolve;
  });
  using run = vi.spyOn(runtime, "runAtomCommand").mockReturnValueOnce(result);
  const title = vi.fn(() => (locale === "en" ? "Owned title" : "当前标题"));
  const pending = actions(local, "/scratch").openScratchProject(local, title);
  expect(title).not.toHaveBeenCalled();
  locale = "zh-CN";
  finish(AsyncResult.failure(Cause.fail(new Error("literal $& {detail}"))));
  expect(await pending).toBeNull();
  expect(title).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ title: "当前标题", description: "literal $& {detail}" }),
  );
  expect(run).toHaveBeenCalledTimes(1);
});

it.each(["success", "interrupted"] as const)(
  "does not evaluate lazy scratch title on %s",
  async (kind) => {
    using toast = vi.spyOn(toastManager, "add").mockReturnValue("unused");
    using _run = vi
      .spyOn(runtime, "runAtomCommand")
      .mockResolvedValueOnce(
        kind === "success" ? AsyncResult.success(null) : AsyncResult.failure(Cause.interrupt()),
      );
    const title = vi.fn(() => "must not run");
    await actions(local, "/scratch").openScratchProject(local, title);
    expect(title).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  },
);

it.each(["literal $& {title}", ""])(
  "preserves explicit scratch title %s and empty Error",
  async (title) => {
    using toast = vi.spyOn(toastManager, "add").mockReturnValue("raw");
    using _run = vi
      .spyOn(runtime, "runAtomCommand")
      .mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error(""))));
    await actions(local, "/scratch").openScratchProject(local, title);
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title, description: "" }),
    );
  },
);

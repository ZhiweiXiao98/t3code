import { useState } from "react";
import { EnvironmentId } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../test/render";
import { WebI18nContext } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";
import { useNewProject } from "./useNewProject";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  create: vi.fn(),
  publish: vi.fn(),
  wait: vi.fn(),
  thread: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../state/use-atom-command")>();
  const { projectEnvironment } = await import("../state/projects");
  const { sourceControlEnvironment } = await import("../state/sourceControl");
  return {
    ...actual,
    useAtomCommand: (command: unknown) => {
      if (command === projectEnvironment.createNew) return fixture.create;
      if (command === sourceControlEnvironment.publishRepository) return fixture.publish;
      throw new Error("Unexpected command");
    },
  };
});
vi.mock("../state/entities", async (original) => ({
  ...(await original<typeof import("../state/entities")>()),
  waitForProject: fixture.wait,
}));
vi.mock("./useHandleNewThread", async (original) => ({
  ...(await original<typeof import("./useHandleNewThread")>()),
  useNewThreadHandler: () => fixture.thread,
}));
vi.mock("../components/ui/toast", async (original) => {
  const actual = await original<typeof import("../components/ui/toast")>();
  return { ...actual, toastManager: { ...actual.toastManager, add: fixture.toast } };
});
vi.mock("../i18n/readWebI18n", async (original) => ({
  ...(await original<typeof import("../i18n/readWebI18n")>()),
  readWebI18n: () => {
    const locale = fixture.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
const environmentId = EnvironmentId.make("new-project-test");
function Probe() {
  const create = useNewProject();
  const [status, setStatus] = useState("idle");
  return (
    <>
      <button
        disabled={status === "pending"}
        onClick={async () => {
          setStatus("pending");
          const result = await create({
            environmentId,
            name: "Literal $& {project}",
            publishTo: null,
          });
          setStatus(String(result));
        }}
      >
        Create project
      </button>
      <output>{status}</output>
    </>
  );
}
function view() {
  const locale = fixture.locale;
  return (
    <WebI18nContext.Provider
      value={{
        locale: fixture.locale,
        appLocale: fixture.locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Probe />
    </WebI18nContext.Provider>
  );
}
it.each(["owned", "raw", "collision", "empty", "whitespace", "interrupted"] as const)(
  "uses settlement locale for initial project %s failure",
  async (kind) => {
    vi.clearAllMocks();
    fixture.locale = "en";
    let finish!: (result: AtomCommandResult<never, unknown>) => void;
    fixture.create.mockReset().mockReturnValue(
      new Promise<AtomCommandResult<never, unknown>>((resolve) => {
        finish = resolve;
      }),
    );
    await using screen = await render(view());
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          finish(AsyncResult.failure(Cause.interrupt()));
          await Promise.resolve();
        });
      },
    };
    await screen.getByRole("button", { name: "Create project" }).click();
    await expect.element(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { name: "Literal $& {project}" },
    });
    fixture.locale = "zh-CN";
    await screen.rerender(view());
    const raw =
      kind === "raw"
        ? "Literal $& {private}"
        : kind === "collision"
          ? translateWebMessage("en", "common.error")
          : kind === "whitespace"
            ? " \n "
            : "";
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(kind === "owned" ? null : new Error(raw)),
        ),
      );
    });
    await expect.element(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
    await expect.poll(() => screen.container.textContent).toContain("false");
    if (kind === "interrupted") expect(fixture.toast).not.toHaveBeenCalled();
    else {
      expect(fixture.toast).toHaveBeenCalledTimes(1);
      expect(fixture.toast.mock.calls[0]?.[0]).toMatchObject({
        title: translateWebMessage("zh-CN", "newProject.createError"),
        description:
          kind === "raw" || kind === "collision"
            ? raw
            : translateWebMessage("zh-CN", "common.error"),
      });
    }
    fixture.locale = "en";
    await screen.rerender(view());
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(fixture.wait).not.toHaveBeenCalled();
    expect(fixture.thread).not.toHaveBeenCalled();
  },
);

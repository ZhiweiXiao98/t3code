import { useState } from "react";
import { AuthOrchestrationOperateScope, EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../test/render";
import { WebI18nContext } from "../i18n/WebI18nContext";
import { translateWebMessage } from "../i18n/messages";
import { useProjectGroupUpdate } from "./useProjectGroupUpdate";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  update: vi.fn(),
  toast: vi.fn(),
  scope: vi.fn(),
}));
const first = EnvironmentId.make("group-first");
const second = EnvironmentId.make("group-second");
const members = [
  {
    environmentId: first,
    id: ProjectId.make("project-first"),
    environmentLabel: "Literal $& {environment}",
  },
  {
    environmentId: second,
    id: ProjectId.make("project-second"),
    environmentLabel: "Second environment",
  },
];
const configs = new Map(
  [first, second].map((id) => [
    id,
    { environment: { capabilities: { projectOrganization: true } } },
  ]),
);
vi.mock("../state/entities", async (original) => ({
  ...(await original<typeof import("../state/entities")>()),
  useServerConfigs: () => configs,
}));
vi.mock("../state/environments", async (original) => ({
  ...(await original<typeof import("../state/environments")>()),
  readEnvironment: (id: EnvironmentId) =>
    configs.has(id) ? { connection: { phase: "connected" }, serverConfig: configs.get(id) } : null,
}));
vi.mock("../state/session", async (original) => ({
  ...(await original<typeof import("../state/session")>()),
  readEnvironmentScope: (...args: unknown[]) => fixture.scope(...args),
}));
vi.mock("../state/use-atom-command", async (original) => {
  const actual = await original<typeof import("../state/use-atom-command")>();
  const { projectEnvironment } = await import("../state/projects");
  return {
    ...actual,
    useAtomCommand: (command: unknown) => {
      if (command === projectEnvironment.update) return fixture.update;
      throw new Error("Unexpected command");
    },
  };
});
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
function Probe({ single }: { single: boolean }) {
  const { updateProjectGroup, canOrganizeProjectGroup } = useProjectGroupUpdate();
  const [status, setStatus] = useState("idle");
  const selected = single ? members.slice(0, 1) : members;
  return (
    <>
      <button
        disabled={status === "pending" || !canOrganizeProjectGroup(selected)}
        onClick={async () => {
          setStatus("pending");
          const result = await updateProjectGroup(
            selected,
            { pinned: true },
            "Failed to pin project",
          );
          setStatus(result._tag);
        }}
      >
        Pin project
      </button>
      <output>{status}</output>
    </>
  );
}
function view(single = false) {
  const locale = fixture.locale;
  return (
    <WebI18nContext.Provider
      value={{
        locale,
        appLocale: locale,
        setAppLocale: () => {},
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      <Probe single={single} />
    </WebI18nContext.Provider>
  );
}
it.each([
  { name: "owned", cause: null, description: "发生错误。", interrupted: false, single: false },
  {
    name: "raw collision",
    cause: new Error("An error occurred."),
    description: "An error occurred.",
    interrupted: false,
    single: false,
  },
  { name: "empty", cause: new Error(""), description: "", interrupted: false, single: false },
  { name: "interrupted", cause: null, description: "", interrupted: true, single: false },
  {
    name: "single member",
    cause: null,
    description: "发生错误。",
    interrupted: false,
    single: true,
  },
])("uses settlement locale for project group failure: $name", async (entry) => {
  fixture.locale = "en";
  fixture.toast.mockReset().mockReturnValue("group-toast");
  fixture.scope
    .mockReset()
    .mockImplementation((id, scope) => configs.has(id) && scope === AuthOrchestrationOperateScope);
  let finish!: (result: AtomCommandResult<unknown, unknown>) => void;
  const pending = new Promise<AtomCommandResult<unknown, unknown>>((resolve) => {
    finish = resolve;
  });
  fixture.update.mockReset().mockReturnValue(pending);
  await using screen = await render(view(entry.single));
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish(AsyncResult.failure(Cause.interrupt()));
        await Promise.resolve();
      });
    },
  };
  const button = screen.getByRole("button", { name: "Pin project", exact: true });
  await expect.element(button).toBeEnabled();
  await button.click();
  await expect.element(button).toBeDisabled();
  expect(fixture.update).toHaveBeenCalledExactlyOnceWith({
    environmentId: first,
    input: { projectId: members[0]!.id, pinned: true },
  });
  expect(fixture.scope).toHaveBeenCalledWith(first, AuthOrchestrationOperateScope);
  if (!entry.single)
    expect(fixture.scope).toHaveBeenCalledWith(second, AuthOrchestrationOperateScope);
  expect(fixture.toast).not.toHaveBeenCalled();
  fixture.locale = "zh-CN";
  await screen.rerender(view(entry.single));
  await act(async () => {
    finish(AsyncResult.failure(entry.interrupted ? Cause.interrupt() : Cause.fail(entry.cause)));
  });
  await expect.element(button).toBeEnabled();
  expect(screen.container.textContent).toContain("Failure");
  if (entry.interrupted) expect(fixture.toast).not.toHaveBeenCalled();
  else
    expect(fixture.toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "error",
        title: entry.single ? "置顶项目失败" : "Literal $& {environment}上的置顶项目失败",
        description: entry.description,
      }),
    );
  fixture.locale = "en";
  await screen.rerender(view(entry.single));
  expect(fixture.update).toHaveBeenCalledTimes(1);
  expect(fixture.toast).toHaveBeenCalledTimes(entry.interrupted ? 0 : 1);
});

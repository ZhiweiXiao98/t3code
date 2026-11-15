import {
  AuthOrchestrationOperateScope,
  EnvironmentId,
  ThreadId,
  type ContextMenuItem,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../test/render";
import { makeThreadFixture } from "../test-fixtures";
import { WebI18nContext } from "../i18n/WebI18nContext";
import { translateWebMessage, translateWebSource } from "../i18n/messages";
import type { ThreadActionMenuId } from "../components/threadActionMenu.logic";
import { ThreadPinningUnsupportedError } from "./useThreadActions";
import { useThreadActionMenu } from "./useThreadActionMenu";

const fixture = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  granted: true,
  show: vi.fn(),
  close: vi.fn(),
  pin: vi.fn(),
  toast: vi.fn(),
  other: vi.fn(),
}));
const target = {
  environmentId: EnvironmentId.make("menu-env"),
  threadId: ThreadId.make("menu-thread"),
};
const shell = makeThreadFixture({ id: target.threadId, environmentId: target.environmentId });
vi.mock("../localApi", async (original) => ({
  ...(await original<typeof import("../localApi")>()),
  readLocalApi: () => ({ contextMenu: { show: fixture.show, close: fixture.close } }),
}));
vi.mock("../state/entities", async (original) => ({
  ...(await original<typeof import("../state/entities")>()),
  readThreadShell: () => shell,
  useProjects: () => [],
  readEnvironmentServerConfigLoaded: () => true,
  readEnvironmentSupportsAutoSettleOptOut: () => true,
}));
vi.mock("../state/environments", async (original) => ({
  ...(await original<typeof import("../state/environments")>()),
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("../state/session", async (original) => ({
  ...(await original<typeof import("../state/session")>()),
  readEnvironmentScope: (_environmentId: unknown, scope: unknown) =>
    scope === AuthOrchestrationOperateScope && fixture.granted,
}));
vi.mock("./useSettings", async (original) => ({
  ...(await original<typeof import("./useSettings")>()),
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select(DEFAULT_CLIENT_SETTINGS),
}));
vi.mock("./useThreadActions", async (original) => ({
  ...(await original<typeof import("./useThreadActions")>()),
  canTurnThreadIntoProject: () => false,
  useThreadActions: () => ({ pinThread: fixture.pin }),
}));
vi.mock("../state/use-orchestration-command", async (original) => ({
  ...(await original<typeof import("../state/use-orchestration-command")>()),
  useOrchestrationCommand: () => fixture.other,
}));
vi.mock("./useHandleNewThread", async (original) => ({
  ...(await original<typeof import("./useHandleNewThread")>()),
  useNewThreadHandler: () => fixture.other,
}));
vi.mock("./useCopyToClipboard", async (original) => ({
  ...(await original<typeof import("./useCopyToClipboard")>()),
  useCopyToClipboard: () => ({ copyToClipboard: fixture.other }),
}));
vi.mock("../components/Sidebar.snooze", async (original) => ({
  ...(await original<typeof import("../components/Sidebar.snooze")>()),
  resolveSnoozePresets: () => [],
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
function Probe() {
  const { openMenu } = useThreadActionMenu({
    threadRef: target,
    projectCwd: "/literal/project",
    onStartRename: fixture.other,
    canShareWithGuest: false,
  });
  return <button onClick={() => openMenu({ x: 10, y: 20 })}>Thread menu</button>;
}
function view() {
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
      <Probe />
    </WebI18nContext.Provider>
  );
}
it.each(["owned", "raw", "empty", "typed", "interrupted"] as const)(
  "uses settlement locale for menu pin %s failure",
  async (kind) => {
    vi.clearAllMocks();
    fixture.locale = "en";
    fixture.granted = true;
    fixture.show.mockReset().mockResolvedValue("pin");
    let finish!: (result: AtomCommandResult<void, unknown>) => void;
    fixture.pin.mockReset().mockReturnValue(
      new Promise<AtomCommandResult<void, unknown>>((resolve) => {
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
    await screen.getByRole("button", { name: "Thread menu" }).click();
    await expect.poll(() => fixture.pin.mock.calls.length).toBe(1);
    expect(fixture.pin).toHaveBeenCalledExactlyOnceWith(target);
    const items: ReadonlyArray<ContextMenuItem<ThreadActionMenuId>> =
      fixture.show.mock.calls[0]?.[0];
    expect(items.some((item) => item.id === "pin" && !item.disabled)).toBe(true);
    expect(fixture.show.mock.calls[0]?.[1]).toEqual({ x: 10, y: 20 });
    expect(fixture.toast).not.toHaveBeenCalled();
    fixture.locale = "zh-CN";
    await screen.rerender(view());
    const raw = kind === "raw" ? translateWebMessage("en", "common.error") : "";
    await act(async () => {
      finish(
        AsyncResult.failure(
          kind === "interrupted"
            ? Cause.interrupt()
            : Cause.fail(
                kind === "owned"
                  ? null
                  : kind === "typed"
                    ? new ThreadPinningUnsupportedError(target)
                    : new Error(raw),
              ),
        ),
      );
    });
    if (kind === "interrupted") expect(fixture.toast).not.toHaveBeenCalled();
    else {
      expect(fixture.toast).toHaveBeenCalledTimes(1);
      expect(fixture.toast.mock.calls[0]?.[0]).toMatchObject({
        title: translateWebSource("zh-CN", "Failed to pin thread"),
        description:
          kind === "owned"
            ? translateWebMessage("zh-CN", "common.error")
            : kind === "typed"
              ? "此环境的服务器尚不支持置顶。请更新服务器以使用置顶功能。"
              : raw,
      });
    }
    fixture.locale = "en";
    await screen.rerender(view());
    expect(fixture.pin).toHaveBeenCalledTimes(1);
    expect(fixture.show).toHaveBeenCalledTimes(1);
    expect(fixture.toast).toHaveBeenCalledTimes(kind === "interrupted" ? 0 : 1);
    expect(fixture.other).not.toHaveBeenCalled();
  },
);
it("rechecks permission after mocked native menu selection", async () => {
  vi.clearAllMocks();
  fixture.locale = "en";
  fixture.granted = true;
  let choose!: (action: ThreadActionMenuId | null) => void;
  fixture.show.mockReset().mockReturnValue(
    new Promise<ThreadActionMenuId | null>((resolve) => {
      choose = resolve;
    }),
  );
  await using screen = await render(view());
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        choose(null);
        await Promise.resolve();
      });
    },
  };
  await screen.getByRole("button", { name: "Thread menu" }).click();
  await expect.poll(() => fixture.show.mock.calls.length).toBe(1);
  fixture.granted = false;
  await act(async () => {
    choose("pin");
  });
  expect(fixture.pin).not.toHaveBeenCalled();
  expect(fixture.other).not.toHaveBeenCalled();
  expect(fixture.toast).toHaveBeenCalledTimes(1);
});

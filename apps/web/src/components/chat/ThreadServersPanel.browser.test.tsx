import { EnvironmentId, ThreadId, type DiscoveredLocalServer } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  openExternal: vi.fn(),
  openPort: vi.fn(),
  openPreview: vi.fn(),
  stop: vi.fn(),
}));

vi.mock(import("../../i18n/readWebI18n"), async () => {
  const { translateWebMessage } = await import("../../i18n/messages");
  return {
    readWebI18n: () => ({
      locale: state.locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(state.locale, key, values),
    }),
  };
});
vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: () => true,
}));
vi.mock(import("@effect/atom-react"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    useAtomValue: ((...args: Parameters<typeof actual.useAtomValue>) => {
      const value = actual.useAtomValue(...args);
      return args[0] ===
        previewEnvironment.stopLocalServer.permissionAtom(EnvironmentId.make("env"))
        ? true
        : value;
    }) as typeof actual.useAtomValue,
  };
});
vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  useEnvironment: (() => ({
    serverConfig: { environment: { capabilities: { localServerStop: true } } },
  })) as never,
}));
vi.mock(import("../../state/use-atom-command"), async () => {
  const { previewEnvironment } = await import("../../state/preview");
  return {
    useAtomCommand: (command: unknown) => {
      if (command === previewEnvironment.stopLocalServer) return state.stop;
      if (command === previewEnvironment.open) return state.openPreview;
      throw new Error("Unexpected command in ThreadServersPanel fixture");
    },
  };
});
vi.mock(import("../../localApi"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    readLocalApi: () => {
      const api = actual.createLocalApi();
      return { ...api, shell: { ...api.shell, openExternal: state.openExternal } };
    },
  };
});
vi.mock(import("../preview/openDiscoveredPort"), () => ({
  openDiscoveredPort: state.openPort,
}));

vi.mock(import("../../portDiscoveryState"), async (importOriginal) => ({
  ...(await importOriginal()),
  useThreadDiscoveredPorts: () =>
    Array.from(
      { length: 10 },
      (_, index) =>
        ({
          pid: index,
          port: 3000 + index,
          url: `http://localhost:${3000 + index}`,
          terminal: null,
          processName: "node",
        }) as DiscoveredLocalServer,
    ),
}));

import { act, render } from "../../../test/render";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage } from "../../i18n/messages";
import { toastManager } from "../ui/toast";
import { previewEnvironment } from "../../state/preview";
import { ThreadServersPanel } from "./ThreadServersPanel";

const panel = (threadId: string) => (
  <ThreadServersPanel
    environmentId={EnvironmentId.make("env")}
    threadId={ThreadId.make(threadId)}
  />
);

function setup() {
  state.locale = "en";
  state.openExternal.mockReset().mockResolvedValue(undefined);
  state.openPort.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.openPreview.mockReset();
  state.stop.mockReset().mockResolvedValue(AsyncResult.success(undefined));
}

const localizedPanel = () => (
  <WebI18nContext
    value={{
      locale: state.locale,
      appLocale: state.locale,
      setAppLocale: () => {},
      t: (key, values) => translateWebMessage(state.locale, key, values),
    }}
  >
    {panel("a")}
  </WebI18nContext>
);

it("pages servers four at a time, collapses back, and resets on thread switch", async () => {
  setup();
  await using screen = await render(panel("a"));
  const count = (selector: string) => screen.container.querySelectorAll(selector).length;
  const expectRows = (rows: number) => vi.waitFor(() => expect(count("li")).toBe(rows));

  await expectRows(4);
  await page.getByRole("button", { name: "Show 4 more" }).click();
  await expectRows(8);
  expect(count("[data-thread-details-server-overflow]")).toBe(4);
  await page.getByRole("button", { name: "Show 2 more" }).click();
  await expectRows(10);
  await page.getByRole("button", { name: "Show less" }).click();
  await expectRows(4);

  await page.getByRole("button", { name: "Show 4 more" }).click();
  await expectRows(8);
  await screen.rerender(panel("b"));
  await expectRows(4);
  await screen.rerender(panel("a"));
  await expectRows(4);
});

it("localizes server action failures at completion without translating raw errors", async () => {
  setup();
  const raw = new Error("Unable to open preview");
  state.openExternal.mockRejectedValue(raw);
  state.openPort.mockResolvedValue(AsyncResult.failure(Cause.fail(raw)));
  state.stop.mockResolvedValue(AsyncResult.failure(Cause.fail(raw)));
  await using screen = await render(localizedPanel());
  using toast = vi.spyOn(toastManager, "add").mockReturnValue("server-failure");
  const row = screen.getByRole("button", { name: "localhost:3000 Agent · node", exact: true });

  for (const locale of ["en", "zh-CN", "en"] as const) {
    state.locale = locale;
    await screen.rerender(localizedPanel());
    toast.mockClear();
    await act(async () => {
      row
        .element()
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    });
    await vi.waitFor(() =>
      expect(toast).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          title: locale === "zh-CN" ? "无法在浏览器中打开" : "Unable to open in browser",
          description: raw.message,
        }),
      ),
    );
    expect(state.openExternal).toHaveBeenLastCalledWith("http://localhost:3000");

    toast.mockClear();
    await row.click();
    await vi.waitFor(() =>
      expect(toast).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          title: locale === "zh-CN" ? "无法打开预览" : "Unable to open preview",
          description: raw.message,
        }),
      ),
    );
    expect(state.openPort).toHaveBeenLastCalledWith(
      expect.objectContaining({
        threadRef: { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("a") },
        port: expect.objectContaining({ pid: 0, port: 3000 }),
        openPreview: state.openPreview,
      }),
    );

    toast.mockClear();
    await row.hover();
    await screen
      .getByRole("button", {
        name: locale === "zh-CN" ? "停止 localhost:3000" : "Stop localhost:3000",
        exact: true,
      })
      .click();
    await vi.waitFor(() =>
      expect(toast).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          title: locale === "zh-CN" ? "无法停止服务器" : "Could not stop server",
          description: raw.message,
        }),
      ),
    );
    expect(state.stop).toHaveBeenLastCalledWith({
      environmentId: EnvironmentId.make("env"),
      input: { pid: 0, port: 3000 },
    });
  }

  toast.mockClear();
  let rejectPending!: (reason: unknown) => void;
  const pending = new Promise<void>((_resolve, reject) => {
    rejectPending = reject;
  });
  state.openExternal.mockReturnValueOnce(pending);
  await act(async () => {
    row.element().dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
  });
  state.locale = "zh-CN";
  await screen.rerender(localizedPanel());
  await act(async () => rejectPending(new Error("opaque/{server}/$&")));
  await vi.waitFor(() =>
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "无法在浏览器中打开",
        description: "opaque/{server}/$&",
      }),
    ),
  );

  toast.mockClear();
  state.openPort.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
  state.stop.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
  await act(async () =>
    row.element().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
  );
  await act(async () =>
    screen
      .getByRole("button", { name: "停止 localhost:3000", exact: true })
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
  );
  expect(toast).not.toHaveBeenCalled();
});

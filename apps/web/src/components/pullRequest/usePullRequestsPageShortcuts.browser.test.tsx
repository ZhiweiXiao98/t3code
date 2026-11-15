import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { compileResolvedKeybindingsConfig } from "@t3tools/shared/keybindings";
import { expect, it, vi } from "vite-plus/test";
import { useOpenPanelPullRequestUrl } from "~/hooks/useOpenPanelPullRequestUrl";
import {
  PULL_REQUESTS_PANEL_REF,
  selectActiveRightPanelSurface,
  useRightPanelStore,
} from "~/rightPanelStore";
import { translateWebMessage } from "~/i18n/messages";
import { act, render } from "../../../test/render";
import { toastManager } from "../ui/toast";
import { usePullRequestsPageShortcuts } from "./usePullRequestsPageShortcuts";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "zh-CN",
  close: vi.fn(),
  toggle: vi.fn(),
  maximize: vi.fn(),
}));
vi.mock(import("~/hooks/useSupportsMultiplePullRequests"), async (original) => ({
  ...(await original()),
  useSupportsMultiplePullRequests: () => false,
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useProject: () => null,
}));
vi.mock(import("~/state/query"), async (original) => {
  const emptyQuery = { data: undefined };
  return { ...(await original()), useEnvironmentQuery: (() => emptyQuery) as never };
});
vi.mock(import("~/i18n/readWebI18n"), () => ({
  readWebI18n: () => {
    const locale = state.locale;
    return {
      locale,
      t: (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values),
    };
  },
}));
const keybindings = compileResolvedKeybindingsConfig([
  { key: "ctrl+shift+c", command: "thread.copyReference" },
  { key: "ctrl+shift+x", command: "rightPanel.close" },
  { key: "ctrl+shift+b", command: "rightPanel.toggle" },
  { key: "ctrl+shift+m", command: "rightPanel.toggleMaximized" },
]);
function Probe({ available = true }: { available?: boolean }) {
  const url = useOpenPanelPullRequestUrl(PULL_REQUESTS_PANEL_REF);
  const surface = useRightPanelStore((store) =>
    selectActiveRightPanelSurface(store.byThreadKey, PULL_REQUESTS_PANEL_REF),
  );
  usePullRequestsPageShortcuts({
    openPanelPullRequestUrl: url,
    keybindings,
    getShortcutContext: () => ({
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
      modelPickerOpen: false,
      isWeb: true,
      isDesktop: false,
    }),
    activePullRequestSurface: surface?.kind === "pull-request" ? surface : null,
    closeSurface: state.close,
    rightPanelAvailable: available,
    rightPanelOpen: surface !== null,
    toggleRightPanel: state.toggle,
    toggleRightPanelMaximized: state.maximize,
  });
  return <output aria-label="Open link">{url ?? "none"}</output>;
}
const github = "https://github.com/fixture/clipboard/pull/42?literal=$&brace={value}";
const gitlab = "https://gitlab.com/fixture/clipboard/-/merge_requests/42?literal=$&brace={value}";
function open(url = github) {
  useRightPanelStore.getState().openPullRequest(PULL_REQUESTS_PANEL_REF, {
    environmentId: EnvironmentId.make("clipboard-fixture"),
    projectId: ProjectId.make("clipboard-project"),
    repository: "fixture/clipboard",
    number: 42,
    url,
  });
}
function isolateSnapshot() {
  const key = "t3.pullRequests.detail:clipboard-fixture:clipboard-project:fixture/clipboard#42";
  const value = localStorage.getItem(key);
  localStorage.removeItem(key);
  return {
    [Symbol.dispose]() {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
  };
}
async function key(letter = "c", repeat = false, prevented = false) {
  const event = new KeyboardEvent("keydown", {
    key: letter,
    code: `Key${letter.toUpperCase()}`,
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    repeat,
  });
  if (prevented) event.preventDefault();
  await act(() => document.dispatchEvent(event));
  return event;
}
it.each([
  ["github", github, "拉取请求链接", "PR"],
  ["gitlab", gitlab, "合并请求链接", "MR"],
] as const)(
  "localizes page shortcut clipboard failure: %s",
  async (_kind, url, target, shortLabel) => {
    using _snapshot = isolateSnapshot();
    const before = useRightPanelStore.getState();
    using _restore = {
      [Symbol.dispose]() {
        useRightPanelStore.setState(before, true);
        state.locale = "en";
      },
    };
    open(url);
    let reject = (_cause: unknown) => {};
    using write = vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
    );
    using rich = vi
      .spyOn(navigator.clipboard, "write")
      .mockRejectedValue(new Error("Unexpected rich write"));
    using toast = vi.spyOn(toastManager, "add").mockReturnValue("copy-toast");
    await using screen = await render(<Probe />);
    await using _settle = {
      async [Symbol.asyncDispose]() {
        await act(async () => {
          reject(new Error("Disposed"));
          await Promise.resolve();
        });
      },
    };
    await expect.element(screen.getByRole("status", { name: "Open link" })).toHaveTextContent(url);
    expect((await key()).defaultPrevented).toBe(true);
    expect(write).toHaveBeenCalledExactlyOnceWith(url);
    expect((await key("c", true)).defaultPrevented).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const current = useRightPanelStore.getState();
    state.locale = "zh-CN";
    await screen.rerender(<Probe />);
    await act(async () => {
      reject(new Error("Literal $& {opaque native cause}"));
      await Promise.resolve();
    });
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      type: "error",
      title: `无法复制 ${shortLabel} 链接`,
      description: `无法将 ${target} 复制到剪贴板。`,
    });
    expect(useRightPanelStore.getState()).toBe(current);
    state.locale = "en";
    await screen.rerender(<Probe />);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(rich).not.toHaveBeenCalled();
  },
);
it("localizes page shortcut unavailable clipboard API", async () => {
  using _snapshot = isolateSnapshot();
  const before = useRightPanelStore.getState();
  const clipboard = navigator.clipboard;
  const descriptor = Object.getOwnPropertyDescriptor(clipboard, "writeText");
  using _restore = {
    [Symbol.dispose]() {
      if (descriptor) Object.defineProperty(clipboard, "writeText", descriptor);
      else Reflect.deleteProperty(clipboard, "writeText");
      useRightPanelStore.setState(before, true);
      state.locale = "en";
    },
  };
  open();
  state.locale = "zh-CN";
  Object.defineProperty(clipboard, "writeText", { configurable: true, value: undefined });
  using fallback = vi.spyOn(document, "execCommand").mockReturnValue(false);
  using rich = vi.spyOn(clipboard, "write").mockRejectedValue(new Error("Unexpected rich write"));
  using toast = vi.spyOn(toastManager, "add").mockReturnValue("unavailable-toast");
  await using screen = await render(<Probe />);
  await expect.element(screen.getByRole("status", { name: "Open link" })).toHaveTextContent(github);
  await key();
  expect(toast).toHaveBeenCalledExactlyOnceWith({
    type: "error",
    title: "无法复制 PR 链接",
    description: "复制 拉取请求链接 时剪贴板 API 不可用。",
  });
  expect(fallback).toHaveBeenCalledExactlyOnceWith("copy");
  expect(rich).not.toHaveBeenCalled();
});
it("preserves page shortcut routing and guards", async () => {
  using _snapshot = isolateSnapshot();
  const before = useRightPanelStore.getState();
  using _restore = {
    [Symbol.dispose]() {
      useRightPanelStore.setState(before, true);
    },
  };
  useRightPanelStore.getState().close(PULL_REQUESTS_PANEL_REF);
  state.close.mockClear();
  state.toggle.mockClear();
  state.maximize.mockClear();
  using write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  using rich = vi
    .spyOn(navigator.clipboard, "write")
    .mockRejectedValue(new Error("Unexpected rich write"));
  using toast = vi.spyOn(toastManager, "add").mockReturnValue("guard-toast");
  await using screen = await render(<Probe available={false} />);
  expect((await key()).defaultPrevented).toBe(false);
  expect((await key("x")).defaultPrevented).toBe(false);
  expect((await key("b")).defaultPrevented).toBe(false);
  expect((await key("m")).defaultPrevented).toBe(false);
  await act(() => open());
  await screen.rerender(<Probe />);
  const palette = document.createElement("div");
  palette.setAttribute("data-command-palette", "");
  document.body.append(palette);
  using _palette = {
    [Symbol.dispose]() {
      palette.remove();
    },
  };
  expect((await key()).defaultPrevented).toBe(false);
  palette.remove();
  await key("c", false, true);
  for (const letter of ["x", "b", "m"])
    expect((await key(letter, true)).defaultPrevented).toBe(true);
  expect(state.close).not.toHaveBeenCalled();
  expect(state.toggle).not.toHaveBeenCalled();
  expect(state.maximize).not.toHaveBeenCalled();
  for (const letter of ["x", "b", "m"]) expect((await key(letter)).defaultPrevented).toBe(true);
  expect(state.close).toHaveBeenCalledExactlyOnceWith(
    selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      PULL_REQUESTS_PANEL_REF,
    ),
  );
  expect(state.toggle).toHaveBeenCalledExactlyOnceWith();
  expect(state.maximize).toHaveBeenCalledExactlyOnceWith();
  expect(write).not.toHaveBeenCalled();
  expect(rich).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
  await screen.unmount();
  expect((await key("b")).defaultPrevented).toBe(false);
  expect(state.toggle).toHaveBeenCalledTimes(1);
});

it("preserves dispatched page clipboard URL across surface changes", async () => {
  using _snapshot = isolateSnapshot();
  const before = useRightPanelStore.getState();
  using _restore = {
    [Symbol.dispose]() {
      useRightPanelStore.setState(before, true);
      state.locale = "en";
    },
  };
  open(github);
  let finish = () => {};
  using write = vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  using rich = vi
    .spyOn(navigator.clipboard, "write")
    .mockRejectedValue(new Error("Unexpected rich write"));
  using toast = vi.spyOn(toastManager, "add").mockReturnValue("success-toast");
  await using screen = await render(<Probe />);
  await using _settle = {
    async [Symbol.asyncDispose]() {
      await act(async () => {
        finish();
        await Promise.resolve();
      });
    },
  };
  await key();
  expect(write).toHaveBeenCalledExactlyOnceWith(github);
  state.locale = "zh-CN";
  await act(() => open(gitlab));
  await screen.rerender(<Probe />);
  await expect.element(screen.getByRole("status", { name: "Open link" })).toHaveTextContent(gitlab);
  await act(async () => {
    finish();
    await Promise.resolve();
  });
  expect(toast).toHaveBeenCalledExactlyOnceWith({
    type: "success",
    title: "已复制 PR 链接",
    description: github,
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(rich).not.toHaveBeenCalled();
});

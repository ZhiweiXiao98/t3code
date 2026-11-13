import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { showBootError } from "./bootError";

function override(target: object, property: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  return {
    [Symbol.dispose]() {
      if (previous) Object.defineProperty(target, property, previous);
      else Reflect.deleteProperty(target, property);
    },
  };
}

function shell() {
  const node = document.createElement("div");
  node.id = "boot-shell";
  document.body.append(node);
  return { node, [Symbol.dispose]: () => node.remove() };
}

const state = (status: DesktopUpdateState["status"], extra: Partial<DesktopUpdateState> = {}) =>
  ({ status, ...extra }) as DesktopUpdateState;

it("renders offline recovery immediately and leaves commands, reports, and issue URLs unchanged", () => {
  using root = shell();
  using _bridge = override(window, "desktopBridge", undefined);
  using _languages = override(navigator, "languages", ["en-US"]);
  using _offline = override(navigator, "onLine", false);
  using _storage = override(window, "localStorage", { getItem: () => '{"appLocale":"zh-CN"}' });
  using _error = vi.spyOn(console, "error").mockImplementation(() => {});
  showBootError(new Error("provider/{name}/$&"));
  expect(root.node.querySelector("h1")?.textContent).toBe("T3 Code 启动失败");
  expect(root.node.textContent).toContain("此浏览器似乎已离线");
  expect(root.node.querySelector("code")?.textContent).toBe("npx t3 triage");
  expect(root.node.querySelector("pre")?.textContent).toContain("provider/{name}/$&");
  const issue = root.node.querySelector<HTMLAnchorElement>('a[href*="issues/new"]')!;
  expect(new URL(issue.href).searchParams.get("title")).toBe("T3 Code failed to start");
  expect(root.node.querySelector("#boot-error-reload")?.textContent).toBe("重新加载");
});

it("reprojects delayed desktop locale without remounting, duplicate listeners, or stale updater reads", async () => {
  using root = shell();
  using _error = vi.spyOn(console, "error").mockImplementation(() => {});
  let resolveSettings!: (value: { appLocale: "zh-CN" }) => void;
  let resolveInitialUpdate!: (value: DesktopUpdateState) => void;
  const settings = new Promise<{ appLocale: "zh-CN" }>((resolve) => {
    resolveSettings = resolve;
  });
  const initialUpdate = new Promise<DesktopUpdateState>((resolve) => {
    resolveInitialUpdate = resolve;
  });
  let push!: (value: DesktopUpdateState) => void;
  const subscribe = vi.fn((listener: typeof push) => {
    push = listener;
    return () => {};
  });
  const install = vi.fn(async () => ({ state: state("downloaded") }));
  const bridge = {
    getSystemLocale: () => "en-US",
    getClientPlatform: () => "MacIntel",
    getClientSettings: () => settings,
    onUpdateState: subscribe,
    getUpdateState: () => initialUpdate,
    installUpdate: install,
    cliCommand: { getState: async () => ({ launcherPath: "/Users/{name}/t3", onPath: false }) },
  } as unknown as DesktopBridge;
  using _bridge = override(window, "desktopBridge", bridge);
  showBootError("opaque failure");
  const button = root.node.querySelector<HTMLButtonElement>("#boot-error-update")!;
  expect(root.node.querySelector("h1")?.textContent).toBe("T3 Code failed to start");
  push(state("downloading", { downloadPercent: 41.6, errorContext: "download" }));
  expect(button.textContent).toBe("Downloading update (42%)");
  resolveSettings({ appLocale: "zh-CN" });
  await settings;
  expect(root.node.querySelector("#boot-error-update")).toBe(button);
  expect(button.textContent).toBe("正在下载更新（42%）");
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(root.node.querySelector("#boot-error-update-note")?.textContent).toContain("更新下载失败");
  resolveInitialUpdate(state("available"));
  await initialUpdate;
  expect(button.textContent).toBe("正在下载更新（42%）");
  push(state("downloaded", { errorContext: "install" }));
  expect(button.textContent).toBe("重启以更新");
  expect(root.node.querySelector("#boot-error-update-note")?.textContent).toContain("更新安装失败");
  button.click();
  await Promise.resolve();
  expect(install).toHaveBeenCalledTimes(1);
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(root.node.querySelector("code")?.textContent).toBe("'/Users/{name}/t3' triage");
});

it("keeps the fallback visible when desktop locale rejects and local storage is inaccessible", async () => {
  using root = shell();
  using _error = vi.spyOn(console, "error").mockImplementation(() => {});
  using _warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  using _bridge = override(window, "desktopBridge", {
    getSystemLocale: () => "zh-CN",
    getClientPlatform: () => "MacIntel",
    getClientSettings: () => Promise.reject(new Error("IPC unavailable")),
  });
  using _storage = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new Error("blocked");
  });
  showBootError("opaque");
  await Promise.resolve();
  expect(root.node.querySelector("h1")?.textContent).toBe("T3 Code 启动失败");
  expect(root.node.querySelector("#boot-error-reload")).not.toBeNull();
});

it("localizes copy success and blocked-copy accessibility hints without changing copied text", async () => {
  using root = shell();
  using _bridge = override(window, "desktopBridge", undefined);
  using _storage = override(window, "localStorage", { getItem: () => '{"appLocale":"zh-CN"}' });
  using _error = vi.spyOn(console, "error").mockImplementation(() => {});
  using _platform = override(navigator, "platform", "MacIntel");
  const writeText = vi.fn().mockResolvedValue(undefined);
  using _clipboard = override(navigator, "clipboard", { writeText });
  using _secure = override(window, "isSecureContext", true);
  using _copy = vi.spyOn(document, "execCommand").mockReturnValue(false);
  showBootError("provider/{name}/$&");
  const command = root.node.querySelector<HTMLButtonElement>("#boot-error-command button")!;
  command.click();
  await Promise.resolve();
  expect(writeText).toHaveBeenCalledWith("npx t3 triage");
  expect(command.getAttribute("aria-label")).toBe("已复制");
  await vi.waitFor(() =>
    expect(root.node.querySelector('[aria-live="polite"]')?.textContent).toBe("已复制到剪贴板。"),
  );
  writeText.mockRejectedValueOnce(new Error("blocked"));
  command.click();
  await Promise.resolve();
  expect(command.getAttribute("aria-label")).toBe("按 ⌘C 复制");
  await vi.waitFor(() =>
    expect(root.node.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "复制被阻止。已选中文本，你可以手动复制。",
    ),
  );
});

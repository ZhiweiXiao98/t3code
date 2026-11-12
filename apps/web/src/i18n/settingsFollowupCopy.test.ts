import { cleanupPendingDescription } from "../components/settings/settingsFollowupPresentation";
import {
  snapShotStatus,
  snapShotDescription,
  snapShotSetupSummary,
} from "../components/settings/SnapShotSettings.logic";
import { DEFAULT_CLIENT_SETTINGS, type DesktopSnapShotState } from "@t3tools/contracts";
import { threadHeaderTitle } from "../components/ChatView.logic";
import { changesBaseLabel } from "../components/GitActionsControl.logic";
import {
  chatWidthLabel,
  cleanupRunPresentation,
  cleanupLastRunSummary,
} from "../components/settings/settingsFollowupPresentation";
import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { translateWebSource, translateWebMessage } from "./messages";
import { getProviderSummary } from "../components/settings/providerStatus";
const provider: ServerProvider = {
  instanceId: ProviderInstanceId.make("codex"),
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: false,
  version: null,
  status: "error",
  auth: { status: "unknown" },
  checkedAt: "2026-11-12T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
};
describe("second packaged UI pass", () => {
  it.each([
    ["Comfortable", "舒适"],
    ["Wide", "宽"],
    ["Preview & diff", "预览与差异"],
    ["Other", "其他"],
    ["Last run", "上次运行"],
    ["Capture a window and attach it to your current draft.", "截取窗口并附加到当前草稿。"],
    [
      "Automatic capture isn't available here. Choose a window instead.",
      "此处不支持自动截取，请选择一个窗口。",
    ],
    [
      "SnapShots require a Wayland session. X11 capture is not supported.",
      "快照需要 Wayland 会话。不支持在 X11 下截取。",
    ],
    ["SnapShots are not supported on this platform.", "此平台不支持快照。"],
    ["Could not load the last run.", "无法加载上次运行结果。"],
    ["Loading last run…", "正在加载上次运行结果…"],
    ["Cleanup hasn't run yet.", "尚未运行清理。"],
    ["Checking snapshots…", "正在检查快照…"],
    ["Not supported on this platform.", "此平台不支持此功能。"],
    ["Turn this on to set up snapshots.", "开启此项以设置快照。"],
    ["Capture needs attention", "截取需要处理"],
    ["Check capture access in setup", "请在设置中检查截取权限"],
    ["Install the capture helper to continue", "请安装截取辅助程序以继续"],
    ["Set up active-window snapshots", "设置活动窗口快照"],
    [
      "Manual capture only. You'll choose a window each time",
      "仅支持手动截取，每次都需要选择窗口。",
    ],
    ["Enable capture to continue", "请启用截取以继续"],
    ["Connecting your shortcut…", "正在关联快捷键…"],
    ["Waiting for shortcut permission", "正在等待快捷键权限"],
    ["Ready to capture", "可以截取"],
    ["Use your shortcut from another app", "请在其他应用中使用快捷键"],
    ["Shortcut saved", "快捷键已保存"],
    ["Finish shortcut setup", "完成快捷键设置"],
    ["Capture effects aren't available on this desktop.", "此桌面不支持截取效果。"],
    [
      "Install or update the capture helper to enable effects.",
      "安装或更新截取辅助程序以启用效果。",
    ],
    ["Capture effects aren't available on Niri.", "Niri 不支持截取效果。"],
    [
      "Update the GNOME extension, then sign out and back in to enable effects.",
      "更新 GNOME 扩展后，注销并重新登录以启用效果。",
    ],
    ["Finish extension setup to enable effects.", "完成扩展设置以启用效果。"],
    ["This desktop only provides a screenshot.", "此桌面仅提供截图。"],
    ["Update the desktop app to use snapshots.", "请更新桌面应用以使用快照。"],
    ["Updating capture settings…", "正在更新截取设置…"],
  ])("translates static owned copy %s", (source, expected) => {
    expect(translateWebSource("zh-CN", source)).toBe(expected);
    expect(translateWebSource("en", source)).toBe(source);
  });
  it.each([
    [
      "Could not start Codex CLI (`codex`). Check Settings → Providers → Codex → Binary path on the server. Installing ChatGPT or Codex desktop may not add codex to PATH.",
      "无法启动 Codex CLI（`codex`）。请检查服务器上的“设置 → 服务提供方 → Codex → 程序路径”。安装 ChatGPT 或 Codex 桌面应用可能不会将 codex 加入 PATH。",
    ],
    [
      "Claude Agent CLI (`claude`) was not found on PATH.",
      "在 PATH 中找不到 Claude Agent CLI（`claude`）。",
    ],
    ["Failed to execute Claude Agent CLI health check.", "无法执行 Claude Agent CLI 健康检查。"],
    [
      "Claude Agent CLI is installed but failed to run. Timed out while running command.",
      "Claude Agent CLI 已安装，但运行失败。执行命令超时。",
    ],
    ["Claude Agent CLI is installed but failed to run.", "Claude Agent CLI 已安装，但运行失败。"],
    [
      "Claude provider status has not been checked in this session yet.",
      "本次会话尚未检查 Claude 提供商状态。",
    ],
    [
      "Codex provider status has not been checked in this session yet.",
      "本次会话尚未检查 Codex 提供商状态。",
    ],
    [
      "Codex CLI is not authenticated. Run `codex login` and try again.",
      "Codex CLI 尚未登录。请运行 `codex login` 后重试。",
    ],
    [
      "Timed out while checking Codex app-server provider status.",
      "检查 Codex app-server 提供商状态超时。",
    ],
    ["Codex did not return its model catalog in time.", "Codex 未及时返回模型目录。"],
  ])("presents exact provider diagnostic %s", (message, expected) => {
    expect(
      getProviderSummary({ ...provider, message }, (key, values) =>
        translateWebMessage("zh-CN", key, values),
      ).detail,
    ).toBe(expected);
    expect(getProviderSummary({ ...provider, message }).detail).toBe(message);
  });
  it.each([
    "Custom CLI failed: /private/project",
    "Claude Agent CLI (`my-cli`) was not found on PATH.",
    "constructor",
    "__proto__",
  ])("retains unknown diagnostic %s", (message) => {
    expect(
      getProviderSummary({ ...provider, message }, (key, values) =>
        translateWebMessage("zh-CN", key, values),
      ).detail,
    ).toBe(message);
  });
});

describe("actual settings presentation helpers", () => {
  it.each([
    ["comfortable", "舒适", "Comfortable"],
    ["wide", "宽", "Wide"],
    ["full", "全宽", "Full"],
  ] as const)("formats width %s", (width, chinese, english) => {
    expect(chatWidthLabel("zh-CN", width)).toBe(chinese);
    expect(chatWidthLabel("en", width)).toBe(english);
  });
  it.each([0, 1, 2])("formats cleanup failure count %s", (failed) => {
    const report = {
      counts: { removed: 0, kept: 0, failed },
      finishedAt: "2026-11-12T00:00:00Z",
      bytesFreed: 0,
    };
    const now = Date.parse("2026-11-12T00:02:00Z");
    const zh = cleanupRunPresentation("zh-CN", report, now);
    expect(zh.counts).toBe(`已删除 0 项，保留 0 项${failed > 0 ? `，失败 ${failed} 项` : ""}`);
    expect(zh.description).toContain("2 分钟前");
    const en = cleanupRunPresentation("en", report, now);
    expect(en.counts).toBe(`0 removed, 0 kept${failed > 0 ? `, ${failed} failed` : ""}`);
    expect(en.description).toContain("Last run 2m ago.");
  });
  it("keeps environment names and localizes only the multi-machine suffix", () => {
    expect(
      cleanupLastRunSummary([{ label: "/opaque/机器", counts: "已删除 0 项" }], 1, "zh-CN"),
    ).toBe("已删除 0 项");
    expect(
      cleanupLastRunSummary(
        [
          { label: "one", counts: "已删除 0 项" },
          { label: "two", counts: "已删除 0 项" },
        ],
        2,
        "zh-CN",
      ),
    ).toBe("每台机器：已删除 0 项");
    expect(
      cleanupLastRunSummary(
        [
          { label: "/opaque/机器", counts: "a" },
          { label: "two", counts: "b" },
        ],
        2,
        "zh-CN",
      ),
    ).toBe("/opaque/机器: a · two: b");
  });
});

describe("thread and Git display boundaries", () => {
  it.each(["New thread", "Chat", "原始 {title} /path"])(
    "never translates stored thread title %s",
    (title) => {
      expect(threadHeaderTitle(title, true, "zh-CN")).toBe(title);
      expect(threadHeaderTitle(title, true, "en")).toBe(title);
    },
  );
  it("localizes only the draft placeholder and preserves the English roundtrip", () => {
    expect(threadHeaderTitle("New thread", false, "zh-CN")).toBe("新建任务");
    expect(threadHeaderTitle("New thread", false, "en")).toBe("New thread");
  });
  it("localizes the no-ref label and leaves repository ref content intact", () => {
    expect(changesBaseLabel(null, "zh-CN")).toBe("未提交");
    expect(changesBaseLabel(null, "en")).toBe("Uncommitted");
    expect(changesBaseLabel("refs/opaque/{main}", "zh-CN")).toBe("对比 refs/opaque/{main}");
    expect(changesBaseLabel("refs/opaque/{main}", "en")).toBe("vs refs/opaque/{main}");
  });
  it("preserves opaque environment labels in the provider reconnect instruction", () => {
    expect(
      translateWebMessage("zh-CN", "settings.followup.reconnectEnvironment", {
        environment: "Name {value} /path",
      }),
    ).toBe("重新连接 Name {value} /path 以设置其服务提供方。");
  });
});

describe("actual snapshot summary path", () => {
  const state: DesktopSnapShotState = {
    mode: "unavailable",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutMessage: null,
    message: "SnapShots require a Wayland session. X11 capture is not supported.",
  };
  it("localizes description and finite unavailable message but preserves arbitrary bridge errors", () => {
    expect(translateWebSource("zh-CN", snapShotDescription(state))).toBe(
      "截取窗口并附加到当前草稿。",
    );
    expect(translateWebSource("zh-CN", snapShotStatus(state, false))).toBe(
      "快照需要 Wayland 会话。不支持在 X11 下截取。",
    );
    const arbitrary = "Error in /private/path {opaque}: 123";
    expect(
      translateWebSource("zh-CN", snapShotStatus({ ...state, message: arbitrary }, false)),
    ).toBe(arbitrary);
  });
  it.each(["gnome-extension", "kde", "hyprland", "niri", "picker"] as const)(
    "localizes setup state on %s",
    (linuxBackend) => {
      const source = snapShotSetupSummary(
        { ...state, mode: "portal", linuxBackend, message: null },
        true,
      );
      expect(translateWebSource("zh-CN", source)).not.toBe(source);
      expect(translateWebSource("en", source)).toBe(source);
    },
  );
  it.each([
    "Navigation",
    "Threads",
    "Composer",
    "Terminal",
    "Preview & diff",
    "Appearance",
    "Project scripts",
    "Other",
  ])("localizes the finite shortcut category %s", (source) => {
    expect(translateWebSource("zh-CN", source)).not.toBe(source);
    expect(translateWebSource("en", source)).toBe(source);
  });
});

describe("actual cleanup pending-state presenter", () => {
  it.each([
    [{ failed: false, loading: true }, "正在加载上次运行结果…", "Loading last run…"],
    [{ failed: true, loading: false }, "无法加载上次运行结果。", "Could not load the last run."],
    [{ failed: true, loading: true }, "无法加载上次运行结果。", "Could not load the last run."],
    [{ failed: false, loading: false }, "尚未运行清理。", "Cleanup hasn't run yet."],
    [undefined, "尚未运行清理。", "Cleanup hasn't run yet."],
  ] as const)("presents state %j", (query, chinese, english) => {
    expect(cleanupPendingDescription("zh-CN", query)).toBe(chinese);
    expect(cleanupPendingDescription("en", query)).toBe(english);
    expect(cleanupPendingDescription("zh-CN", query)).toBe(chinese);
  });
});

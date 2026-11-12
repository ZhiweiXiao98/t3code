import {
  sourceControlUnknownAuthSummary,
  translateSourceControlInstallHint,
} from "./sourceControlInstallMessages";
import { STATIC_KEYBINDING_COMMANDS } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { translateWebSource, translateWebMessage } from "./messages";
import { searchableSetting } from "../components/settings/settingsSearch";
import {
  commandLabel,
  localizedCommandLabel,
} from "../components/settings/KeybindingsSettings.logic";
import { getDesktopUpdateDisabledReason } from "../components/desktopUpdate.logic";

describe("verified 0.1.9 settings copy", () => {
  it.each([
    [
      "Install the Origin CLI with `curl -fsSL https://downloads.cursor.com/origin/install.sh | sh`, then run `origin auth login`.",
      "使用 `curl -fsSL https://downloads.cursor.com/origin/install.sh | sh` 安装 Origin CLI，然后运行 `origin auth login`。",
    ],
    [
      "Install the GitCafe CLI with `bun install -g @gitcafe/cli`, then run `cafe auth login --host https://git.cafe/api`, save a token in Settings, or set CAFE_TOKEN on the server.",
      "使用 `bun install -g @gitcafe/cli` 安装 GitCafe CLI，然后运行 `cafe auth login --host https://git.cafe/api`，在设置中保存令牌，或在服务器上设置 CAFE_TOKEN。",
    ],
    [
      "Install `fj` 0.6 or later from https://codeberg.org/forgejo-contrib/forgejo-cli and run `fj --host <server-url> auth add-token`, or install `tea` 0.16 or later from https://gitea.com/gitea/tea and run `tea login add` for each Forgejo or Gitea server.",
      "从 https://codeberg.org/forgejo-contrib/forgejo-cli 安装 `fj` 0.6 或更高版本并运行 `fj --host <server-url> auth add-token`；或从 https://gitea.com/gitea/tea 安装 `tea` 0.16 或更高版本，并为每个 Forgejo 或 Gitea 服务器运行 `tea login add`。",
    ],
    [
      "Add a Bitbucket token in Settings → Source Control.",
      "在“设置 → 源代码管理”中添加 Bitbucket 令牌。",
    ],
  ])("translates exact install hint %s", (source, expected) => {
    expect(translateWebSource("zh-CN", source)).toBe(expected);
    expect(
      translateSourceControlInstallHint(source, (key, values) =>
        translateWebMessage("zh-CN", key, values),
      ),
    ).toBe(expected);
    expect(
      translateSourceControlInstallHint(source, (key, values) =>
        translateWebMessage("en", key, values),
      ),
    ).toBe(source);
    expect(translateWebSource("en", source)).toBe(source);
  });
  it.each([
    "constructor",
    "__proto__",
    "Custom host: /home/user/project",
    "Install the Origin CLI with changed commands",
  ])("preserves arbitrary host hint %s", (source) => {
    expect(
      translateSourceControlInstallHint(source, (key, values) =>
        translateWebMessage("zh-CN", key, values),
      ),
    ).toBe(source);
  });
  it.each(STATIC_KEYBINDING_COMMANDS)("localizes every finite command: %s", (command) => {
    const en = localizedCommandLabel(command, (key, values) =>
      translateWebMessage("en", key, values),
    );
    const zh = localizedCommandLabel(command, (key, values) =>
      translateWebMessage("zh-CN", key, values),
    );
    expect(zh).not.toBe(en);
    // These two existing English catalog labels differ from the raw command fallback.
    const existingEnglishLabel =
      command === "preview.focusUrl"
        ? "Preview: Focus Url"
        : command === "thread.settle"
          ? "Thread: Settle or restore"
          : commandLabel(command);
    expect(en).toBe(existingEnglishLabel);
  });
  it.each([
    [
      "System alerts when a thread finishes, fails, or needs input or approval. Applies to this device while T3 Code is open.",
      "会话完成、失败或需要输入或批准时发出系统提醒。仅在本设备打开 T3 Code 时生效。",
    ],
    ["Your default browser", "系统默认浏览器"],
    ["Repositories", "仓库"],
    [
      "Pull requests start with this method. Last selected reuses whatever you chose most recently on this device.",
      "拉取请求默认使用此合并方式。“上次选择”会沿用你在本设备最近选择的方式。",
    ],
    [
      "Folder where new worktrees are created, on any drive, such as D:\\worktrees or ~/worktrees. Existing worktrees stay where they are. Leave empty to use the T3 home folder.",
      "新工作树的创建文件夹，可位于任意驱动器，例如 D:\\worktrees 或 ~/worktrees。现有工作树保持原位。留空则使用 T3 主文件夹。",
    ],
    ["Static prefix", "固定前缀"],
    ["Semantic prefix", "语义前缀"],
    ["Custom instructions", "自定义指令"],
    ["Suggest next prompt", "建议下一条提示词"],
    [
      "Show a predicted next message in the empty composer after a Claude or Codex turn. Tab uses it. Each is an extra cached request on your plan. Needs Codex 0.165+. Claude threads update on restart.",
      "在 Claude 或 Codex 完成一轮后，在空输入框中显示预测的下一条消息。按 Tab 使用。每次建议都会额外消耗套餐中的一次缓存请求。需要 Codex 0.165 或更高版本。Claude 会话需重启后生效。",
    ],
    ["Welcome page", "欢迎页"],
    ["Notifications only", "仅通知"],
    ["Sound only", "仅声音"],
    ["Notifications with sound", "通知和声音"],
    [
      "Notifications need a supported browser over HTTPS, or the desktop app. Sound only is still available.",
      "通知需要支持此功能的 HTTPS 浏览器或桌面应用。仍可使用仅声音模式。",
    ],
    [
      "Notifications are unavailable in this browser. Sound only is still available.",
      "此浏览器不支持通知。仍可使用仅声音模式。",
    ],
    [
      "Allow notifications in your browser or system settings, then choose this option again. Sound only is still available.",
      "请在浏览器或系统设置中允许通知，然后重新选择此选项。仍可使用仅声音模式。",
    ],
    ["iPhone and iPad", "iPhone 和 iPad"],
  ])("translates %s and restores English", (source, chinese) => {
    expect(translateWebSource("zh-CN", source)).toBe(chinese);
    expect(translateWebSource("en", source)).toBe(source);
    expect(translateWebSource("zh-CN", source)).toBe(chinese);
  });
  it.each([
    ["color-scheme", "配色方案"],
    ["theme", "主题"],
    ["prompt-suggestions-beta", "建议下一条提示词"],
    ["welcome-page", "欢迎页"],
  ] as const)("localizes search title %s", (id, expected) => {
    expect(searchableSetting(id, "zh-CN").title).toBe(expected);
    expect(searchableSetting(id, "en").title).not.toBe(expected);
  });
  it.each([
    ["rightPanel.close", "右侧面板：关闭"],
    ["rightPanel.new", "右侧面板：新建"],
    ["chat.find", "聊天：查找"],
    ["thread.pin", "会话：置顶"],
    ["thread.undo", "会话：撤销"],
    ["thread.editQueuedMessage", "队列：编辑最后一条待发送消息"],
    ["thread.steerQueuedMessage", "队列：发送第一条待发送消息"],
  ] as const)("localizes command %s", (command, expected) => {
    expect(
      localizedCommandLabel(command, (key, values) => translateWebMessage("zh-CN", key, values)),
    ).toBe(expected);
    expect(
      localizedCommandLabel(command, (key, values) => translateWebMessage("en", key, values)),
    ).not.toBe(expected);
  });
  it("translates only the known app-owned missing-feed reason", () => {
    const message = "Automatic updates are not available because no update feed is configured.";
    const state = { enabled: false, status: "disabled", message } as const;
    expect(
      getDesktopUpdateDisabledReason(state, (key, values) =>
        translateWebMessage("zh-CN", key, values),
      ),
    ).toBe("未配置更新源，因此无法自动更新。");
    expect(getDesktopUpdateDisabledReason(state)).toBe(message);
    expect(
      getDesktopUpdateDisabledReason({ ...state, message: "Host says /private/custom-feed" }),
    ).toBe("Host says /private/custom-feed");
  });
});

describe("actual unknown-auth summary presentation", () => {
  it.each([
    ["An access token is configured.", "已配置访问令牌。"],
    ["An API token is configured.", "已配置 API 令牌。"],
  ])("localizes the exact Bitbucket detail %s", (detail, expected) => {
    for (const locale of ["zh-CN", "en", "zh-CN"] as const) {
      const t = (
        key: Parameters<typeof translateWebMessage>[1],
        values?: Parameters<typeof translateWebMessage>[2],
      ) => translateWebMessage(locale, key, values);
      expect(sourceControlUnknownAuthSummary("Bitbucket", detail, "fallback hint", t)).toBe(
        t("sourceControl.summary.verifyFailed", {
          provider: "Bitbucket",
          hint: locale === "zh-CN" ? expected : detail,
        }),
      );
    }
  });
  it.each([
    "Host says /home/user/repo",
    "An access token is configured. Extra host detail",
    "constructor",
    "__proto__",
    "user@example.test",
  ])("preserves unknown server detail %s", (detail) => {
    const t = (
      key: Parameters<typeof translateWebMessage>[1],
      values?: Parameters<typeof translateWebMessage>[2],
    ) => translateWebMessage("zh-CN", key, values);
    expect(sourceControlUnknownAuthSummary("User host", detail, "fallback hint", t)).toBe(
      t("sourceControl.summary.verifyFailed", { provider: "User host", hint: detail }),
    );
    expect(sourceControlUnknownAuthSummary("User host", null, "fallback hint", t)).toBe(
      t("sourceControl.summary.verifyFailed", { provider: "User host", hint: "fallback hint" }),
    );
  });
});

import { describe, expect, it } from "vite-plus/test";

import {
  formatMobileMessage,
  localizeMobileSubagentStatus,
  mobileListPosition,
  mobileRunsOn,
} from "./mobileDisplayStrings";

describe("mobile UI display strings", () => {
  it("formats native accessibility messages without translating or re-interpolating their values", () => {
    const name = "Settings {1} $& /feature/main";
    expect(formatMobileMessage("Open {0}", [name], "zh-CN")).toBe(`打开 ${name}`);
    expect(formatMobileMessage("Open {0}", [name], "en")).toBe(`Open ${name}`);
    expect(formatMobileMessage("Line {0}: {1}", [3, "Open"], "zh-CN")).toBe("第 3 行：Open");
    expect(formatMobileMessage("Line {0}: {1}", [3, "Open"], "en")).toBe("Line 3: Open");
    expect(formatMobileMessage("View commit {0}, {1}", [name, "Draft {0} $&"], "zh-CN")).toBe(
      `查看提交 ${name}，Draft {0} $&`,
    );
    expect(formatMobileMessage("{0} pending line {1}", [1, "comment"], "en")).toBe(
      "1 pending line comment",
    );
    expect(formatMobileMessage("{0} pending line {1}", [2, "comments"], "en")).toBe(
      "2 pending line comments",
    );
    expect(formatMobileMessage("{0} pending line {1}", [2, "comments"], "zh-CN")).toBe(
      "2 条待提交的行内评论",
    );
    expect(formatMobileMessage("The file was not found at {0}.", [name], "zh-CN")).toBe(
      `在 ${name} 未找到文件。`,
    );
    expect(formatMobileMessage("Send microphone audio to {0}?", [name], "zh-CN")).toBe(
      `将麦克风音频发送到 ${name}？`,
    );
    const nativeMessages = [
      ["Show model: {0}, {1}", `显示模型：${name}，Open`],
      ["Add to favorites: {0}, {1}", `添加到收藏：${name}，Open`],
      ["{0} folder", `${name} 文件夹`],
      ["Manage {0}", `管理 ${name}`],
      ["Remove {0} from this device", `从本设备移除 ${name}`],
      ["{0} workflow, {1}", `${name} 工作流，Open`],
      ["Conflicts with {0}", `与 ${name} 冲突`],
      ["Open resolved discussion in {0}", `打开 ${name} 中已解决的讨论`],
      ["Approved by {0}", `由 ${name} 批准`],
      ["by {0}", `作者：${name}`],
    ] as const;
    for (const [template, expected] of nativeMessages) {
      expect(formatMobileMessage(template, [name, "Open"], "zh-CN")).toBe(expected);
      expect(formatMobileMessage(template, [name, "Open"], "en")).toBe(
        template.replace(/\{(\d+)\}/g, (_, index: string) => [name, "Open"][Number(index)]!),
      );
    }
    expect(formatMobileMessage("Open {0}", [], "zh-CN")).toBe("打开 {0}");
    expect(formatMobileMessage("Open {0}", [undefined], "en")).toBe("Open undefined");
  });
  it("localizes only known generated subagent statuses", () => {
    expect(localizeMobileSubagentStatus("Completed in 1m 2s", "zh-CN")).toBe(
      "已完成，用时1 分钟 2 秒",
    );
    expect(localizeMobileSubagentStatus("Completed in 1m 2s", "en")).toBe("Completed in 1m 2s");
    expect(localizeMobileSubagentStatus("Open", "zh-CN")).toBe("Open");
  });
  it("keeps environment names untouched and preserves the English position format", () => {
    expect(mobileRunsOn("Settings {environment} $&", "zh-CN")).toBe(
      "运行于 Settings {environment} $&",
    );
    expect(mobileRunsOn("Settings", "en")).toBe("Runs on Settings");
    expect(mobileListPosition(2, 4, "zh-CN")).toBe("第 2 项，共 4 项");
    expect(mobileListPosition(2, 4, "en")).toBe("2 of 4");
  });
});

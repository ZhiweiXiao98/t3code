import { describe, expect, it } from "vite-plus/test";

import {
  formatMobileMessage,
  mobilePullRequestListFailure,
  mobilePullRequestListFailures,
  mobileEnvironmentQueryFailure,
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
      ["Request review from {0} team", `请求 ${name} 团队审核`],
      ["Hide connection details for {0}", `隐藏 ${name} 的连接详情`],
      ["{0} reference in {1}", `Open 中的 ${name} 引用`],
      ["{0}, tool call failed", `${name}，工具调用失败`],
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

it("formats sign-in and even-pace copy without translating embedded values", () => {
  const code = "Settings {0} $&";
  expect(formatMobileMessage("Enter code {0} on the sign-in page.", [code], "zh-CN")).toBe(
    `在登录页面输入验证码 ${code}。`,
  );
  expect(formatMobileMessage("Enter code {0} on the sign-in page.", [code], "en")).toBe(
    `Enter code ${code} on the sign-in page.`,
  );
  expect(formatMobileMessage("Even pace: {0}% left by now", [42], "zh-CN")).toBe(
    "均匀使用进度：此时应剩余 42%",
  );
  expect(formatMobileMessage("Even pace: {0}% left by now", [42], "en")).toBe(
    "Even pace: 42% left by now",
  );
});

it("localizes only the generated PR list error fallback", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    expect(mobilePullRequestListFailure(null, locale)).toBe(
      locale === "en" ? "Couldn't load pull requests." : "无法加载拉取请求。",
    );
    for (const message of [
      "Settings",
      "Open",
      "Couldn't load pull requests.",
      "NativeError: Settings/{0}/$&",
    ]) {
      expect(mobilePullRequestListFailure(new Error(message), locale)).toBe(message);
    }
  }
});

it("keeps joined pagination failures literal and translates only generated missing-error fallbacks", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    expect(mobilePullRequestListFailures([], locale)).toBeNull();
    expect(
      mobilePullRequestListFailures(
        [
          { status: "fulfilled", value: null },
          { status: "rejected", reason: new Error("Settings") },
          { status: "rejected", reason: new Error("Open") },
          { status: "rejected", reason: null },
        ],
        locale,
      ),
    ).toBe(
      `Settings\nOpen\n${locale === "en" ? "Couldn't load pull requests." : "无法加载拉取请求。"}`,
    );
    for (const error of [null, undefined, new Error("  ")]) {
      expect(mobileEnvironmentQueryFailure(error, locale)).toBe(
        locale === "en" ? "The environment request failed." : "环境请求失败。",
      );
    }
    for (const text of [
      "Settings",
      "Open",
      "The environment request failed.",
      " native error/{0}/$& ",
    ]) {
      expect(mobileEnvironmentQueryFailure(new Error(text), locale)).toBe(text);
    }
  }
});

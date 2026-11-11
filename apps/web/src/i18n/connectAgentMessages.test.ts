import { describe, expect, it } from "vite-plus/test";

import { MCP_APPS, OTHER_MCP_APP_STEPS, mcpHandoffAction } from "../components/mcp/mcpApps";
import { translateConnectAgentSource as tx } from "./connectAgentMessages";

describe("connection and generator localization", () => {
  it("translates every app's setup instructions without translating commands or handoff payloads", () => {
    const url = "https://example.test:8443/mcp?opaque=%7Bname%7D";
    for (const app of MCP_APPS) {
      for (const source of [...app.steps, ...(app.note ? [app.note] : [])]) {
        expect(tx("zh-CN", source)).not.toBe(source);
        expect(tx("en", source)).toBe(source);
      }
      const action = mcpHandoffAction(app, url);
      if (action?.copy) expect(tx("zh-CN", action.copy.text)).toBe(action.copy.text);
      if (app.handoff.kind === "commands") {
        for (const command of app.handoff.commands(url)) expect(tx("zh-CN", command)).toBe(command);
      }
    }
    for (const source of OTHER_MCP_APP_STEPS) expect(tx("zh-CN", source)).not.toBe(source);
  });

  it.each([
    [
      "Could not reach that environment through T3 Connect with this account.",
      "无法使用此账号通过 T3 Connect 连接该环境。",
    ],
    ["This sign-in link is incomplete", "此登录链接不完整"],
    ["Open this page in its own window", "请在独立窗口中打开此页面"],
    [
      "For your safety, agent sign-ins cannot be approved inside another site.",
      "为保障你的安全，无法在其他网站内批准 Agent 登录。",
    ],
    ["Connecting to T3 Connect", "正在连接 T3 Connect"],
    ["One moment while your account loads.", "正在加载你的账号，请稍候。"],
    ["Sign in to approve", "登录后批准"],
    [
      "Sign in to T3 Connect with the account this environment is linked to.",
      "请使用此环境所关联的账号登录 T3 Connect。",
    ],
    ["Use a sign-in code instead", "改用登录验证码"],
    ["Use another account", "使用其他账号"],
    [
      "The environment returned an address this page will not open.",
      "环境返回的地址不安全，此页面不会打开该地址。",
    ],
    ["Choose what it may do", "请选择允许执行的操作"],
    ["whoever runs it gets this access", "运行它的人将获得此访问权限"],
    ["Open {app} on the web", "在网页中打开 {app}"],
    [
      "When {app} opens the sign-in page, choose what it may do and approve with your T3 Connect account.",
      "当 {app} 打开登录页面时，请选择允许执行的操作，并使用你的 T3 Connect 账号批准。",
    ],

    ["Only approve a sign-in you just started.", "请仅批准你刚刚发起的登录。"],
    ["name set by the app", "名称由应用设置"],
    ["Access goes to", "访问权限授予目标"],
    ["Paste a code", "粘贴验证码"],
    ["Runs commands and edits files without asking", "无需询问即可运行命令和编辑文件"],
    ["Read only", "只读"],
    ["Auto", "自动"],
    ["Check again", "重新检查"],
    ["The code expired.", "验证码已过期。"],
    ["Back to commands", "返回命令设置"],
    ["Back to one click", "返回一键设置"],
    ["Cancel", "取消"],
    ["API key (optional)", "API 密钥（可选）"],
    ["No models match.", "没有匹配的模型。"],
    ["The model list couldn't load.", "无法加载模型列表。"],
  ])("translates %s and restores its original English", (source, chinese) => {
    expect(tx("zh-CN", source)).toBe(chinese);
    expect(tx("en", source)).toBe(source);
  });

  it.each(["http://example.test:8080", "https://example.test:8443", "http://[::1]:3000"])(
    "keeps the complete backend origin %s in both confirmation languages",
    (origin) => {
      expect(tx("zh-CN", "Add the backend at {origin}?", { origin })).toBe(
        `添加位于 ${origin} 的后端？`,
      );
      expect(tx("en", "Add the backend at {origin}?", { origin })).toBe(
        `Add the backend at ${origin}?`,
      );
    },
  );

  it("substitutes opaque values once, preserving placeholders inside names and diagnostic detail", () => {
    const name = "My server {name} <App> $& /tmp/a";
    expect(tx("zh-CN", "Could not get a code from {name}. Try again.", { name })).toBe(
      `无法从 ${name} 获取验证码。请重试。`,
    );
    expect(tx("en", "Could not get a code from {name}. Try again.", { name })).toBe(
      `Could not get a code from ${name}. Try again.`,
    );
    const fix = "t3 connect link --url=https://example.test/{name}";
    expect(tx("zh-CN", "Fix: {fix}", { fix, name: "not substituted" })).toBe(`修复方法：${fix}`);
    expect(tx("zh-CN", "Expires {time} · one use", { time: "4:09" })).toBe(
      "4:09 后过期 · 仅限使用一次",
    );
    expect(tx("en", "Expires {time} · one use", { time: "4:09" })).toBe("Expires 4:09 · one use");
    expect(tx("zh-CN", "{model} answered. It works.", { model: "gpt-5.3-codex/{name}" })).toBe(
      "gpt-5.3-codex/{name} 已响应，可以正常使用。",
    );
    expect(
      tx(
        "zh-CN",
        "This deletes the API key stored on {name}. Anything set to use this generator falls back to the text generation model.",
        { name },
      ),
    ).toBe(`这将删除存储在 ${name} 上的 API 密钥。使用此生成器的功能将回退到文本生成模型。`);
  });

  it("keeps the installation and pairing commands in translated instructions", () => {
    const command = "t3 auth pairing create";
    const source =
      "Get one from Use T3 Code in another app (MCP), Settings → Sharing & access, or {command} on this machine.";
    expect(tx("zh-CN", source, { command })).toBe(
      `可从“在其他应用中使用 T3 Code（MCP）”、“设置 → 共享与访问”获取，或在此设备上运行 ${command}。`,
    );
    expect(tx("en", source, { command })).toBe(source.replace("{command}", command));
    expect(
      tx(
        "zh-CN",
        "If {command} is not found after installing, add the folder the installer names to your PATH.",
        { command: "t3" },
      ),
    ).toBe("如果安装后找不到 t3，请将安装程序提示的文件夹添加到 PATH。");
  });

  it("retains singular, plural and zero model counts in both languages", () => {
    for (const count of [0, 1, 2]) {
      const source =
        count === 1
          ? "{count} model available. Pick one in a text generation model picker."
          : "{count} models available. Pick one in a text generation model picker.";
      expect(tx("zh-CN", source, { count })).toBe(
        `有 ${count} 个可用模型。请在文本生成模型选择器中选择一个。`,
      );
      expect(tx("en", source, { count })).toBe(source.replace("{count}", String(count)));
    }
  });

  it("preserves unknown diagnostic, credential, identifier and prototype-looking values", () => {
    for (const source of [
      "auto-q8rz3nwd5ktc",
      "https://example.test/{origin}",
      "model-name/v2",
      "E_ACCESS: raw detail",
      "constructor",
      "__proto__",
      "toString",
      "",
    ]) {
      expect(tx("zh-CN", source)).toBe(source);
      expect(tx("en", source)).toBe(source);
    }
    expect(tx("zh-CN", "What can {app} do?", Object.create({ app: "inherited" }))).toBe(
      "允许 {app} 做什么？",
    );
  });
});

import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ManagedPolicySummary,
  type ServerSettings,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { planClaudeAccountSave } from "./claude-accounts";

const claude = ProviderDriverKind.make("claudeAgent");
const work = ProviderInstanceId.make("claudeAgent_work");

describe("planClaudeAccountSave", () => {
  it("adds a signed-in config folder as a new Claude instance with a free id", () => {
    const providerInstances: ServerSettings["providerInstances"] = {
      [work]: { driver: claude, config: { homePath: "~/.claude-work" } },
    };
    const plan = (name: string, configDir: string) =>
      planClaudeAccountSave({
        providerInstances,
        policy: undefined,
        instanceId: null,
        draft: { name, configDir },
      });

    expect(plan(" Work ", " ~/.claude-willy ")).toEqual({
      mutation: {
        operation: "create",
        instanceId: "claudeAgent_work_2",
        instance: {
          driver: "claudeAgent",
          enabled: true,
          displayName: "Work",
          config: { homePath: "~/.claude-willy" },
        },
      },
    });
    expect(plan("", "~/.claude-willy")).toHaveProperty("error");
    expect(plan("Willy", " ")).toHaveProperty("error");
    for (const locale of ["en", "zh-CN"] as const) {
      const input = {
        providerInstances,
        policy: undefined,
        instanceId: null,
        draft: { name: "Settings/{0}/$&", configDir: "~/Open/{1}" },
      };
      const original = JSON.stringify(input);
      expect(planClaudeAccountSave(input, locale)).toEqual(planClaudeAccountSave(input, "en"));
      expect(JSON.stringify(input)).toBe(original);
      expect(
        planClaudeAccountSave({ ...input, draft: { ...input.draft, name: "" } }, locale),
      ).toEqual({
        error: locale === "en" ? "Enter a name for this account." : "请输入此账户的名称。",
      });
      expect(
        planClaudeAccountSave({ ...input, draft: { ...input.draft, configDir: "" } }, locale),
      ).toEqual({
        error:
          locale === "en"
            ? "Enter the Claude config folder this account is signed in with."
            : "请输入此账户已登录的 Claude 配置文件夹。",
      });
    }
  });

  it("edits the name and folder without dropping the instance's other settings", () => {
    const providerInstances: ServerSettings["providerInstances"] = {
      [work]: {
        driver: claude,
        displayName: "Work",
        accentColor: "#ff0000",
        enabled: false,
        environment: [{ name: "TOKEN", value: "", sensitive: true, valueRedacted: true }],
        config: { homePath: "~/.claude-work", binaryPath: "/opt/claude", launchArgs: "--chrome" },
      },
    };
    const edit = (name: string, configDir: string) =>
      planClaudeAccountSave({
        providerInstances,
        policy: undefined,
        instanceId: work,
        draft: { name, configDir },
      });

    expect(edit("Willy", "~/.claude-willy")).toEqual({
      mutation: {
        operation: "upsert",
        instanceId: work,
        instance: {
          ...providerInstances[work],
          displayName: "Willy",
          config: {
            binaryPath: "/opt/claude",
            launchArgs: "--chrome",
            homePath: "~/.claude-willy",
          },
        },
      },
    });
    // Clearing both falls back to the driver's label and the default ~/.claude folder.
    expect(edit("", "")).toEqual({
      mutation: {
        operation: "upsert",
        instanceId: work,
        instance: {
          driver: claude,
          accentColor: "#ff0000",
          enabled: false,
          environment: providerInstances[work]!.environment,
          config: { binaryPath: "/opt/claude", launchArgs: "--chrome" },
        },
      },
    });
    expect(
      planClaudeAccountSave({
        providerInstances: { [work]: { driver: claude, config: { homePath: "~/.claude-work" } } },
        policy: undefined,
        instanceId: work,
        draft: { name: "", configDir: "" },
      }),
    ).toEqual({
      mutation: { operation: "upsert", instanceId: work, instance: { driver: claude } },
    });
  });

  it("refuses instances the managed policy pins", () => {
    const policy: ManagedPolicySummary = {
      organization: "Example Corp",
      lockedSettings: ["providerInstances.claudeAgent_work.config.homePath"],
    };
    expect(
      planClaudeAccountSave({
        providerInstances: { [work]: { driver: claude } },
        policy,
        instanceId: work,
        draft: { name: "Work", configDir: "~/.claude-other" },
      }),
    ).toEqual({ error: "Managed by Example Corp." });
    for (const locale of ["en", "zh-CN"] as const) {
      expect(
        planClaudeAccountSave(
          {
            providerInstances: { [work]: { driver: claude } },
            policy: { ...policy, organization: "Settings/{organization}/$&" },
            instanceId: work,
            draft: { name: "Open", configDir: "~/Settings" },
          },
          locale,
        ),
      ).toEqual({
        error:
          locale === "en"
            ? "Managed by Settings/{organization}/$&."
            : "由 Settings/{organization}/$& 管理。",
      });
    }
  });
});

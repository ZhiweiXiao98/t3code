import { localizeMobileString } from "./mobileStrings";
import { describe, expect, it } from "vite-plus/test";
import type { ManagedPolicySummary } from "@t3tools/contracts";

import {
  disallowedProviderMessage,
  managedByMessage,
  managedCapabilityDenial,
  managedHelpMessage,
  managedRuntimeModeDenial,
  managedSettingsMessage,
  managedSettingDescription,
  managedUpdatesDenial,
  switchRuntimeModeMessage,
} from "./managedPolicyMessages";

const policy: ManagedPolicySummary = {
  organization: "Settings's {mode} $&",
  lockedSettings: [],
  limits: {
    maxRuntimeMode: "auto-accept-edits",
    webhookTasks: false,
    updates: { mode: "off" },
  },
};

describe("mobile managed policy messages", () => {
  it("preserves the contract's allowed and denied results in both locales", () => {
    for (const locale of ["en", "zh-CN"] as const) {
      expect(managedRuntimeModeDenial(undefined, "full-access", locale)).toBeUndefined();
      expect(managedRuntimeModeDenial(policy, "approval-required", locale)).toBeUndefined();
      expect(managedCapabilityDenial(policy, "connect", locale)).toBeUndefined();
      expect(managedUpdatesDenial(undefined, locale)).toBeUndefined();
    }
    expect(managedRuntimeModeDenial(policy, "full-access", "en")).toBe(
      "Settings's {mode} $& limits threads to Auto-accept edits.",
    );
    expect(managedRuntimeModeDenial(policy, "full-access", "zh-CN")).toBe(
      "Settings's {mode} $& 将任务的运行模式限制为自动接受编辑。",
    );
    expect(managedCapabilityDenial(policy, "webhookTasks", "zh-CN")).toBe(
      "Settings's {mode} $& 的策略不允许Webhook 任务。",
    );
    expect(managedUpdatesDenial(policy, "zh-CN")).toBe("Settings's {mode} $& 管理 T3 Code 更新。");
  });

  it("does not recursively translate or interpolate organization and provider names", () => {
    expect(managedByMessage("Open", "zh-CN")).toBe("由 Open 管理。");
    expect(managedByMessage("Open", "en")).toBe("Managed by Open.");
    expect(managedHelpMessage("Settings", "zh-CN")).toBe("向 Settings 寻求帮助");
    expect(managedSettingsMessage(["Open", "Settings"], "zh-CN")).toBe(
      "部分设置由 Open, Settings 管理，无法在此更改。",
    );
    expect(disallowedProviderMessage("Open", "{organization} $&", "zh-CN")).toBe(
      "Open 的策略不允许使用 {organization} $& 提供商。",
    );
    expect(disallowedProviderMessage(undefined, "Open", "en")).toBe(
      "Your organization policy does not allow the Open provider.",
    );
    expect(switchRuntimeModeMessage("Supervised", "zh-CN")).toBe("切换为监督模式");
    expect(switchRuntimeModeMessage("Supervised", "en")).toBe("Switch to Supervised");
  });
});

it("translates locked-setting explanations without reinterpreting organization reasons", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const description = "Allow agents to use the in-app preview browser.";
    const expected = localizeMobileString(description, locale);
    expect(managedSettingDescription(description, undefined, locale)).toBe(expected);
    for (const reason of [
      "Settings",
      "Open",
      "Managed by Settings/{0}/$&.",
      "由 Settings/{0}/$& 管理。",
    ])
      expect(managedSettingDescription(description, reason, locale)).toBe(`${expected} ${reason}`);
  }
});

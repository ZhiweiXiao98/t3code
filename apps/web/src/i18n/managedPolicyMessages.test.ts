import {
  managedCapabilityDenial as contractCapabilityDenial,
  managedRuntimeModeDenial as contractRuntimeModeDenial,
  managedUpdatesDenial as contractUpdatesDenial,
  managedNightlyDeniedMessage as contractNightlyDeniedMessage,
  type ManagedPolicySummary,
  type RuntimeMode,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  managedCapabilityDenial,
  managedNightlyDeniedMessage,
  managedRuntimeModeDenial,
  managedUpdatesDenial,
} from "./managedPolicyMessages";
import { translateWebMessage } from "./messages";
import type { WebTranslate } from "./WebI18nContext";

const t: WebTranslate = (key, values) => translateWebMessage("zh-CN", key, values);
const organization = "Settings & O'Reilly {team}";
const policy: ManagedPolicySummary = {
  organization,
  lockedSettings: [],
  limits: {
    clients: ["desktop"],
    connect: false,
    webhookTasks: false,
    browserCookieImport: false,
    maxRuntimeMode: "auto-accept-edits",
    updates: { mode: "off" },
  },
};

// Contract decisions are the authority; the UI only translates their fixed explanations.
describe("managed policy UI messages", () => {
  it("preserves capability denials and allowed results, including English defaults", () => {
    const capabilities = [
      "remoteClients",
      "connect",
      "webhookTasks",
      "browserCookieImport",
    ] as const;
    for (const capability of capabilities) {
      for (const summary of [undefined, { organization, lockedSettings: [] }, policy]) {
        const expected = contractCapabilityDenial(summary, capability);
        expect(managedCapabilityDenial(summary, capability)).toBe(expected);
        const translated = managedCapabilityDenial(summary, capability, t);
        expect(translated === undefined).toBe(expected === undefined);
        if (translated !== undefined) {
          expect(translated).toContain(organization);
          expect(translated).not.toBe(expected);
        }
      }
    }
  });

  it("retains the runtime-mode ceiling and administrator name without translating user data", () => {
    const modes: readonly RuntimeMode[] = [
      "approval-required",
      "auto-accept-edits",
      "auto",
      "full-access",
    ];
    for (const mode of modes) {
      const expected = contractRuntimeModeDenial(policy, mode);
      expect(managedRuntimeModeDenial(policy, mode)).toBe(expected);
      const translated = managedRuntimeModeDenial(policy, mode, t);
      expect(translated === undefined).toBe(expected === undefined);
      if (translated !== undefined) {
        expect(translated).toBe(`“${organization}”将任务权限限制为“自动接受编辑”。`);
      }
    }
    expect(managedRuntimeModeDenial(undefined, "full-access", t)).toBeUndefined();
  });

  it("keeps update and nightly restrictions while translating only their displayed reason", () => {
    expect(managedUpdatesDenial(policy)).toBe(contractUpdatesDenial(policy));
    expect(managedUpdatesDenial(policy, t)).toBe(`T3 Code 更新由“${organization}”管理。`);
    expect(managedUpdatesDenial(undefined, t)).toBeUndefined();
    expect(managedUpdatesDenial({ organization, lockedSettings: [] }, t)).toBeUndefined();
    expect(managedNightlyDeniedMessage(organization)).toBe(
      contractNightlyDeniedMessage(organization),
    );
    expect(managedNightlyDeniedMessage(organization, t)).toBe(
      `T3 Code 更新由“${organization}”管理。只能安装稳定版。`,
    );
  });
});

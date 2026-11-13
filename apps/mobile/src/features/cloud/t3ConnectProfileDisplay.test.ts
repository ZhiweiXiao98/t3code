import { describe, expect, it } from "vite-plus/test";

import {
  deregisterConfirmationMessage,
  deregisterFailureMessage,
  endpointLabel,
  linkedAtLabel,
} from "./t3ConnectProfileDisplay";

describe("T3 Connect profile display", () => {
  it("uses the selected app locale for dates and the invalid-date fallback", () => {
    const value = "2026-07-14T12:00:00";
    expect(linkedAtLabel(value, "en")).toBe("Linked Jul 14, 2026");
    expect(linkedAtLabel(value, "zh-CN")).toBe("关联于 2026年7月14日");
    expect(linkedAtLabel("invalid", "en")).toBe("Link date unavailable");
    expect(linkedAtLabel("invalid", "zh-CN")).toBe("关联日期不可用");
    expect(endpointLabel("cloudflare_tunnel", "zh-CN")).toBe("托管隧道");
    expect(endpointLabel("activity_only", "zh-CN")).toBe("仅发布活动");
    expect(endpointLabel("cloudflare_tunnel", "en")).toBe("Managed tunnel");
  });

  it("inserts environment labels without translating dictionary collisions or replacement tokens", () => {
    const label = "Settings $& {0} 🚀";
    expect(deregisterConfirmationMessage(label, "zh-CN")).toContain(`移除“${label}”`);
    expect(deregisterConfirmationMessage(label, "en")).toContain(`“${label}” will be removed`);
  });

  it("localizes only application failure copy, preserving external error and trace text", () => {
    expect(deregisterFailureMessage(new Error("Settings"), undefined, "zh-CN")).toBe("Settings");
    expect(deregisterFailureMessage(new Error(""), undefined, "zh-CN")).toBe("");
    expect(deregisterFailureMessage(null, undefined, "zh-CN")).toBe("无法取消注册服务器。");
    expect(deregisterFailureMessage(null, undefined, "en")).toBe(
      "Could not deregister the server.",
    );
    expect(deregisterFailureMessage(new Error("Settings"), "Settings $&", "zh-CN")).toBe(
      "Settings\n\n跟踪 ID： Settings $&",
    );
  });
});

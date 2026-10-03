import { describe, expect, it } from "vite-plus/test";
import { localizeProviderBadgeLabel } from "./providerDriverMeta";

describe("localizeProviderBadgeLabel", () => {
  const labels = { earlyAccess: "抢先体验", new: "新增" };

  it("localizes known badge labels", () => {
    expect(localizeProviderBadgeLabel("Early Access", labels)).toBe("抢先体验");
    expect(localizeProviderBadgeLabel("New", labels)).toBe("新增");
  });

  it("preserves provider-defined labels", () => {
    expect(localizeProviderBadgeLabel("Preview", labels)).toBe("Preview");
  });
});

import { describe, expect, it } from "vite-plus/test";

import {
  localizeMobileSubagentStatus,
  mobileListPosition,
  mobileRunsOn,
} from "./mobileDisplayStrings";

describe("mobile UI display strings", () => {
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

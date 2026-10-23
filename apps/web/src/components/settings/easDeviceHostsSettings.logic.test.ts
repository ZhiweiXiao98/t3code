import { describe, expect, it } from "vite-plus/test";
import * as Option from "effect/Option";

import { newEasDeviceHost, parseEasDeviceHostDraft } from "./easDeviceHostsSettings.logic";

describe("EAS device host settings", () => {
  it("rejects limits EAS does not allow", () => {
    expect(Option.isSome(parseEasDeviceHostDraft(newEasDeviceHost("eas")))).toBe(true);
    expect(
      Option.isNone(parseEasDeviceHostDraft({ ...newEasDeviceHost("eas"), maxSessionMinutes: 10 })),
    ).toBe(true);
    expect(
      Option.isNone(
        parseEasDeviceHostDraft({ ...newEasDeviceHost("eas"), maxSessionMinutes: 600 }),
      ),
    ).toBe(true);
    expect(Option.isNone(parseEasDeviceHostDraft({ ...newEasDeviceHost("eas"), label: " " }))).toBe(
      true,
    );
  });
});

it("localizes EAS limits while keeping the configured numbers", () => {
  const host = newEasDeviceHost("test");
  expect(easSessionLimits(host, "zh-CN")).toBe(
    "最多同时运行 2 个会话，每个会话在 30 分钟后或空闲 10 分钟后停止",
  );
});

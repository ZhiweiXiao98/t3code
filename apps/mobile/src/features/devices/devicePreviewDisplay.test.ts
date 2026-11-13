import {
  deviceToolUpdateOwnership,
  deviceToolUpdatePolicy,
  deviceToolVersionLabels,
} from "@t3tools/client-runtime/state/device";
import type { DeviceToolVersions } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { localizeMenuActions } from "../../i18n/localizeMenuActions";
import { deviceRetryLabel, deviceToolsMessage } from "./devicePreviewDisplay";

it("keeps host labels, version identifiers and remote diagnostics literal", () => {
  for (const raw of ["Settings", "Open", "{0} $&"]) {
    for (const outdated of [false, true]) {
      const tools: DeviceToolVersions = {
        hub: {
          installedVersions: [raw],
          requiredVersion: outdated ? "different" : raw,
          runningVersion: raw,
        },
        agent: { installedVersions: [], requiredVersion: raw, runningVersion: null },
      };
      expect(deviceToolsMessage(tools, raw, "en")).toBe(
        deviceToolUpdateOwnership +
          "\n\n" +
          deviceToolUpdatePolicy(tools) +
          "\n\n" +
          deviceToolVersionLabels(tools).join("\n") +
          "\n" +
          raw,
      );
      const chinese = deviceToolsMessage(tools, raw, "zh-CN");
      expect(chinese).toContain(
        `设备中心：已安装 ${raw}；需要 ${outdated ? "different" : raw}；正在运行 ${raw}。`,
      );
      expect(chinese).toContain(`Agent 工具：已安装 无；需要 ${raw}。`);
      expect(chinese.endsWith("\n" + raw)).toBe(true);
      expect(chinese).toContain(outdated ? "等待更新。" : "所需工具会在需要时自动安装。");
    }
    expect(
      localizeMenuActions(
        [{ id: "retry-stable", title: deviceRetryLabel(raw, "zh-CN"), localize: false }],
        "zh-CN",
      )[0],
    ).toMatchObject({ id: "retry-stable", title: `重试 ${raw}` });
    expect(deviceToolsMessage(undefined, raw, "zh-CN")).toContain("尚未检查设备工具版本。\n" + raw);
  }
});

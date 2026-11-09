import { DEFAULT_SERVER_SETTINGS, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { describe, expect, it } from "vite-plus/test";
import { settingInheritanceLayers } from "./SettingInheritance";
import { translateWebMessage } from "../../i18n/messages";

const environmentId = EnvironmentId.make("locale-test");
const projectId = ProjectId.make("locale-test-project");
function layers(
  settings: typeof DEFAULT_SERVER_SETTINGS,
  key: keyof typeof DEFAULT_SERVER_SETTINGS,
  locale: "en" | "zh-CN",
) {
  return settingInheritanceLayers(
    {
      environmentId,
      label: "Device",
      projectId: null,
      ...resolveProjectSettings(settings, projectId),
    },
    settings,
    key,
    locale,
  );
}

describe("settings controls localization", () => {
  it("preserves English defaults and localizes finite values without changing layer selection", () => {
    const settings = { ...DEFAULT_SERVER_SETTINGS, worktreeCleanup: { mode: "off" as const } };
    const english = layers(settings, "worktreeCleanup", "en");
    const chinese = layers(settings, "worktreeCleanup", "zh-CN");
    expect(english.map((layer) => layer.value)).toEqual(["Off", "Not set"]);
    expect(chinese.map((layer) => layer.value)).toEqual(["关", "未设置"]);
    expect(chinese.map(({ key, effective, set }) => ({ key, effective, set }))).toEqual(
      english.map(({ key, effective, set }) => ({ key, effective, set })),
    );
    expect(chinese[0]?.label).toBe("Device");
  });
  it("does not translate user-written text that collides with source labels", () => {
    for (const raw of ["Open", "Device", "Ready"]) {
      const settings = { ...DEFAULT_SERVER_SETTINGS, reviewGuideInstructions: raw };
      expect(layers(settings, "reviewGuideInstructions", "zh-CN")[0]?.value).toBe(raw);
    }
  });
  it("formats complete dynamic counts and keeps raw interpolation intact", () => {
    expect(translateWebMessage("en", "settingsControls.oneDay", { count: 1 })).toBe("1 day");
    expect(translateWebMessage("zh-CN", "settingsControls.manyDays", { count: 3 })).toBe("3 天");
    expect(
      translateWebMessage("zh-CN", "settingsControls.connectionError", { error: "Ready" }),
    ).toBe("连接失败：Ready");
    expect(translateWebMessage("en", "settingsControls.endpointRejected", { status: 503 })).toBe(
      "Rejected · HTTP 503",
    );
  });
});

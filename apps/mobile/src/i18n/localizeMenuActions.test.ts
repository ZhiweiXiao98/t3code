import { describe, expect, it } from "vite-plus/test";
import { localizeMenuActions } from "./localizeMenuActions";

describe("localized native menu actions", () => {
  it("translates nested labels without changing native action identifiers or state", () => {
    const actions = [
      {
        id: "environment",
        title: "Environment",
        subactions: [
          {
            id: "environment:all",
            title: "All environments",
            subtitle: "Connected",
            state: "on" as const,
          },
          { id: "environment:work", title: "work-host-42", image: "desktopcomputer" },
        ],
      },
    ];
    const localized = localizeMenuActions(actions, "zh-CN");
    expect(localized[0]?.title).toBe("环境");
    expect(localized[0]?.subactions?.[0]).toEqual({
      id: "environment:all",
      title: "所有环境",
      subtitle: "已连接",
      state: "on",
    });
    expect(localized[0]?.subactions?.[1]).toEqual(actions[0]?.subactions[1]);
    expect(actions[0]?.title).toBe("Environment");
    expect(localizeMenuActions(actions, "en")).toEqual(actions);
  });
});

import { describe, expect, it } from "vite-plus/test";
import { localizedReactionName, localizedReactionTooltip } from "./pullRequestReactionMessages";
import { translateWebMessage } from "./messages";

describe("localized reaction presentation", () => {
  it("preserves actor names and accounts for viewer and unnamed overflow without changing English", () => {
    const reaction = {
      content: "thumbs-up" as const,
      count: 5,
      viewerHasReacted: true,
      actors: ["You", "{names}/$&", "中文"],
    };
    expect(localizedReactionTooltip("zh-CN", reaction)).toBe(
      "你、You、{names}/$&、其他 2 人使用了“赞”表情",
    );
    expect(localizedReactionTooltip("en", reaction)).toBe(
      "You, You, {names}/$&, and 2 others reacted with thumbs up emoji",
    );
    expect(
      localizedReactionTooltip("zh-CN", {
        ...reaction,
        count: 2,
        actors: [],
        viewerHasReacted: false,
      }),
    ).toBe("2 人使用了“赞”表情");
    expect(localizedReactionTooltip("zh-CN", { ...reaction, count: 1, actors: ["You"] })).toBe(
      "You使用了“赞”表情",
    );
    expect(localizedReactionName("zh-CN", "thumbs-down")).toBe("踩");
  });
  it("interpolates opaque names and paths exactly once in accessible labels", () => {
    const name = "路径/{name}/<tag>/$&";
    expect(translateWebMessage("zh-CN", "audit4.fileOptions", { name })).toBe(`${name} 的文件选项`);
    expect(translateWebMessage("en", "audit4.retryUpload", { name })).toBe(
      `Retry upload for ${name}`,
    );
    expect(translateWebMessage("zh-CN", "audit4.pending", { kind: "PR", number: 42 })).toBe(
      "PR #42，状态待定",
    );
  });
});

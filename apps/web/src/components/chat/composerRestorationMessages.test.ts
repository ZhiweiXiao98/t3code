import { expect, it } from "vite-plus/test";
import { composerRestorationMessages } from "./composerRestorationMessages";

it("reports each actual restore partition in order without interpreting opaque names", () => {
  const empty = {
    dropped: [],
    unreadable: [],
    unrestoredImages: [],
    unrestoredFiles: [],
    expired: [],
    limit: 7,
  };
  expect(composerRestorationMessages("zh-CN", empty)).toEqual([]);
  const names = ["{names}/$&:\n.png", "Could not open file"];
  const input = {
    ...empty,
    dropped: names,
    unreadable: ["unreadable"],
    unrestoredImages: ["image"],
    unrestoredFiles: ["file"],
    expired: ["expired"],
  };
  const english = composerRestorationMessages("en", input);
  const chinese = composerRestorationMessages("zh-CN", input);
  expect(english).toHaveLength(5);
  expect(chinese).toHaveLength(5);
  expect(chinese[0]).toContain(names.join(", "));
  expect(chinese[1]).toContain("无法读取 unreadable");
  expect(chinese[2]).toContain("7 个附件的上限");
  expect(chinese[3]).toContain("无法恢复 file");
  expect(chinese[4]).toContain("24 小时");
  expect(composerRestorationMessages("en", input)).toEqual(english);
  expect(input.dropped).toBe(names);
  expect(names).toEqual(["{names}/$&:\n.png", "Could not open file"]);
});

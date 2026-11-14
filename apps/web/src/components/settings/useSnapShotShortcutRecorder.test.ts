import { expect, it } from "vite-plus/test";
import {
  formatSnapShotShortcutError,
  type SnapShotShortcutError,
} from "./useSnapShotShortcutRecorder";

it.each([
  ["recordFailed", "Could not start shortcut recording.", "无法开始录制快捷键。"],
  [
    "modifierRequired",
    "Add a letter, number, or function key to your shortcut.",
    "请为快捷键添加字母、数字或功能键。",
  ],
  ["checkFailed", "Could not check this shortcut.", "无法检查此快捷键。"],
] as const)("formats owned %s without translating a raw collision", (code, english, chinese) => {
  const error = { code } satisfies SnapShotShortcutError;
  expect(formatSnapShotShortcutError("en", error)).toBe(english);
  expect(formatSnapShotShortcutError("zh-CN", error)).toBe(chinese);
  expect(formatSnapShotShortcutError("en", error)).toBe(english);
  expect(formatSnapShotShortcutError("zh-CN", english)).toBe(english);
  expect(formatSnapShotShortcutError("zh-CN", "")).toBe("");
});

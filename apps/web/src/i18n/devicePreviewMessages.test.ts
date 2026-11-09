import { expect, it } from "vite-plus/test";
import { translateWebMessage, translateWebSource } from "./messages";

it("distinguishes the clear glass appearance from a clear action", () => {
  expect(translateWebMessage("zh-CN", "device.glass.clear")).toBe("通透");
  expect(translateWebMessage("en", "device.glass.clear")).toBe("Clear");
  expect(translateWebSource("zh-CN", "Clear")).toBe("清除");
  expect(translateWebSource("en", "Clear")).toBe("Clear");
});

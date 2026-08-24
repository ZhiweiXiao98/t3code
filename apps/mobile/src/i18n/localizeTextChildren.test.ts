import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { localizeMobileString } from "./mobileStrings";
import { localizeTextChildren } from "./localizeTextChildren";

const localizeChinese = (value: string) => localizeMobileString(value, "zh-CN");

describe("localizeTextChildren", () => {
  it("localizes interpolated text as one complete message", () => {
    expect(localizeTextChildren(["Show more (", 3, " settled hidden)"], localizeChinese)).toBe(
      "显示更多（已隐藏 3 个已收起任务）",
    );
  });

  it("falls back to localized fragments when the complete text has no catalog entry", () => {
    expect(localizeTextChildren(["+", 3, " more files"], localizeChinese)).toEqual([
      "+",
      3,
      " 个其他文件",
    ]);
  });

  it("preserves nested React elements between localized text runs", () => {
    const marker = createElement("strong", null, "main");
    const result = localizeTextChildren(["Settings", marker, "Cancel"], localizeChinese);

    expect(result).toEqual(["设置", marker, "取消"]);
  });
});

import { expect, it } from "vite-plus/test";
import { englishFilePreviewCount } from "./filePreviewCount";

it.each(["row", "column", "line"] as const)(
  "keeps singular and plural English %s counts",
  (unit) => {
    expect(englishFilePreviewCount(0, unit)).toBe(`0 ${unit}s`);
    expect(englishFilePreviewCount(1, unit)).toBe(`1 ${unit}`);
    expect(englishFilePreviewCount(2, unit)).toBe(`2 ${unit}s`);
    expect(englishFilePreviewCount("…", unit)).toBe(`… ${unit}s`);
  },
);

import { expect, it } from "vite-plus/test";
import { pullRequestDiffSubtitle, pullRequestFileSummary } from "./pullRequestDisplay";

it("keeps viewed and hidden counts distinct when composing localized file summaries", () => {
  const cases = [
    {
      input: { fileCount: 1, hiddenCount: 0, hideTestFiles: false, viewedCount: null },
      en: "1 changed file · Test files included",
      zh: "1 个更改文件 · 包含测试文件",
    },
    {
      input: { fileCount: 2, hiddenCount: 1, hideTestFiles: true, viewedCount: 0 },
      en: "2 visible files · 0 viewed · 1 test file hidden",
      zh: "2 个可见文件 · 已查看 0 个 · 已隐藏 1 个测试文件",
    },
    {
      input: { fileCount: 0, hiddenCount: 2, hideTestFiles: true, viewedCount: 0 },
      en: "0 visible files · 0 viewed · 2 test files hidden",
      zh: "0 个可见文件 · 已查看 0 个 · 已隐藏 2 个测试文件",
    },
  ];
  for (const { input, en, zh } of cases) {
    const snapshot = structuredClone(input);
    expect(pullRequestFileSummary(input, "en")).toBe(en);
    expect(pullRequestFileSummary(input, "zh-CN")).toBe(zh);
    expect(input).toEqual(snapshot);
  }
});

it("preserves a diff identifier literally and hides the zero hidden-test segment", () => {
  for (const identifier of ["#7", "a1b2c3d", "Settings/{0}/$&"]) {
    expect(pullRequestDiffSubtitle(identifier, 1, 0, "en")).toBe(`${identifier} · 1 file`);
    expect(pullRequestDiffSubtitle(identifier, 2, 1, "en")).toBe(
      `${identifier} · 2 files · 1 test hidden`,
    );
    expect(pullRequestDiffSubtitle(identifier, 0, 2, "zh-CN")).toBe(
      `${identifier} · 0 个文件 · 已隐藏 2 个测试`,
    );
  }
});

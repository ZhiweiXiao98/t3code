import { describe, expect, it } from "vite-plus/test";
import { translateWebMessage, translateWebSource } from "../../i18n/messages";

describe("file preview messages", () => {
  it("preserves English defaults and interpolates counts", () => {
    expect(translateWebMessage("en", "files.residual.rows", { count: 12 })).toBe("12 rows");
    expect(translateWebMessage("en", "files.residual.slidePosition", { page: 2, count: 8 })).toBe(
      "Slide 2 of 8",
    );
    expect(translateWebMessage("en", "files.residual.onePage", { count: 1 })).toBe("1 page");
  });
  it("uses Chinese units for rows, cells, slides, sheets and bytes", () => {
    expect(translateWebMessage("zh-CN", "files.residual.rows", { count: 12 })).toBe("12 行");
    expect(translateWebMessage("zh-CN", "files.residual.cells", { count: 4 })).toBe("4 个单元格");
    expect(translateWebMessage("zh-CN", "files.residual.slides", { count: 3 })).toBe("3 张幻灯片");
    expect(
      translateWebMessage("zh-CN", "files.residual.sheetDimensions", {
        page: 1,
        count: 2,
        rows: 30,
        columns: 4,
      }),
    ).toBe("第 1 张工作表，共 2 张 · 30 行 · 4 列");
    expect(
      translateWebMessage("zh-CN", "files.residual.limitedBytes", { count: 2000000 }),
    ).toContain("2000000 字节");
  });
  it("keeps filenames and project names opaque", () => {
    expect(
      translateWebMessage("zh-CN", "files.residual.searchProject", { project: "My Project.txt" }),
    ).toBe("搜索 My Project.txt 的文件");
    expect(translateWebMessage("en", "files.residual.saveFormat", { format: "xyz" })).toBe(
      "Save it to open in an app that supports xyz files.",
    );
  });
  it("uses audio-specific Play without changing the established generic source", () => {
    expect(translateWebMessage("en", "files.residual.audioPlay")).toBe("Play");
    expect(translateWebMessage("zh-CN", "files.residual.audioPlay")).toBe("播放");
    expect(translateWebSource("zh-CN", "Play")).toBe("运行");
  });
  it("translates static accessibility labels and leaves raw unknown errors unchanged", () => {
    expect(translateWebSource("zh-CN", "Speaker notes")).toBe("演讲者备注");
    expect(translateWebSource("zh-CN", "Refresh workspace files")).toBe("刷新工作区文件");
    expect(translateWebSource("zh-CN", "REMOTE_ERROR /tmp/file.txt")).toBe(
      "REMOTE_ERROR /tmp/file.txt",
    );
  });
});

it("localizes large text metadata while preserving English punctuation", () => {
  expect(translateWebMessage("en", "files.residual.columnsSuffix", { count: 4 })).toBe(
    " · 4 columns",
  );
  expect(translateWebMessage("zh-CN", "files.residual.columnsSuffix", { count: 4 })).toBe(
    " · 4 列",
  );
  expect(translateWebMessage("zh-CN", "files.residual.lines", { count: 42 })).toBe("42 行");
  expect(translateWebSource("en", "Font preview")).toBe("Font preview");
  expect(translateWebSource("zh-CN", "Font preview")).toBe("字体预览");
});

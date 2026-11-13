import { splitSearchText } from "@t3tools/shared/paletteSearch";
import { describe, expect, it } from "vite-plus/test";

import { commandPaletteProjectActionTitle, commandPaletteTitle } from "./commandPaletteDisplay";
import { filterCommandPaletteItems, type CommandPaletteItem } from "./commandPaletteItems";

function item(kind: CommandPaletteItem["kind"], title: string): CommandPaletteItem {
  return { key: kind, kind, title, searchTerms: [], run: () => {} };
}

describe("command palette display provenance", () => {
  it("ranks and highlights the localized action title in both locales", () => {
    for (const [locale, query, expected] of [
      ["en", "settings", "Open settings"],
      ["zh-CN", "设置", "打开设置"],
    ] as const) {
      const title = commandPaletteTitle("action", "Open settings", locale);
      const [result] = filterCommandPaletteItems(
        [{ ...item("action", title), searchTitle: "Open settings" }],
        `> ${query}`,
        [],
        0,
      );
      expect(result?.title).toBe(expected);
      const parts = splitSearchText(result!.title, result!.titleRanges!);
      expect(parts.map((part) => part.text).join("")).toBe(expected);
      expect(
        parts
          .filter((part) => part.highlighted)
          .map((part) => part.text)
          .join(""),
      ).toBe(query);
    }
  });

  it("preserves dictionary-shaped names and their highlight fragments", () => {
    for (const kind of ["thread", "project"] as const) {
      const title = commandPaletteTitle(kind, "Open Settings", "zh-CN");
      const [result] = filterCommandPaletteItems([item(kind, title)], "Settings", [], 0);
      expect(result?.title).toBe("Open Settings");
      expect(splitSearchText(result!.title, result!.titleRanges!).map((part) => part.text)).toEqual(
        ["Open ", "Settings"],
      );
      expect(commandPaletteTitle(kind, "Settings", "zh-CN")).toBe("Settings");
    }
    expect(commandPaletteTitle("thread", "", "zh-CN")).toBe("未命名任务");
    expect(commandPaletteTitle("thread", "", "en")).toBe("Untitled thread");
    expect(commandPaletteTitle("project", "", "zh-CN")).toBe("");
  });

  it("inserts project names once without interpreting translation keys or placeholders", () => {
    const project = "Settings {0} $&";
    expect(commandPaletteProjectActionTitle(project, "en")).toBe(`New thread in ${project}`);
    expect(commandPaletteProjectActionTitle(project, "zh-CN")).toBe(`在 ${project} 中新建任务`);
  });
});

it("keeps original English action titles searchable when the displayed title is Chinese", () => {
  for (const [original, query] of [
    ["Open settings", "settings"],
    ["Open settings", "set"],
    ["Appearance", "appearance"],
    ["Appearance", "app"],
    ["Manage environments", "environments"],
    ["Go to file", "file"],
  ]) {
    const title = commandPaletteTitle("action", original!, "zh-CN");
    const action = { ...item("action", title), searchTitle: original!, searchTerms: [original!] };
    const [result] = filterCommandPaletteItems([action], `> ${query}`, [], 0);
    expect(result?.title).toBe(title);
    expect(
      splitSearchText(result!.title, result!.titleRanges ?? [])
        .map((part) => part.text)
        .join(""),
    ).toBe(title);
    expect(result!.titleRanges ?? []).toEqual([]);
  }
});

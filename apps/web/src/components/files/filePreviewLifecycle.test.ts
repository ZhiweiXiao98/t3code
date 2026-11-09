import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeURL from "node:url";
import { it } from "@effect/vitest";
import { beforeEach, describe, expect, vi } from "vite-plus/test";
import { useStableCallback } from "../../hooks/useStableCallback";
import { translateWebSource } from "../../i18n/messages";

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  commits: [] as (() => void)[],
}));
vi.mock("react", () => ({
  useRef: (value: unknown) => {
    const index = hooks.cursor++;
    hooks.slots[index] ??= { current: value };
    return hooks.slots[index];
  },
  useState: (initialize: () => unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = initialize();
    return [hooks.slots[index], () => undefined];
  },
  useInsertionEffect: (effect: () => void) => hooks.commits.push(effect),
}));

function Translator({ locale }: { locale: "en" | "zh-CN" }) {
  return useStableCallback((source: string) => translateWebSource(locale, source));
}
function renderTranslator(locale: "en" | "zh-CN") {
  hooks.cursor = 0;
  const callback = Translator({ locale });
  for (const commit of hooks.commits.splice(0)) commit();
  return callback;
}

const resourceDeps: Record<string, string[][]> = {
  LargeTextViewer: [["props.src", "props.text", "props.delimiter", "props.sizeBytes"]],
  AttachmentFilePreview: [
    ["props.file"],
    ["props.file", "refresh", "revision"],
    ["url", "needsText", "streamsText", "revision", "props.sizeBytes", "props.file", "refresh"],
  ],
  OfficeViewer: [["props.src", "props.kind", "props.sizeBytes"]],
  FontViewer: [["props.src"]],
  OpenXmlOfficeViewer: [["props.src", "props.kind", "props.sizeBytes", "fail"]],
  BinaryViewer: [
    ["props.bytes", "props.path", "kind"],
    ["props.src", "props.kind", "props.name"],
  ],
  "office/Presentation": [["source", "onDetails", "onError"]],
  "office/WordDocument": [
    ["bytes", "onDetails", "onError"],
    ["engine", "index", "page"],
  ],
  "office/Spreadsheet": [
    ["source", "onDetails", "onError"],
    ["onNavigate"],
    ["engine", "layout", "initialCell"],
  ],
};
const effects = Effect.fn(function* (name: string) {
  const filename = NodeURL.fileURLToPath(new URL(`./${name}.tsx`, import.meta.url));
  const fs = yield* FileSystem.FileSystem;
  const source = yield* fs.readFileString(filename);
  return [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[([\s\S]*?)\]\);/g)].map(
    (match) => ({
      body: match[1]!,
      dependencies: match[2]!
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    }),
  );
});

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
  hooks.commits = [];
});

describe("file preview translation lifecycle", () => {
  it("uses the latest committed language without changing callback identity or resource dependencies", () => {
    const first = renderTranslator("en");
    const resource = {};
    let starts = 0;
    let cleanups = 0;
    let previous: readonly unknown[] | undefined;
    const commitResource = (dependencies: readonly unknown[]) => {
      if (!previous || dependencies.some((value, index) => value !== previous?.[index])) {
        if (previous) cleanups++;
        starts++;
        previous = dependencies;
      }
    };
    commitResource([resource, first]);
    expect(first("The file is unavailable.")).toBe("The file is unavailable.");
    const second = renderTranslator("zh-CN");
    commitResource([resource, second]);
    expect(second).toBe(first);
    expect(first("The file is unavailable.")).toBe("文件不可用。");
    expect(starts).toBe(1);
    expect(cleanups).toBe(0);
    expect(second("REMOTE raw error")).toBe("REMOTE raw error");
  });

  it.effect.each(Object.entries(resourceDeps))(
    "%s retains its original resource dependencies",
    ([name, expected]) =>
      Effect.gen(function* () {
        const actual = (yield* effects(name)).filter(
          (effect) => !effect.dependencies.includes("details"),
        );
        expect(
          actual.map((effect) =>
            effect.dependencies.filter(
              (value) => !["translateSource", "translateCount"].includes(value),
            ),
          ),
        ).toEqual(expected);
        for (const effect of actual) {
          expect(effect.dependencies).not.toContain("locale");
          expect(effect.dependencies).not.toContain("previewLocale");
          expect(effect.dependencies).not.toContain("t");
          expect(effect.body).not.toMatch(/translateWebSource\(\s*(?:locale|previewLocale)/);
        }
      }).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  it.effect.each(["office/Presentation", "office/WordDocument", "office/Spreadsheet"])(
    "%s publishes translated metadata without recreating its engine",
    (name) =>
      Effect.gen(function* () {
        const metadata = (yield* effects(name)).find((effect) =>
          effect.dependencies.includes("details"),
        );
        expect(metadata?.dependencies).toEqual(["details", "onDetails"]);
        expect(metadata?.body).toContain("onDetails(details)");
        expect(metadata?.body).not.toMatch(/new Worker|abort\(|close\(|terminate\(/);
      }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});

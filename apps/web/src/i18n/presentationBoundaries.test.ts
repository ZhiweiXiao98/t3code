// @effect-diagnostics nodeBuiltinImport:off - verifies the finite presentation sources and their consumer boundaries.
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { translateWebMessage, translateWebSource } from "./messages";

const source = (path: string) => NodeFS.readFileSync(new URL(path, import.meta.url), "utf8");

describe("owned presentation boundaries", () => {
  it("covers all nine labels produced by the thread status resolver", () => {
    const code = source("../components/Sidebar.logic.ts")
      .split("export function resolveThreadStatusPill")[1]!
      .split("export function getFallbackThreadIdAfterDelete")[0]!;
    const labels = [...code.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]!);
    expect(labels).toHaveLength(9);
    for (const label of labels) {
      expect(translateWebSource("en", label)).toBe(label);
      expect(translateWebSource("zh-CN", label)).toMatch(/[\u3400-\u9fff]/);
    }
    expect(source("../components/ThreadStatusIndicators.tsx")).toContain(
      "translateWebSource(locale, status.label)",
    );
    expect(translateWebSource("zh-CN", "provider /Working/$&/{label}")).toBe(
      "provider /Working/$&/{label}",
    );
  });

  it("covers all three incomplete device-list variants without changing platform names", () => {
    expect(source("../components/settings/DeviceSourcesSettings.tsx")).toContain(
      "`${list} list may be incomplete`",
    );
    for (const label of ["Device", "iOS", "Android"]) {
      const text = `${label} list may be incomplete`;
      expect(translateWebSource("en", text)).toBe(text);
      expect(translateWebSource("zh-CN", text)).toMatch(/[\u3400-\u9fff]/);
    }
  });

  it("substitutes opaque names, media labels and PR titles only once", () => {
    const name = "Working / $& / {name} / 中文";
    for (const locale of ["en", "zh-CN", "en"] as const) {
      expect(translateWebMessage(locale, "audit12.link.title", { name })).toContain(name);
      expect(translateWebMessage(locale, "audit12.link.target", { name })).toContain(name);
      expect(translateWebMessage(locale, "audit12.media.play", { label: name })).toContain(name);
      expect(
        translateWebMessage(locale, "audit12.pr.more", { tooltip: name, count: 7, state: "open" }),
      ).toContain(name);
    }
    expect(
      translateWebMessage("en", "audit12.pr.stack", {
        count: 2,
        kind: "pull requests",
        state: "open",
      }),
    ).toBe("Stack of 2 pull requests, open");
    expect(translateWebMessage("en", "audit12.pr.pending", { kind: "PR", number: 42 })).toBe(
      "PR #42, status pending",
    );
  });

  it("keeps fallback translation confined to non-Error branches", () => {
    expect(source("../components/settings/ProjectActionsSettings.tsx")).toMatch(
      /error instanceof Error\s*\? error.message\s*: readWebI18n\(\).t\("projectSettings.importFailed"\)/,
    );
    expect(source("../components/settings/useSnapShotShortcutRecorder.tsx")).toMatch(
      /onError\(\s*error instanceof Error\s*\?\s*error\.message\s*:\s*\{\s*code:\s*"recordFailed"\s*\}\s*\)/,
    );
  });
});

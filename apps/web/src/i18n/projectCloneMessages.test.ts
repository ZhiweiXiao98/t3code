import { describe, expect, it } from "vite-plus/test";
import { translateWebMessage } from "./messages";
import { localizedProjectCloneProgressSummary } from "./projectCloneMessages";
import type { WebTranslate } from "./WebI18nContext";

const zh: WebTranslate = (key, values) => translateWebMessage("zh-CN", key, values);
const en: WebTranslate = (key, values) => translateWebMessage("en", key, values);

describe("localizedProjectCloneProgressSummary", () => {
  it("preserves transfer details and percentage, but suppresses stale speed when stalled", () => {
    const snapshot = {
      stage: "receiving" as const,
      percent: 42,
      detail: "opaque/{name} · 1 MiB/s",
    };
    expect(localizedProjectCloneProgressSummary(snapshot, zh)).toBe(
      "正在接收对象 · 42% · opaque/{name} · 1 MiB/s",
    );
    expect(localizedProjectCloneProgressSummary(snapshot, en)).toBe(
      "Receiving objects · 42% · opaque/{name} · 1 MiB/s",
    );
    expect(localizedProjectCloneProgressSummary({ ...snapshot, stalled: true }, zh)).toBe(
      "正在接收对象 · 42% · 已停滞",
    );
    expect(
      localizedProjectCloneProgressSummary({ ...snapshot, percent: null, detail: null }, zh),
    ).toBe("正在接收对象");
  });
});

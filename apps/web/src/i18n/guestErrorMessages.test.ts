// @effect-diagnostics nodeBuiltinImport:off - verifies localization coverage against production source files on disk.
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { localizeGuestError } from "./guestErrorMessages";

const source = (path: string) => NodeFS.readFileSync(new URL(path, import.meta.url), "utf8");

describe("guest-owned failure presentation", () => {
  it("covers the current server-owned failure tables and HTTP bad request", () => {
    const decider = source("../../../server/src/orchestration-v2/GuestShareDecider.ts");
    const service = source("../../../server/src/guest/GuestShareService.ts");
    const http = source("../../../server/src/guest/http.ts");
    const messages = new Set<string>();
    for (const [text, table] of [
      [decider, "GUEST_FAILURE"],
      [service, "GUEST_ACCESS_MESSAGES"],
    ]) {
      const block = text!.split(`const ${table} = {`)[1]!.split("} as const;")[0]!;
      for (const match of block.matchAll(/\w+: "([^"]+)"/g)) messages.add(match[1]!);
    }
    const badRequest = http.match(/reason: "invalid", message: "([^"]+)"/)!;
    messages.add(badRequest[1]!);
    expect(messages.size).toBe(13);
    for (const message of messages) {
      expect(localizeGuestError("en", message)).toBe(message);
      expect(localizeGuestError("zh-CN", message)).toMatch(/[\u3400-\u9fff]/);
      expect(localizeGuestError("zh-CN", `external: ${message}`)).toBe(`external: ${message}`);
      expect(localizeGuestError("zh-CN", `${message}\nextra`)).toBe(`${message}\nextra`);
    }
  });

  it("localizes only the two application-generated item failures", () => {
    const itemSource = source("../components/guest/guestTurnItemSource.ts");
    for (const message of ["Could not load this item.", "Output is no longer available."]) {
      expect(itemSource).toContain(`"${message}"`);
      expect(localizeGuestError("en", message)).toBe(message);
      expect(localizeGuestError("zh-CN", message)).not.toBe(message);
    }
  });

  it("keeps unknown and opaque failures unchanged", () => {
    for (const message of [
      "provider/{name}/$&/中文\nline 2",
      "constructor",
      "__proto__",
      "",
      "请求无效。",
    ])
      expect(localizeGuestError("zh-CN", message)).toBe(message);
  });
});

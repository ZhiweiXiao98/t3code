// @effect-diagnostics nodeBuiltinImport:off - verifies the finite error catalogue against actual media construction sites.
import {
  ClipboardApiUnavailableError,
  ClipboardWriteError,
  writeTextToClipboard,
} from "../../hooks/useCopyToClipboard";
import * as NodeFS from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  MediaActionError,
  mediaActionErrorMessage,
  mediaActionFailureTitle,
} from "./mediaActionErrors";
import { readMediaPng } from "./mediaContent";

const source = (path: string) => NodeFS.readFileSync(new URL(path, import.meta.url), "utf8");

describe("media error provenance", () => {
  it("covers every owned fixed error constructed by both production modules", () => {
    const code = source("./MediaActions.tsx") + source("./mediaContent.ts");
    const messages = [...code.matchAll(/source:\s*"([^"\n]+)"/g)]
      .map((match) => match[1]!)
      .filter((text) => text !== "http");
    messages.push(
      "The file could not be fetched. Check the connection and try again.",
      "The file could not be fetched. The host may block browser access (CORS), or the connection may be unavailable.",
    );
    expect(new Set(messages).size).toBe(13);
    for (const text of messages) {
      const error = new MediaActionError({ source: text });
      for (const locale of ["en", "zh-CN", "en"] as const) {
        const display = mediaActionErrorMessage(locale, error);
        if (locale === "en") expect(display).toBe(text);
        else expect(display).toMatch(/[\u3400-\u9fff]/);
      }
      expect(mediaActionErrorMessage("zh-CN", new Error(text))).toBeNull();
      expect(
        mediaActionErrorMessage("zh-CN", { _tag: "MediaActionError", source: text }),
      ).toBeNull();
    }
    const opaque = "provider/$&/{name}/路径";
    expect(mediaActionErrorMessage("zh-CN", new MediaActionError({ source: opaque }))).toBe(opaque);
  });

  it("translates real decode, HTTP and HTML failures without changing fetch inputs", async () => {
    const invalid = await readMediaPng("data:image/png;base64,%%% ").catch(
      (error: unknown) => error,
    );
    expect(mediaActionErrorMessage("zh-CN", invalid)).toBe("无法解码此内嵌媒体。");
    using fetch = vi.spyOn(globalThis, "fetch");
    const url = "https://example.com/opaque/%E4%B8%AD?$&={name}";
    fetch.mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const http = await readMediaPng(url).catch((error: unknown) => error);
    expect(fetch).toHaveBeenLastCalledWith(url);
    expect(mediaActionErrorMessage("en", http)).toBe("The file could not be fetched (HTTP 404).");
    expect(mediaActionErrorMessage("zh-CN", http)).toBe("无法获取文件（HTTP 404）。");
    fetch.mockResolvedValueOnce(
      new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    const html = await readMediaPng(url).catch((error: unknown) => error);
    expect(mediaActionErrorMessage("zh-CN", html)).toBe(
      "此链接返回了网页而非媒体。请打开原始 URL。",
    );
  });

  it("keeps the original English action titles and chooses current Chinese copy", () => {
    for (const [action, expected] of [
      ["save", "Could not save video"],
      ["copy-full-path", "Could not copy full path"],
      ["copy-url", "Could not copy url"],
      ["copy-image", "Could not copy image"],
    ] as const) {
      expect(mediaActionFailureTitle("en", action, "video")).toBe(expected);
      expect(mediaActionFailureTitle("zh-CN", action, "video")).toMatch(/^无法/);
    }
  });
});

it("recognizes only the two clipboard errors with media-owned target values", async () => {
  for (const target of ["file path", "URL"]) {
    const errors = [
      new ClipboardApiUnavailableError({ target }),
      new ClipboardWriteError({ target, cause: new Error("provider") }),
    ];
    for (const error of errors) {
      expect(mediaActionErrorMessage("en", error)).toBe(error.message);
      expect(mediaActionErrorMessage("zh-CN", error)).toMatch(/[\u3400-\u9fff]/);
      expect(mediaActionErrorMessage("zh-CN", new Error(error.message))).toBeNull();
      expect(
        mediaActionErrorMessage("zh-CN", { _tag: error._tag, target, cause: error }),
      ).toBeNull();
    }
  }
  const opaque = new ClipboardApiUnavailableError({ target: "/user/$&/{name}" });
  expect(mediaActionErrorMessage("zh-CN", opaque)).toBe(opaque.message);
  vi.stubGlobal("window", undefined);
  try {
    const result = await writeTextToClipboard("/user/$&/{name}", "file path").catch(
      (error: unknown) => error,
    );
    expect(mediaActionErrorMessage("zh-CN", result)).toBe("复制文件路径时剪贴板 API 不可用。");
  } finally {
    vi.unstubAllGlobals();
  }
});

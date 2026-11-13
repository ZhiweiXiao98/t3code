// @effect-diagnostics nodeBuiltinImport:off - verifies localization coverage against production source files on disk.
import * as NodeFS from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { checkZipDirectory } from "@t3tools/client-runtime/zip/directory";
import { decodeFilePreviewText } from "@t3tools/shared/filePreview";
import { readFilePreviewResponse } from "@t3tools/client-runtime/file-preview";
import { localizeFilePreviewError } from "./filePreviewErrorMessages";
import { openNotebook } from "./extendedDocumentPreview";
import { createWorkerClient } from "./office/worker-rpc";
import { boundedArchive } from "./officeArchive";

const readSource = (name: string) => NodeFS.readFileSync(new URL(name, import.meta.url), "utf8");

function expectLocalized(source: string) {
  expect(localizeFilePreviewError("en", source)).toBe(source);
  expect(localizeFilePreviewError("zh-CN", source)).not.toBe(source);
  expect(localizeFilePreviewError("zh-CN", source)).toMatch(/[\u3400-\u9fff]/);
  expect(localizeFilePreviewError("zh-CN", `external: ${source}`)).toBe(`external: ${source}`);
  expect(localizeFilePreviewError("zh-CN", `${source}\nextra`)).toBe(`${source}\nextra`);
}

describe("owned file preview failure presentation", () => {
  it("covers the actual finite messages emitted by each production source", () => {
    const messages = new Set<string>();
    for (const file of [
      "./officeArchive.ts",
      "./extendedDocumentPreview.ts",
      "./binaryPreview.worker.ts",
      "./officePreview.worker.ts",
      "./largeText.worker.ts",
      "./readBinaryPreview.ts",
      "./office/document.worker.ts",
      "./office/presentation.worker.ts",
      "./office/spreadsheet.worker.ts",
      "../../../../../packages/client-runtime/src/zip/zipDirectory.ts",
      "../../../../../packages/client-runtime/src/zip/boundedZip.ts",
      "../../../../../packages/shared/src/filePreview.ts",
      "../../../../../packages/client-runtime/src/filePreview.ts",
    ]) {
      const source = readSource(file);
      const errors = [...source.matchAll(/new Error\(\s*"([^"]+)"/g)];
      expect(errors.length).toBeGreaterThan(0);
      for (const match of errors) {
        if (match[1] !== "Preview cancelled.") messages.add(match[1]!);
      }
      for (const match of source.matchAll(
        /message: cause instanceof Error \? cause.message : "([^"]+)"/g,
      )) {
        messages.add(match[1]!);
      }
    }
    const rpc = readSource("./office/worker-rpc.ts");
    for (const match of rpc.matchAll(/(?:message:|event.message \|\|)\s*"([^"]+)"/g)) {
      if (
        ![
          "The call was aborted",
          "The Office engine was closed",
          "Replaced by a newer call",
        ].includes(match[1]!)
      )
        messages.add(match[1]!);
    }
    expect(messages.size).toBe(99);
    for (const source of messages) expectLocalized(source);
  });

  it("translates actual shared response and document validation failures", async () => {
    const failures = [
      () => checkZipDirectory(new ArrayBuffer(0)),
      () => decodeFilePreviewText(new Uint8Array([0])),
      () => decodeFilePreviewText(new Uint8Array([0xff])),
      () => readFilePreviewResponse({ ok: false, body: null }, new AbortController().signal),
      () => readFilePreviewResponse({ ok: true, body: null }, new AbortController().signal),
      () => openNotebook(new TextEncoder().encode('{"nbformat":3,"cells":[]}').buffer),
      () =>
        boundedArchive({
          type: "open",
          kind: "docx",
          bytes: new ArrayBuffer(50 * 1024 * 1024 + 1),
        }),
    ];
    for (const run of failures) {
      let failure: unknown;
      try {
        await run();
      } catch (cause) {
        failure = cause;
      }
      expect(failure).toBeInstanceOf(Error);
      expectLocalized((failure as Error).message);
    }
  });

  it("translates real worker error messages without altering their protocol", async () => {
    for (const [file, data, expected] of [
      ["binary", { type: "entry", path: "user/{name}/中文" }, "This archive entry is unavailable."],
      ["office", { type: "sheet-page", sheet: 42, index: 0 }, "This sheet is unavailable."],
      ["large", { type: "copy" }, "Wait for the file to finish loading before copying."],
    ] as const) {
      let receive: ((event: { data: unknown }) => void) | undefined;
      let resolve!: (result: { type: string; message: string }) => void;
      const result = new Promise<{ type: string; message: string }>((done) => {
        resolve = done;
      });
      vi.stubGlobal("self", {
        addEventListener: (_type: string, listener: typeof receive) => {
          receive = listener;
        },
        postMessage: (value: { type: string; message: string }) => resolve(value),
      });
      try {
        if (file === "binary") await import("./binaryPreview.worker");
        else if (file === "office") await import("./officePreview.worker");
        else await import("./largeText.worker");
        expect(receive).toBeTypeOf("function");
        receive!({ data });
        const value = await result;
        expect(value).toEqual({
          type: "error",
          message: expected,
          ...(file === "large" ? { operation: "copy" } : {}),
        });
        expectLocalized(value.message);
      } finally {
        vi.unstubAllGlobals();
      }
    }
  });

  it("localizes the real Office RPC failure while retaining unknown worker failures", async () => {
    for (const external of ["", "external/{path}/$&"]) {
      const worker = Object.assign(new EventTarget(), {
        postMessage: () => undefined,
        terminate: () => undefined,
      });
      const client = createWorkerClient<{ open: { input: null; output: null } }>(
        worker as unknown as Worker,
      );
      const pending = client.call("open", null).catch((cause: unknown) => cause);
      const event = new Event("error");
      Object.defineProperty(event, "message", { value: external });
      worker.dispatchEvent(event);
      const error = await pending;
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      if (external) expect(localizeFilePreviewError("zh-CN", message)).toBe(external);
      else expectLocalized(message);
    }
  });

  it("preserves unknown parser errors, opaque values and cancellation messages", () => {
    for (const source of [
      "parser: invalid XML at user/{path}/$&/中文\nline 4",
      "Preview cancelled.",
      "constructor",
      "__proto__",
      "",
      "已翻译的错误",
    ]) {
      expect(localizeFilePreviewError("zh-CN", source)).toBe(source);
      expect(localizeFilePreviewError("en", source)).toBe(source);
    }
  });
});

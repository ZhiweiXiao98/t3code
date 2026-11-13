import { describe, expect, it, vi } from "vite-plus/test";
import { checkZipDirectory } from "@t3tools/client-runtime/zip/directory";
import {
  decodeFilePreviewText,
  filePreviewErrorFields,
  filePreviewErrorSource,
} from "@t3tools/shared/filePreview";
import { readFilePreviewResponse } from "@t3tools/client-runtime/file-preview";
import {
  localizeFilePreviewError,
  filePreviewFailureMessage,
  filePreviewWorkerError,
} from "./filePreviewErrorMessages";
import { openNotebook } from "./extendedDocumentPreview";
import { createWorkerClient, serveWorker } from "./office/worker-rpc";
import { boundedArchive } from "./officeArchive";

function expectLocalized(error: Error) {
  const source = error.message;
  expect(filePreviewFailureMessage("en", error)).toBe(source);
  expect(filePreviewFailureMessage("zh-CN", error)).not.toBe(source);
  expect(filePreviewFailureMessage("en", error)).toBe(source);
  const collision = Object.assign(new Error(source), { source, _tag: "FilePreviewError" });
  expect(filePreviewErrorFields(collision)).toEqual({});
  expect(filePreviewFailureMessage("zh-CN", collision)).toBe(source);
  expect(localizeFilePreviewError("en", source)).toBe(source);
  expect(localizeFilePreviewError("zh-CN", source)).not.toBe(source);
  expect(localizeFilePreviewError("zh-CN", source)).toMatch(/[\u3400-\u9fff]/);
  expect(localizeFilePreviewError("zh-CN", `external: ${source}`)).toBe(`external: ${source}`);
  expect(localizeFilePreviewError("zh-CN", `${source}\nextra`)).toBe(`${source}\nextra`);
}

describe("owned file preview failure presentation", () => {
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
      expectLocalized(failure as Error);
    }
  });

  it("translates real worker error messages through the local worker protocol with provenance", async () => {
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
          source: expected,
          ...(file === "large" ? { operation: "copy" } : {}),
        });
        expectLocalized(filePreviewWorkerError(structuredClone(value)));
      } finally {
        vi.unstubAllGlobals();
      }
    }
  });

  it("localizes the real Office RPC failure while retaining unknown worker failures", async () => {
    for (const [eventType, external] of [
      ["error", ""],
      ["error", "external/{path}/$&"],
      ["error", "The Office engine stopped"],
      ["messageerror", ""],
    ] as const) {
      const worker = Object.assign(new EventTarget(), {
        postMessage: () => undefined,
        terminate: () => undefined,
      });
      const client = createWorkerClient<{ open: { input: null; output: null } }>(
        worker as unknown as Worker,
      );
      const pending = client.call("open", null).catch((cause: unknown) => cause);
      const event = new Event(eventType);
      Object.defineProperty(event, "message", { value: external });
      worker.dispatchEvent(event);
      const error = await pending;
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ _tag: "WorkerClosedError", name: "WorkerClosedError" });
      expect(Object.getPrototypeOf(error).constructor.name).toBe("WorkerClosedError");
      const message = (error as Error).message;
      expect(message).toBe(
        external ||
          (eventType === "messageerror"
            ? "The Office engine sent an unreadable reply"
            : "The Office engine stopped"),
      );
      const later = await client.call("open", null).catch((cause: unknown) => cause);
      expect(later).toBe(error);
      expect((later as Error).message).toBe(message);
      if (external) expect(filePreviewFailureMessage("zh-CN", error as Error)).toBe(external);
      else expectLocalized(error as Error);
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

it("rejects malformed worker sources and unmarked same-text errors", () => {
  const message = "This file contains binary data.";
  for (const source of [undefined, null, 42, {}, "constructor", "This sheet is unavailable."]) {
    const error = filePreviewWorkerError({ message, source });
    expect(filePreviewErrorSource(error)).toBeUndefined();
    expect(filePreviewFailureMessage("zh-CN", error)).toBe(message);
  }
});

it("preserves an actual text worker fetch rejection, including an own-message collision", async () => {
  vi.resetModules();
  const external = Object.assign(new Error("This file contains binary data."), {
    source: "This file contains binary data.",
  });
  let receive: ((event: { data: unknown }) => void) | undefined;
  let complete!: (value: { message: string; source?: string }) => void;
  const reply = new Promise<{ message: string; source?: string }>((resolve) => {
    complete = resolve;
  });
  vi.stubGlobal("self", {
    addEventListener: (_: string, listener: typeof receive) => {
      receive = listener;
    },
    postMessage: complete,
  });
  vi.stubGlobal("fetch", async () => {
    throw external;
  });
  try {
    await import("./largeText.worker");
    receive!({ data: { type: "open", src: "https://example.test/{file}/$&", delimiter: null } });
    const value = await reply;
    expect(value.message).toBe(external.message);
    expect(value.source).toBeUndefined();
    expect(filePreviewFailureMessage("zh-CN", filePreviewWorkerError(structuredClone(value)))).toBe(
      external.message,
    );
    expect(external.message).toBe("This file contains binary data.");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("round trips actual Office RPC owned validation and raw same-text failures separately", async () => {
  type Methods = { validate: { input: boolean; output: null } };
  let receive: ((event: MessageEvent) => void) | undefined;
  const worker = Object.assign(new EventTarget(), {
    postMessage: (data: unknown) =>
      receive!(new MessageEvent("message", { data: structuredClone(data) })),
    terminate: () => undefined,
  });
  vi.stubGlobal("self", {
    addEventListener: (_: string, listener: typeof receive) => {
      receive = listener;
    },
    postMessage: (data: unknown) =>
      worker.dispatchEvent(new MessageEvent("message", { data: structuredClone(data) })),
  });
  try {
    serveWorker<Methods>({
      validate: (owned) => {
        if (owned) checkZipDirectory(new ArrayBuffer(0));
        throw Object.assign(new Error("This is not a readable ZIP archive."), {
          source: "This is not a readable ZIP archive.",
        });
      },
    });
    const client = createWorkerClient<Methods>(worker as unknown as Worker);
    const owned = await client.call("validate", true).catch((error: unknown) => error);
    expect(owned).toBeInstanceOf(Error);
    expectLocalized(owned as Error);
    const raw = await client.call("validate", false).catch((error: unknown) => error);
    expect(raw).toBeInstanceOf(Error);
    expect(filePreviewFailureMessage("zh-CN", raw as Error)).toBe(
      "This is not a readable ZIP archive.",
    );
    client.close();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("preserves the Office RPC timeout instance while translating its owned message at display time", async () => {
  vi.useFakeTimers();
  const worker = Object.assign(new EventTarget(), { postMessage: vi.fn(), terminate: vi.fn() });
  const client = createWorkerClient<{ open: { input: null; output: null } }>(
    worker as unknown as Worker,
  );
  try {
    const pending = client.call("open", null).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    const error = await pending;
    expect(error).toMatchObject({
      _tag: "WorkerClosedError",
      name: "WorkerClosedError",
      message: "This document took too long to preview. Open it in another app.",
    });
    expect(error).toBeInstanceOf(Error);
    expectLocalized(error as Error);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(await client.call("open", null).catch((cause: unknown) => cause)).toBe(error);
  } finally {
    client.close();
    vi.useRealTimers();
  }
});

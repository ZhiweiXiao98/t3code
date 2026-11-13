import { describe, expect, it, vi } from "vite-plus/test";
import { FILE_TEXT_PREVIEW_MAX_BYTES, filePreviewErrorSource } from "@t3tools/shared/filePreview";
import { readFilePreviewResponse } from "./filePreview.ts";

describe("readFilePreviewResponse", () => {
  it("cancels a pending read when its preview closes", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      cancel() {
        cancelled = true;
      },
    });
    const result = readFilePreviewResponse(new Response(body), controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
  it.each([
    [{ ok: false, body: null }, "The file could not be loaded. Reconnect and try again."],
    [{ ok: true, body: null }, "Streaming file previews are unavailable in this runtime."],
    [
      new Response(new Uint8Array([0])),
      "This file contains binary data and cannot be shown as text.",
    ],
    [
      new Response(new Uint8Array([0xff])),
      "This file is not UTF-8 text. Open it in another app to view its contents.",
    ],
  ])("formats only the owned response failure: %s", async (response, source) => {
    const translate = vi.fn((message: string) => `localized: ${message}`);
    const result = readFilePreviewResponse(response, new AbortController().signal, translate);
    await expect(result).rejects.toThrow(`localized: ${source}`);
    const error = await result.catch((cause: unknown) => cause);
    expect(filePreviewErrorSource(error)).toBe(source);
    expect(translate).toHaveBeenCalledExactlyOnceWith(source);
  });

  it("does not classify a stream error by its text", async () => {
    const error = new Error("The file could not be loaded. Reconnect and try again.");
    const translate = vi.fn((message: string) => `localized: ${message}`);
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.error(error);
      },
    });
    await expect(
      readFilePreviewResponse({ ok: true, body }, new AbortController().signal, translate),
    ).rejects.toBe(error);
    expect(translate).not.toHaveBeenCalled();
    expect(filePreviewErrorSource(error)).toBeUndefined();
  });

  it("formats owned cancellation without reading the response body", async () => {
    const controller = new AbortController();
    controller.abort();
    const translate = vi.fn((message: string) => `localized: ${message}`);
    await expect(
      readFilePreviewResponse(new Response("unread"), controller.signal, translate),
    ).rejects.toThrow("localized: Preview cancelled.");
    expect(translate).toHaveBeenCalledExactlyOnceWith("Preview cancelled.");
  });

  it("supports native AbortSignal implementations without throwIfAborted", async () => {
    const signal = new AbortController().signal;
    Object.defineProperty(signal, "throwIfAborted", { value: undefined });
    await expect(readFilePreviewResponse(new Response("native text"), signal)).resolves.toEqual({
      text: "native text",
      truncated: false,
    });
  });

  it("stops consuming an unbounded response and cancels its stream", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        controller.enqueue(new Uint8Array(FILE_TEXT_PREVIEW_MAX_BYTES).fill(97));
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = await readFilePreviewResponse(new Response(body), new AbortController().signal);
    expect(result.text.length).toBe(FILE_TEXT_PREVIEW_MAX_BYTES);
    expect(result.truncated).toBe(true);
    expect(cancelled).toBe(true);
  });
});

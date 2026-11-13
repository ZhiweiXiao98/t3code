import { afterEach, expect, it, vi } from "vite-plus/test";
import { readTextFromClipboard, writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { clipboardErrorMessage } from "./clipboardErrorMessages";

afterEach(() => vi.unstubAllGlobals());

it.each(["read", "write"] as const)(
  "localizes actual %s failures, keeping target and original cause literal",
  async (operation) => {
    const cause = new Error("opaque /path/{0}/$&\nClipboard failure");
    const target = "opaque/{target}/$&\nname";
    const call = vi.fn().mockRejectedValue(cause);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText: call, readText: call } });
    const error = await (
      operation === "read"
        ? readTextFromClipboard(target)
        : writeTextToClipboard("literal content", target)
    ).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty("cause", cause);
    const english =
      operation === "read"
        ? `Failed to read ${target} from the clipboard.`
        : `Failed to copy ${target} to the clipboard.`;
    expect(clipboardErrorMessage(error, "en")).toBe(english);
    expect(clipboardErrorMessage(error, "zh-CN")).toBe(
      operation === "read" ? `无法从剪贴板读取 ${target}。` : `无法将 ${target} 复制到剪贴板。`,
    );
    expect(clipboardErrorMessage(error, "en")).toBe(english);
    expect(error).toHaveProperty("message", english);
    if (operation === "write") expect(call).toHaveBeenCalledExactlyOnceWith("literal content");
    else expect(call).toHaveBeenCalledOnce();
    const foreign = Object.assign(new Error(english), {
      _tag: operation === "read" ? "ClipboardReadError" : "ClipboardWriteError",
      target,
      cause,
    });
    expect(clipboardErrorMessage(foreign, "zh-CN")).toBe(english);
    expect(clipboardErrorMessage(new Error(""), "zh-CN")).toBe("");
  },
);

it.each(["read", "write"] as const)(
  "localizes the actual unavailable %s API without changing the missing-API behavior",
  async (operation) => {
    vi.stubGlobal("window", undefined);
    const target = "text/{opaque}";
    const error = await (
      operation === "read" ? readTextFromClipboard(target) : writeTextToClipboard("literal", target)
    ).catch((failure: unknown) => failure);
    const english = `Clipboard API is unavailable while ${operation === "read" ? "reading" : "copying"} ${target}.`;
    expect(clipboardErrorMessage(error, "en")).toBe(english);
    expect(clipboardErrorMessage(error, "zh-CN")).toBe(
      `${operation === "read" ? "读取" : "复制"} ${target} 时剪贴板 API 不可用。`,
    );
    expect(error).toHaveProperty("message", english);
  },
);

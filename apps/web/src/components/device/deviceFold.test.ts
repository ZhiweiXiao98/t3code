import { expect, it, vi } from "vite-plus/test";
import {
  AndroidFoldError,
  androidFoldFailureMessage,
  readAndroidFold,
  setAndroidFold,
} from "./deviceFold";

const access = {
  httpBase: "https://example.test/hub",
  wsBase: "wss://example.test/hub",
  query: { ticket: "opaque/{token}/$&" },
  credentials: false,
};
it("localizes only locally constructed HTTP/validation failures and preserves request inputs", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  try {
    for (const payload of [
      null,
      {},
      { ok: true, fold: { supported: true, posture: "unknown", hingeAngle: null } },
    ]) {
      fetch.mockResolvedValueOnce(Response.json(payload));
      const error = await readAndroidFold(access, "device/{id}/$&", signal).catch(
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(Error);
      expect(androidFoldFailureMessage("zh-CN", error as Error)).toBe("Android 折叠响应格式异常。");
      expect((error as Error).message).toBe("Unexpected Android fold response.");
    }
    fetch.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    const own = await setAndroidFold(access, "device/{id}/$&", "closed", signal).catch(
      (cause: unknown) => cause,
    );
    expect(own).toBeInstanceOf(AndroidFoldError);
    expect(own).toMatchObject({
      _tag: "AndroidFoldError",
      status: 503,
      message: "Fold command failed (503).",
    });
    expect(androidFoldFailureMessage("en", own as Error)).toBe("Fold command failed (503).");
    expect(androidFoldFailureMessage("zh-CN", own as Error)).toBe("折叠命令失败（503）。");
    expect(androidFoldFailureMessage("en", own as Error)).toBe("Fold command failed (503).");
    const [url, init] = fetch.mock.calls.at(-1)!;
    expect(new URL(String(url)).searchParams.get("device")).toBe("device/{id}/$&");
    expect(new URL(String(url)).searchParams.get("ticket")).toBe(access.query.ticket);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      body: '{"posture":"closed"}',
      signal,
    });
    for (const message of [
      "Fold command failed (503).",
      "Unexpected Android fold response.",
      "",
      "opaque/{error}/$&",
    ]) {
      fetch.mockResolvedValueOnce(Response.json({ error: message }, { status: 503 }));
      const external = await setAndroidFold(access, "device", "opened").catch(
        (cause: unknown) => cause,
      );
      expect(androidFoldFailureMessage("zh-CN", external as Error)).toBe(message);
      expect(external).toMatchObject({ _tag: "AndroidFoldError", status: 503, message });
    }
    const external = Object.assign(new Error("Unexpected Android fold response."), {
      source: "invalid",
      _tag: "AndroidFoldError",
      status: 503,
    });
    fetch.mockRejectedValueOnce(external);
    expect(await readAndroidFold(access, "device").catch((cause: unknown) => cause)).toBe(external);
    expect(androidFoldFailureMessage("zh-CN", external)).toBe(external.message);
    const fold = { supported: true, posture: "opened", hingeAngle: 180 };
    fetch.mockResolvedValueOnce(Response.json({ ok: true, fold }));
    expect(await readAndroidFold({ ...access, credentials: true }, "device")).toEqual(fold);
    expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: "GET", credentials: "include" });
  } finally {
    vi.unstubAllGlobals();
  }
});
